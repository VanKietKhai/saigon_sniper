"""Independent local Ground Truth Labeler scaffold.

This module intentionally provides no image loading, annotation persistence,
scoring, or automated computer-vision behavior in R1.3D.1.
"""

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .manifest import (
    SourceManifest,
    SourceNotFoundError,
    dataset_root_from_environment,
)
from .ellipse import EllipseFitError, calibration_stability, ellipse_point_residuals, fit_human_calibration_ellipse, fit_human_hole_ellipse
from .derivation import DerivationError, derive_provisional_result, load_frozen_reference
from .annotations import AnnotationError, DuplicateAnnotationError, append_annotation, list_saved_annotations


LABELER_ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = LABELER_ROOT.parent / "rifle_source_manifest.csv"
REFERENCE_RULES_PATH = LABELER_ROOT.parent / "reference_rules.json"
source_manifest = SourceManifest.load(MANIFEST_PATH)
with REFERENCE_RULES_PATH.open(encoding="utf-8") as reference_rules_file:
    reference_rules = json.load(reference_rules_file)
frozen_reference = load_frozen_reference(REFERENCE_RULES_PATH)
app = FastAPI(title="Saigon Sniper Ground Truth Labeler", version="v1")
app.mount(
    "/static",
    StaticFiles(directory=LABELER_ROOT / "static"),
    name="static",
)


class CalibrationPoint(BaseModel):
    x_px: float
    y_px: float


class CalibrationFitRequest(BaseModel):
    points: list[CalibrationPoint]


class DeriveRequest(BaseModel):
    source_id: str
    calibration_points: list[CalibrationPoint]
    hole_boundary_points: list[CalibrationPoint]


class AnnotationRequest(BaseModel):
    source_id: str
    annotation_pass: str
    labeler_id: str
    calibration_points: list[CalibrationPoint]
    hole_boundary_points: list[CalibrationPoint]
    perspective_status: str | None = None
    label_quality: str | None = None
    target_label_quality: str | None = None
    hole_label_quality: str | None = None
    target_center_method: str | None = None
    hole_center_method: str | None = None
    notes: str = ""


@app.get("/health")
async def health() -> dict[str, object]:
    """Return availability without scanning or hashing source images."""
    return {
        "status": "ground_truth_labeler",
        "version": "v1",
        "manifest_loaded": True,
        "manifest_record_count": source_manifest.record_count,
        "dataset_configured": dataset_root_from_environment() is not None,
    }


@app.get("/api/calibration/reference")
async def calibration_reference() -> dict[str, object]:
    """Return only frozen calibration metadata; no image or model data."""
    calibration = reference_rules["labeler_calibration"]
    return {
        "rule_set_id": reference_rules["rule_set_id"],
        "reference": calibration["reference"],
        "reference_diameter_mm": calibration["reference_diameter_mm"],
        "points_min": calibration["points_min"],
        "points_max": calibration["points_max"],
    }


@app.post("/api/calibration/fit")
async def fit_calibration(request: CalibrationFitRequest) -> dict[str, object]:
    """Fit an ellipse only to the browser-supplied human point geometry."""
    try:
        fitted = fit_human_calibration_ellipse(
            [point.model_dump() if hasattr(point, "model_dump") else point.dict() for point in request.points]
        )
    except EllipseFitError as error:
        raise HTTPException(
            status_code=422,
            detail={"status": "invalid_calibration_points", "message": str(error)},
        ) from error
    points = [point.model_dump() if hasattr(point, "model_dump") else point.dict() for point in request.points]
    return {"status": "fitted", "ellipse": fitted.public(), "point_residuals_px": ellipse_point_residuals(points, fitted), "stability": calibration_stability(points, fitted).public()}


@app.post("/api/hole-ellipse/fit")
async def fit_hole_ellipse(request: CalibrationFitRequest) -> dict[str, object]:
    """Fit exactly eight browser-supplied human hole-boundary points."""
    try:
        fitted = fit_human_hole_ellipse(
            [point.model_dump() if hasattr(point, "model_dump") else point.dict() for point in request.points]
        )
    except EllipseFitError as error:
        raise HTTPException(
            status_code=422,
            detail={"status": "invalid_hole_boundary_points", "message": str(error)},
        ) from error
    points = [point.model_dump() if hasattr(point, "model_dump") else point.dict() for point in request.points]
    return {
        "status": "fitted",
        "ellipse": fitted.public(), "point_residuals_px": ellipse_point_residuals(points, fitted, "Hole boundary"),
        "stability": calibration_stability(points, fitted, "Hole boundary").public(),
    }


@app.post("/api/derive")
async def derive_score(request: DeriveRequest) -> dict[str, object]:
    """Derive a provisional score only from submitted human geometry."""
    try:
        source_manifest.record_for(request.source_id)
        fitted = fit_human_calibration_ellipse(
            [point.model_dump() if hasattr(point, "model_dump") else point.dict() for point in request.calibration_points]
        )
        hole_ellipse = fit_human_hole_ellipse(
            [point.model_dump() if hasattr(point, "model_dump") else point.dict() for point in request.hole_boundary_points]
        )
        target_center = {"x_px": fitted.center_x_px, "y_px": fitted.center_y_px}
        hole_center = {"x_px": hole_ellipse.center_x_px, "y_px": hole_ellipse.center_y_px}
        result = derive_provisional_result(request.source_id, fitted, hole_center, frozen_reference, target_center)
    except SourceNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail={"status": "source_not_found", "source_id": request.source_id},
        ) from error
    except (EllipseFitError, DerivationError) as error:
        raise HTTPException(
            status_code=422,
            detail={"status": "invalid_human_geometry", "message": str(error)},
        ) from error
    return {"status": "derived_provisional", "result": result.public(), "hole_ellipse": hole_ellipse.public()}


@app.post("/api/annotations", status_code=201)
async def save_annotation(request: AnnotationRequest) -> dict[str, object]:
    """Append one independently human-created pass; never update existing rows."""
    payload = request.model_dump() if hasattr(request, "model_dump") else request.dict()
    try:
        saved = append_annotation(payload, source_manifest, frozen_reference)
    except DuplicateAnnotationError as error:
        raise HTTPException(status_code=409, detail={"status": str(error)}) from error
    except (AnnotationError, SourceNotFoundError, EllipseFitError, DerivationError) as error:
        raise HTTPException(status_code=422, detail={"status": str(error)}) from error
    return {"status": "annotation_appended", **saved}


@app.get("/api/annotations/saved")
async def saved_annotations() -> dict[str, object]:
    """Read-only completion metadata; never creates or rewrites storage."""
    return {"items": list_saved_annotations()}


@app.get("/", response_class=FileResponse)
async def root() -> FileResponse:
    """Serve the static scaffold UI."""
    return FileResponse(LABELER_ROOT / "templates" / "index.html")


@app.get("/api/sources")
async def list_sources(image_format: str | None = None) -> dict[str, object]:
    """Return manifest metadata only; no local dataset path is exposed."""
    sources = source_manifest.all_metadata(image_format)
    return {"record_count": len(sources), "sources": sources}


@app.get("/api/sources/{source_id}")
async def source_detail(source_id: str) -> dict[str, object]:
    """Return one manifest record with its current on-demand identity state."""
    try:
        metadata = source_manifest.metadata_for(source_id)
        identity = source_manifest.verify_source(
            source_id, dataset_root_from_environment()
        )
    except SourceNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail={"status": "source_not_found", "source_id": source_id},
        ) from error
    return {"source": metadata, "identity": identity.public()}


@app.get("/api/sources/{source_id}/image")
async def source_image(source_id: str) -> FileResponse:
    """Serve only a manifest-verified supported image file."""
    try:
        metadata = source_manifest.metadata_for(source_id)
        identity = source_manifest.verify_source(
            source_id, dataset_root_from_environment()
        )
    except SourceNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail={"status": "source_not_found", "source_id": source_id},
        ) from error

    error_statuses = {
        "dataset_not_configured": 503,
        "unsupported_format": 415,
        "file_missing": 404,
        "hash_mismatch": 409,
        "unsafe_path": 400,
    }
    if identity.status != "verified":
        raise HTTPException(status_code=error_statuses[identity.status], detail=identity.public())
    return FileResponse(
        identity.path,
        media_type="image/jpeg",
        filename=metadata["original_filename"],
    )
