"""Append-only storage for cardinal-target and ellipse-hole annotations."""
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
from .ellipse import (ellipse_point_residuals, fit_human_calibration_ellipse, fit_human_hole_ellipse,
                      opposite_pair_midpoint_diagnostics, require_cardinal_projective_center, require_hole_cardinal_center)
from .manifest import SourceManifest, dataset_root_from_environment

ANNOTATIONS_PATH_ENV = "SAIGON_SNIPER_ANNOTATIONS_PATH"
DEFAULT_ANNOTATIONS_PATH = Path(__file__).resolve().parent.parent / "annotations" / "ground_truth_annotations.csv"
SOFTWARE_VERSION = "ground_truth_labeler_r1.3e.1e"
FIELDNAMES = (
    "schema_version", "annotation_id", "source_id", "image_sha256", "annotation_pass", "labeler_id",
    "annotation_timestamp_utc", "rule_set_id", "software_version", "image_width_px", "image_height_px",
    "target_anchor_points", "target_boundary_points", "target_ellipse_center_x_px", "target_ellipse_center_y_px", "target_ellipse_radius_major_px", "target_ellipse_radius_minor_px", "target_ellipse_angle_deg", "target_ellipse_rms_residual_px", "bull_center_x_px", "bull_center_y_px", "target_center_method",
    "target_label_quality", "hole_center_method", "hole_anchor_points", "hole_final_diagonal_points",
    "hole_center_x_px", "hole_center_y_px", "hole_boundary_points", "hole_point_residuals_px",
    "hole_midpoint_rms_px", "hole_midpoint_max_px", "hole_pair_midpoint_deviations",
    "hole_ellipse_center_x_px", "hole_ellipse_center_y_px", "hole_ellipse_radius_major_px",
    "hole_ellipse_radius_minor_px", "hole_ellipse_angle_deg", "hole_ellipse_rms_residual_px",
    "hole_ellipse_max_residual_px", "hole_label_quality", "center_distance_mm", "derived_score_tenths", "review_status", "notes",
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


def _legacy_header(path: Path) -> bool:
    with path.open(newline="", encoding="utf-8") as file:
        return tuple(csv.DictReader(file).fieldnames or ()) != FIELDNAMES


def _assert_hole_in_bounds(points: Sequence[Mapping[str, object]], width: int, height: int) -> None:
    for point in points:
        try: x, y = float(point["x_px"]), float(point["y_px"])
        except (KeyError, TypeError, ValueError) as error: raise AnnotationError("Hole boundary points are invalid.") from error
        if not math.isfinite(x) or not math.isfinite(y) or not (0 <= x < width and 0 <= y < height):
            raise AnnotationError("Hole boundary point is outside the image.")


def list_saved_annotations() -> list[dict[str, object]]:
    path = annotations_path()
    if not path.exists(): return []
    with path.open(newline="", encoding="utf-8") as file:
        return [{"annotation_id": row.get("annotation_id"), "source_id": row.get("source_id"), "annotation_pass": row.get("annotation_pass"),
                 "labeler_id": row.get("labeler_id"), "saved_at": row.get("annotation_timestamp_utc")}
                for row in csv.DictReader(file) if row.get("annotation_pass") in {"A", "B"}]


def saved_annotation(annotation_id: str) -> dict[str, object]:
    """Return one stored annotation for read-only TEMP reload; never alter it."""
    path = annotations_path()
    if not path.exists():
        raise AnnotationError("annotation_not_found")
    with path.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            if row.get("annotation_id") == annotation_id:
                return {
                    "annotation_id": row["annotation_id"], "source_id": row["source_id"],
                    "annotation_pass": row["annotation_pass"], "labeler_id": row["labeler_id"],
                    "calibration_points": json.loads(row["target_boundary_points"]),
                    "hole_boundary_points": json.loads(row["hole_boundary_points"]),
                    "target_label_quality": row["target_label_quality"],
                    "hole_label_quality": row["hole_label_quality"], "notes": row["notes"],
                }
    raise AnnotationError("annotation_not_found")


def append_annotation(payload: Mapping[str, object], manifest: SourceManifest, reference: FrozenReference) -> dict[str, object]:
    source_id, annotation_pass = str(payload.get("source_id", "")), str(payload.get("annotation_pass", ""))
    labeler_id, notes = str(payload.get("labeler_id", "")).strip(), str(payload.get("notes", "")).strip()
    if annotation_pass not in {"A", "B"}: raise AnnotationError("annotation_pass must be A or B.")
    if not labeler_id or len(labeler_id) > 128: raise AnnotationError("labeler_id is required.")
    if len(notes) > 2000: raise AnnotationError("Notes are too long.")
    quality_values = {"good", "usable", "ambiguous", "poor"}
    target_quality, hole_quality = payload.get("target_label_quality"), payload.get("hole_label_quality")
    if target_quality not in quality_values or hole_quality not in quality_values:
        raise AnnotationError("target_label_quality and hole_label_quality are required.")
    record = manifest.record_for(source_id)
    identity = manifest.verify_source(source_id, dataset_root_from_environment())
    if identity.status != "verified": raise AnnotationError(identity.status)
    target_anchors = _points(payload.get("calibration_points"), "Target anchors")
    if len(target_anchors) != 8: raise AnnotationError("eight_target_boundary_points_are_required")
    calibration = fit_human_calibration_ellipse(target_anchors)
    target_center = require_cardinal_projective_center(target_anchors, calibration)
    hole_boundary_points = _points(payload.get("hole_boundary_points"), "Hole boundary points")
    if len(hole_boundary_points) != 8: raise AnnotationError("eight_hole_boundary_points_are_required")
    _assert_hole_in_bounds(hole_boundary_points, int(record["width_px"]), int(record["height_px"]))
    hole = fit_human_hole_ellipse(hole_boundary_points)
    hole_cardinal = require_hole_cardinal_center(hole_boundary_points[:4], hole)
    hole_residuals = ellipse_point_residuals(hole_boundary_points, hole, "Hole boundary")
    hole_midpoints = opposite_pair_midpoint_diagnostics(hole_boundary_points, hole, "Hole boundary")
    result = derive_provisional_result(source_id, calibration, {"x_px": hole_cardinal.cardinal_center_x_px, "y_px": hole_cardinal.cardinal_center_y_px}, reference, {"x_px": target_center.cardinal_center_x_px, "y_px": target_center.cardinal_center_y_px})
    row = {
        "schema_version": "2.7", "annotation_id": str(uuid.uuid4()), "source_id": source_id,
        "image_sha256": record["image_sha256"], "annotation_pass": annotation_pass, "labeler_id": labeler_id,
        "annotation_timestamp_utc": datetime.now(timezone.utc).isoformat(), "rule_set_id": reference.rule_set_id,
        "software_version": SOFTWARE_VERSION, "image_width_px": int(record["width_px"]), "image_height_px": int(record["height_px"]),
        "target_anchor_points": json.dumps(target_anchors[:4], separators=(",", ":")), "target_boundary_points": json.dumps(target_anchors, separators=(",", ":")),
        "target_ellipse_center_x_px": calibration.center_x_px, "target_ellipse_center_y_px": calibration.center_y_px,
        "target_ellipse_radius_major_px": calibration.radius_major_px, "target_ellipse_radius_minor_px": calibration.radius_minor_px,
        "target_ellipse_angle_deg": calibration.rotation_deg, "target_ellipse_rms_residual_px": calibration.calibration_fit_residual_px,
        "bull_center_x_px": target_center.cardinal_center_x_px, "bull_center_y_px": target_center.cardinal_center_y_px,
        "target_center_method": "cardinal_diameter_intersection_v1", "target_label_quality": target_quality,
        "hole_center_method": "cardinal_diameter_intersection_v1", "hole_anchor_points": json.dumps(hole_boundary_points[:4], separators=(",", ":")),
        "hole_final_diagonal_points": json.dumps(hole_boundary_points[4:], separators=(",", ":")),
        "hole_center_x_px": hole_cardinal.cardinal_center_x_px, "hole_center_y_px": hole_cardinal.cardinal_center_y_px,
        "hole_boundary_points": json.dumps(hole_boundary_points, separators=(",", ":")),
        "hole_point_residuals_px": json.dumps(hole_residuals, separators=(",", ":")),
        "hole_midpoint_rms_px": hole_midpoints.midpoint_rms_px, "hole_midpoint_max_px": hole_midpoints.midpoint_max_px,
        "hole_pair_midpoint_deviations": json.dumps(hole_midpoints.public()["pairs"], separators=(",", ":")),
        "hole_ellipse_center_x_px": hole.center_x_px, "hole_ellipse_center_y_px": hole.center_y_px,
        "hole_ellipse_radius_major_px": hole.radius_major_px, "hole_ellipse_radius_minor_px": hole.radius_minor_px,
        "hole_ellipse_angle_deg": hole.rotation_deg, "hole_ellipse_rms_residual_px": hole.hole_ellipse_rms_residual_px,
        "hole_ellipse_max_residual_px": hole.hole_ellipse_max_residual_px,
        "hole_label_quality": hole_quality, "center_distance_mm": result.center_distance_mm, "derived_score_tenths": result.provisional_score_tenths, "review_status": "unreviewed", "notes": notes,
    }
    path = annotations_path()
    with _LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        exists = path.exists()
        if exists and _legacy_header(path): raise AnnotationError("legacy_annotation_storage_requires_new_pilot_file")
        if exists:
            with path.open(newline="", encoding="utf-8") as file: existing_rows = list(csv.DictReader(file))
            if any(existing["source_id"] == source_id and existing["labeler_id"] == labeler_id and existing["annotation_pass"] == annotation_pass for existing in existing_rows):
                raise DuplicateAnnotationError("duplicate_annotation_pass")
        with path.open("a", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDNAMES)
            if not exists: writer.writeheader()
            writer.writerow(row); file.flush(); os.fsync(file.fileno())
    return {"annotation_id": row["annotation_id"], "review_status": "unreviewed", "hole_center_method": row["hole_center_method"], "target_center_method": row["target_center_method"]}
