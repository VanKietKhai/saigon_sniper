"""Independent human-geometry distance and provisional-score derivation."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import math
from pathlib import Path
from typing import Mapping

from .ellipse import EllipseFit


class DerivationError(ValueError):
    """Raised for invalid human geometry or inconsistent frozen reference rules."""


@dataclass(frozen=True)
class FrozenReference:
    rule_set_id: str
    calibration_radius_mm: float
    score_1_printed_radius_mm: float
    pellet_radius_mm: float
    max_valid_shot_center_radius_mm: float
    integer_ring_radial_spacing_mm: float
    decimal_step_mm: float
    maximum_score_tenths: int
    minimum_hit_score_tenths: int
    miss_score_tenths: int
    decimal_boundary_epsilon: float


@dataclass(frozen=True)
class DerivationResult:
    source_id: str
    rule_set_id: str
    target_center_x_px: float
    target_center_y_px: float
    hole_center_x_px: float
    hole_center_y_px: float
    radius_major_px: float
    radius_minor_px: float
    rotation_deg: float
    mm_per_px_major: float
    mm_per_px_minor: float
    center_distance_mm: float
    provisional_score_tenths: int

    @property
    def provisional_score(self) -> float:
        return self.provisional_score_tenths / 10

    @property
    def is_miss(self) -> bool:
        return self.provisional_score_tenths == 0

    def public(self) -> dict[str, object]:
        payload = asdict(self)
        payload["provisional_score"] = self.provisional_score
        payload["is_miss"] = self.is_miss
        return payload


def load_frozen_reference(reference_path: Path) -> FrozenReference:
    """Load only the committed benchmark rules and reject incoherent values."""
    with reference_path.open(encoding="utf-8") as reference_file:
        rules = json.load(reference_file)
    try:
        target = rules["printed_target"]
        projectile = rules["projectile"]
        scoring = rules["scoring_geometry"]
        boundary = rules["boundary_policy"]
        calibration = rules["labeler_calibration"]
        reference = FrozenReference(
            rule_set_id=str(rules["rule_set_id"]),
            calibration_radius_mm=float(calibration["reference_diameter_mm"]) / 2,
            score_1_printed_radius_mm=float(target["score_1_radius_mm"]),
            pellet_radius_mm=float(projectile["nominal_radius_mm"]),
            max_valid_shot_center_radius_mm=float(scoring["max_valid_shot_center_radius_mm"]),
            integer_ring_radial_spacing_mm=float(target["integer_ring_radial_spacing_mm"]),
            decimal_step_mm=float(scoring["decimal_step_mm"]),
            maximum_score_tenths=int(scoring["maximum_score_tenths"]),
            minimum_hit_score_tenths=int(scoring["minimum_hit_score_tenths"]),
            miss_score_tenths=int(scoring["miss_score_tenths"]),
            decimal_boundary_epsilon=float(boundary["epsilon"]),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise DerivationError("Frozen reference is missing required derivation values.") from error
    _validate_reference(reference)
    return reference


def _validate_reference(reference: FrozenReference) -> None:
    values = tuple(asdict(reference).values())
    if not all(math.isfinite(value) for value in values if isinstance(value, float)):
        raise DerivationError("Frozen reference contains non-finite values.")
    if reference.calibration_radius_mm <= 0 or reference.max_valid_shot_center_radius_mm <= 0:
        raise DerivationError("Frozen reference contains non-positive radii.")
    if not math.isclose(reference.calibration_radius_mm, reference.score_1_printed_radius_mm, abs_tol=1e-9):
        raise DerivationError("Labeler calibration must use the outer score-ring-1 radius.")
    if not math.isclose(
        reference.score_1_printed_radius_mm + reference.pellet_radius_mm,
        reference.max_valid_shot_center_radius_mm,
        abs_tol=1e-9,
    ):
        raise DerivationError("Frozen reference has inconsistent outer scoring radius.")
    if not math.isclose(
        reference.integer_ring_radial_spacing_mm / 10,
        reference.decimal_step_mm,
        abs_tol=1e-9,
    ):
        raise DerivationError("Frozen reference has inconsistent decimal interval.")


def affine_normalized_distance_mm(
    ellipse: EllipseFit, hole_center: Mapping[str, object], reference: FrozenReference
) -> tuple[float, float, float]:
    """Return affine-normalized distance and ellipse-local major/minor scales."""
    hole_x, hole_y = _validated_point(hole_center)
    values = (
        ellipse.center_x_px, ellipse.center_y_px, ellipse.radius_major_px,
        ellipse.radius_minor_px, ellipse.rotation_deg,
    )
    if not all(math.isfinite(value) for value in values):
        raise DerivationError("Ellipse geometry must be finite.")
    if ellipse.radius_major_px <= 0 or ellipse.radius_minor_px <= 0:
        raise DerivationError("Ellipse radii must be positive.")
    if not 0 <= ellipse.rotation_deg < 180:
        raise DerivationError("Ellipse rotation is invalid.")
    angle = math.radians(ellipse.rotation_deg)
    cosine, sine = math.cos(angle), math.sin(angle)
    delta_x = hole_x - ellipse.center_x_px
    delta_y = hole_y - ellipse.center_y_px
    local_major_px = cosine * delta_x + sine * delta_y
    local_minor_px = -sine * delta_x + cosine * delta_y
    mm_per_px_major = reference.calibration_radius_mm / ellipse.radius_major_px
    mm_per_px_minor = reference.calibration_radius_mm / ellipse.radius_minor_px
    distance_mm = math.hypot(
        local_major_px * mm_per_px_major,
        local_minor_px * mm_per_px_minor,
    )
    if not math.isfinite(distance_mm):
        raise DerivationError("Derived distance is non-finite.")
    return distance_mm, mm_per_px_major, mm_per_px_minor


def provisional_score_tenths(distance_mm: float, reference: FrozenReference) -> int:
    """Score by frozen benchmark rules; physical outer radius has no epsilon."""
    if not math.isfinite(distance_mm) or distance_mm < 0:
        raise DerivationError("Distance must be a finite nonnegative value.")
    if distance_mm > reference.max_valid_shot_center_radius_mm:
        return reference.miss_score_tenths
    raw_tenths = (11.0 - distance_mm / reference.integer_ring_radial_spacing_mm) * 10
    score = math.floor(raw_tenths + reference.decimal_boundary_epsilon)
    return max(reference.minimum_hit_score_tenths, min(reference.maximum_score_tenths, score))


def derive_provisional_result(
    source_id: str, ellipse: EllipseFit, hole_center: Mapping[str, object], reference: FrozenReference
) -> DerivationResult:
    distance_mm, mm_per_px_major, mm_per_px_minor = affine_normalized_distance_mm(
        ellipse, hole_center, reference
    )
    hole_x, hole_y = _validated_point(hole_center)
    return DerivationResult(
        source_id=source_id,
        rule_set_id=reference.rule_set_id,
        target_center_x_px=ellipse.center_x_px,
        target_center_y_px=ellipse.center_y_px,
        hole_center_x_px=hole_x,
        hole_center_y_px=hole_y,
        radius_major_px=ellipse.radius_major_px,
        radius_minor_px=ellipse.radius_minor_px,
        rotation_deg=ellipse.rotation_deg,
        mm_per_px_major=mm_per_px_major,
        mm_per_px_minor=mm_per_px_minor,
        center_distance_mm=distance_mm,
        provisional_score_tenths=provisional_score_tenths(distance_mm, reference),
    )


def _validated_point(point: Mapping[str, object]) -> tuple[float, float]:
    try:
        x_value, y_value = float(point["x_px"]), float(point["y_px"])
    except (KeyError, TypeError, ValueError) as error:
        raise DerivationError("Hole center must contain numeric x_px and y_px.") from error
    if not math.isfinite(x_value) or not math.isfinite(y_value) or x_value < 0 or y_value < 0:
        raise DerivationError("Hole center must be finite and nonnegative.")
    return x_value, y_value
