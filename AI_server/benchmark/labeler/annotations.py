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
from .ellipse import fit_human_calibration_ellipse
from .manifest import SourceManifest, dataset_root_from_environment

ANNOTATIONS_PATH_ENV = "SAIGON_SNIPER_ANNOTATIONS_PATH"
DEFAULT_ANNOTATIONS_PATH = Path(__file__).resolve().parent.parent / "annotations" / "ground_truth_annotations.csv"
SOFTWARE_VERSION = "ground_truth_labeler_r1.3d.7"
FIELDNAMES = ("schema_version", "annotation_id", "source_id", "image_sha256", "annotation_pass", "labeler_id", "annotation_timestamp_utc", "rule_set_id", "software_version", "image_width_px", "image_height_px", "calibration_method", "calibration_reference_diameter_mm", "calibration_points", "calibration_center_x_px", "calibration_center_y_px", "calibration_radius_x_px", "calibration_radius_y_px", "calibration_rotation_deg", "calibration_fit_residual_px", "bull_center_x_px", "bull_center_y_px", "manual_visual_bull_center_x_px", "manual_visual_bull_center_y_px", "hole_center_x_px", "hole_center_y_px", "hole_boundary_points", "center_distance_px", "center_distance_mm", "mm_per_pixel_x", "mm_per_pixel_y", "perspective_status", "label_quality", "review_status", "derived_score_tenths", "notes")
_LOCK = threading.Lock()

class AnnotationError(ValueError): pass
class DuplicateAnnotationError(AnnotationError): pass

def annotations_path() -> Path:
    return Path(os.environ.get(ANNOTATIONS_PATH_ENV, DEFAULT_ANNOTATIONS_PATH))

def _point(value: Mapping[str, object]) -> tuple[float, float]:
    try: x, y = float(value["x_px"]), float(value["y_px"])
    except (KeyError, TypeError, ValueError) as error: raise AnnotationError("Hole center is invalid.") from error
    if not math.isfinite(x) or not math.isfinite(y) or x < 0 or y < 0: raise AnnotationError("Hole center is invalid.")
    return x, y

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
    points = payload.get("calibration_points")
    if not isinstance(points, Sequence) or isinstance(points, (str, bytes)): raise AnnotationError("Calibration points are invalid.")
    ellipse = fit_human_calibration_ellipse(points)
    hole_x, hole_y = _point(payload.get("hole_center", {}))
    if hole_x >= int(record["width_px"]) or hole_y >= int(record["height_px"]): raise AnnotationError("Hole center is outside the image.")
    result = derive_provisional_result(source_id, ellipse, {"x_px": hole_x, "y_px": hole_y}, reference)
    path = annotations_path()
    row = {"schema_version":"1.0", "annotation_id":str(uuid.uuid4()), "source_id":source_id, "image_sha256":record["image_sha256"], "annotation_pass":annotation_pass, "labeler_id":labeler_id, "annotation_timestamp_utc":datetime.now(timezone.utc).isoformat(), "rule_set_id":reference.rule_set_id, "software_version":SOFTWARE_VERSION, "image_width_px":int(record["width_px"]), "image_height_px":int(record["height_px"]), "calibration_method":"human_selected_points_then_ellipse_fit", "calibration_reference_diameter_mm":reference.calibration_radius_mm*2, "calibration_points":json.dumps(points,separators=(",",":")), "calibration_center_x_px":ellipse.center_x_px, "calibration_center_y_px":ellipse.center_y_px, "calibration_radius_x_px":ellipse.radius_major_px, "calibration_radius_y_px":ellipse.radius_minor_px, "calibration_rotation_deg":ellipse.rotation_deg, "calibration_fit_residual_px":ellipse.calibration_fit_residual_px, "bull_center_x_px":ellipse.bull_center_x_px, "bull_center_y_px":ellipse.bull_center_y_px, "manual_visual_bull_center_x_px":None, "manual_visual_bull_center_y_px":None, "hole_center_x_px":hole_x, "hole_center_y_px":hole_y, "hole_boundary_points":json.dumps(payload.get("hole_boundary_points"),separators=(",",":")), "center_distance_px":math.hypot(hole_x-ellipse.center_x_px,hole_y-ellipse.center_y_px), "center_distance_mm":result.center_distance_mm, "mm_per_pixel_x":result.mm_per_px_major, "mm_per_pixel_y":result.mm_per_px_minor, "perspective_status":payload["perspective_status"], "label_quality":payload["label_quality"], "review_status":"unreviewed", "derived_score_tenths":result.provisional_score_tenths, "notes":notes}
    with _LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        exists = path.exists()
        if exists:
            with path.open(newline="", encoding="utf-8") as file:
                if any(existing["source_id"] == source_id and existing["labeler_id"] == labeler_id and existing["annotation_pass"] == annotation_pass for existing in csv.DictReader(file)): raise DuplicateAnnotationError("duplicate_annotation_pass")
        with path.open("a", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDNAMES)
            if not exists: writer.writeheader()
            writer.writerow(row); file.flush(); os.fsync(file.fileno())
    return {"annotation_id":row["annotation_id"], "derived_score_tenths":row["derived_score_tenths"], "review_status":"unreviewed"}
