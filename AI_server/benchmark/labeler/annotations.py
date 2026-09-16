"""Local append-only storage for independently human-created annotation passes."""
from __future__ import annotations

import csv
import json
import math
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Sequence

from .derivation import FrozenReference, derive_provisional_result
from .ellipse import fit_human_calibration_ellipse, fit_human_hole_ellipse
from .manifest import SourceManifest, dataset_root_from_environment

ANNOTATIONS_PATH_ENV = "SAIGON_SNIPER_ANNOTATIONS_PATH"
DEFAULT_ANNOTATIONS_PATH = Path(__file__).resolve().parent.parent / "annotations" / "ground_truth_annotations.csv"
SOFTWARE_VERSION = "ground_truth_labeler_r1.3e.1b"
FIELDNAMES = (
    "schema_version", "annotation_id", "source_id", "image_sha256", "annotation_pass", "labeler_id", "annotation_timestamp_utc", "rule_set_id", "software_version", "image_width_px", "image_height_px", "calibration_method", "calibration_reference_diameter_mm", "calibration_points", "calibration_center_x_px", "calibration_center_y_px", "calibration_radius_x_px", "calibration_radius_y_px", "calibration_rotation_deg", "calibration_fit_residual_px", "bull_center_x_px", "bull_center_y_px", "manual_visual_bull_center_x_px", "manual_visual_bull_center_y_px", "hole_center_method", "hole_center_x_px", "hole_center_y_px", "hole_boundary_points", "hole_ellipse_center_x_px", "hole_ellipse_center_y_px", "hole_ellipse_radius_major_px", "hole_ellipse_radius_minor_px", "hole_ellipse_angle_deg", "hole_ellipse_rms_residual_px", "hole_ellipse_max_residual_px", "center_distance_px", "center_distance_mm", "mm_per_pixel_x", "mm_per_pixel_y", "perspective_status", "label_quality", "review_status", "derived_score_tenths", "notes",
)
_LOCK = threading.Lock()


class AnnotationError(ValueError): pass
class DuplicateAnnotationError(AnnotationError): pass


def annotations_path() -> Path:
    return Path(os.environ.get(ANNOTATIONS_PATH_ENV, DEFAULT_ANNOTATIONS_PATH))


def _points(value: object, name: str) -> Sequence[Mapping[str, object]]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise AnnotationError(f"{name} are invalid.")
    return value


def _assert_hole_in_bounds(points: Sequence[Mapping[str, object]], width: int, height: int) -> None:
    for point in points:
        try: x, y = float(point["x_px"]), float(point["y_px"])
        except (KeyError, TypeError, ValueError) as error: raise AnnotationError("Hole boundary points are invalid.") from error
        if not math.isfinite(x) or not math.isfinite(y) or not (0 <= x < width and 0 <= y < height):
            raise AnnotationError("Hole boundary point is outside the image.")


def _legacy_header(path: Path) -> bool:
    with path.open(newline="", encoding="utf-8") as file:
        return tuple(csv.DictReader(file).fieldnames or ()) != FIELDNAMES


def append_annotation(payload: Mapping[str, object], manifest: SourceManifest, reference: FrozenReference) -> dict[str, object]:
    source_id, annotation_pass = str(payload.get("source_id", "")), str(payload.get("annotation_pass", ""))
    labeler_id, notes = str(payload.get("labeler_id", "")).strip(), str(payload.get("notes", "")).strip()
    if annotation_pass not in {"A", "B"}: raise AnnotationError("annotation_pass must be A or B.")
    if not labeler_id or len(labeler_id) > 128: raise AnnotationError("labeler_id is required.")
    if len(notes) > 2000: raise AnnotationError("Notes are too long.")
    if payload.get("perspective_status") not in {"circular", "elliptical_moderate", "extreme_needs_review", "excluded"}: raise AnnotationError("perspective_status is invalid.")
    if payload.get("label_quality") not in {"good", "usable", "ambiguous", "poor"}: raise AnnotationError("label_quality is invalid.")
    record = manifest.record_for(source_id)
    identity = manifest.verify_source(source_id, dataset_root_from_environment())
    if identity.status != "verified": raise AnnotationError(identity.status)
    calibration_points = _points(payload.get("calibration_points"), "Calibration points")
    hole_boundary_points = _points(payload.get("hole_boundary_points"), "Hole boundary points")
    calibration = fit_human_calibration_ellipse(calibration_points)
    width, height = int(record["width_px"]), int(record["height_px"])
    _assert_hole_in_bounds(hole_boundary_points, width, height)
    hole = fit_human_hole_ellipse(hole_boundary_points)
    result = derive_provisional_result(source_id, calibration, {"x_px": hole.center_x_px, "y_px": hole.center_y_px}, reference)
    path = annotations_path()
    row = {"schema_version":"1.1", "annotation_id":str(uuid.uuid4()), "source_id":source_id, "image_sha256":record["image_sha256"], "annotation_pass":annotation_pass, "labeler_id":labeler_id, "annotation_timestamp_utc":datetime.now(timezone.utc).isoformat(), "rule_set_id":reference.rule_set_id, "software_version":SOFTWARE_VERSION, "image_width_px":width, "image_height_px":height, "calibration_method":"ring1_outer_8pt_v2", "calibration_reference_diameter_mm":reference.calibration_radius_mm*2, "calibration_points":json.dumps(calibration_points,separators=(",",":")), "calibration_center_x_px":calibration.center_x_px, "calibration_center_y_px":calibration.center_y_px, "calibration_radius_x_px":calibration.radius_major_px, "calibration_radius_y_px":calibration.radius_minor_px, "calibration_rotation_deg":calibration.rotation_deg, "calibration_fit_residual_px":calibration.calibration_fit_residual_px, "bull_center_x_px":calibration.bull_center_x_px, "bull_center_y_px":calibration.bull_center_y_px, "manual_visual_bull_center_x_px":None, "manual_visual_bull_center_y_px":None, "hole_center_method":"ellipse_8pt_v2", "hole_center_x_px":hole.center_x_px, "hole_center_y_px":hole.center_y_px, "hole_boundary_points":json.dumps(hole_boundary_points,separators=(",",":")), "hole_ellipse_center_x_px":hole.center_x_px, "hole_ellipse_center_y_px":hole.center_y_px, "hole_ellipse_radius_major_px":hole.radius_major_px, "hole_ellipse_radius_minor_px":hole.radius_minor_px, "hole_ellipse_angle_deg":hole.rotation_deg, "hole_ellipse_rms_residual_px":hole.hole_ellipse_rms_residual_px, "hole_ellipse_max_residual_px":hole.hole_ellipse_max_residual_px, "center_distance_px":math.hypot(hole.center_x_px-calibration.center_x_px,hole.center_y_px-calibration.center_y_px), "center_distance_mm":result.center_distance_mm, "mm_per_pixel_x":result.mm_per_px_major, "mm_per_pixel_y":result.mm_per_px_minor, "perspective_status":payload["perspective_status"], "label_quality":payload["label_quality"], "review_status":"unreviewed", "derived_score_tenths":result.provisional_score_tenths, "notes":notes}
    with _LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        exists = path.exists()
        if exists and _legacy_header(path): raise AnnotationError("legacy_annotation_storage_requires_new_pilot_file")
        if exists:
            with path.open(newline="", encoding="utf-8") as file:
                existing_rows = list(csv.DictReader(file))
            if any(existing.get("calibration_method") != "ring1_outer_8pt_v2" for existing in existing_rows):
                raise AnnotationError("historical_calibration_storage_requires_new_pilot_file")
            if any(existing["source_id"] == source_id and existing["labeler_id"] == labeler_id and existing["annotation_pass"] == annotation_pass for existing in existing_rows): raise DuplicateAnnotationError("duplicate_annotation_pass")
        with path.open("a", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDNAMES)
            if not exists: writer.writeheader()
            writer.writerow(row); file.flush(); os.fsync(file.fileno())
    return {"annotation_id":row["annotation_id"], "derived_score_tenths":row["derived_score_tenths"], "review_status":"unreviewed", "hole_center_method":row["hole_center_method"]}
