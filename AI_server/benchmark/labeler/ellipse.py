"""Geometry-only ellipse fitting for human-selected calibration points."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import Mapping, Sequence

import cv2
import numpy as np


MIN_CALIBRATION_POINTS = 8
MAX_CALIBRATION_POINTS = 8
SEMANTIC_CARDINAL_ROLES = ("12h", "3h", "6h", "9h")
HOLE_SEMANTIC_CARDINAL_ROLES = ("hole_12h", "hole_3h", "hole_6h", "hole_9h")


class EllipseFitError(ValueError):
    """Raised when human-selected points cannot define a stable ellipse."""


@dataclass(frozen=True)
class EllipseFit:
    """Normalized ellipse, with a major-axis orientation in [0, 180) degrees."""

    center_x_px: float
    center_y_px: float
    radius_major_px: float
    radius_minor_px: float
    rotation_deg: float
    calibration_fit_residual_px: float
    max_radial_residual_px: float
    axis_ratio: float
    point_count: int

    @property
    def bull_center_x_px(self) -> float:
        """The V1 target center is derived solely from the fitted ellipse."""
        return self.center_x_px

    @property
    def bull_center_y_px(self) -> float:
        """The V1 target center is derived solely from the fitted ellipse."""
        return self.center_y_px

    def public(self) -> dict[str, float | int]:
        payload = asdict(self)
        payload["bull_center_x_px"] = self.bull_center_x_px
        payload["bull_center_y_px"] = self.bull_center_y_px
        return payload


@dataclass(frozen=True)
class HoleEllipseFit:
    """Ellipse fitted solely from the eight human-selected hole-edge points."""

    center_x_px: float
    center_y_px: float
    radius_major_px: float
    radius_minor_px: float
    rotation_deg: float
    hole_ellipse_rms_residual_px: float
    hole_ellipse_max_residual_px: float
    axis_ratio: float
    point_count: int

    def public(self) -> dict[str, float | int]:
        return asdict(self)


@dataclass(frozen=True)
class CalibrationStability:
    """Transient balance diagnostic for eight points ordered around an ellipse."""

    quality: str
    midpoint_cluster_rms_px: float
    max_midpoint_spread_px: float
    midpoint_center_offset_px: float
    normalized_deviation: float
    midpoints: tuple[tuple[float, float], ...]
    pairs: tuple[dict[str, object], ...]

    def public(self) -> dict[str, object]:
        return {
            **asdict(self),
            "midpoints": [{"x_px": x, "y_px": y} for x, y in self.midpoints],
        }


@dataclass(frozen=True)
class OppositePairMidpointDiagnostics:
    """Diagnostic-only balance of four ellipse-local opposite point pairs."""

    pairs: tuple[dict[str, object], ...]
    midpoint_rms_px: float
    midpoint_max_px: float
    consensus_midpoint_x_px: float
    consensus_midpoint_y_px: float

    def public(self) -> dict[str, object]:
        return {**asdict(self), "pairs": list(self.pairs)}


@dataclass(frozen=True)
class LeaveOneOutPointDiagnostics:
    """Point-specific evidence from eight independent seven-point ellipse fits."""

    points: tuple[dict[str, object], ...]

    def public(self) -> dict[str, object]:
        return {"points": list(self.points)}


@dataclass(frozen=True)
class CardinalProjectiveCenterDiagnostics:
    """Server-derived intersection of the two semantically identified diameters."""

    available: bool
    reason: str | None
    ellipse_center_x_px: float | None
    ellipse_center_y_px: float | None
    cardinal_center_x_px: float | None
    cardinal_center_y_px: float | None
    dx_px: float | None
    dy_px: float | None
    distance_px: float | None
    vertical_diameter: dict[str, object]
    horizontal_diameter: dict[str, object]

    def public(self) -> dict[str, object]:
        return asdict(self)


def fit_human_calibration_ellipse(
    points: Sequence[Mapping[str, object]],
) -> EllipseFit:
    """Fit only supplied human points; no source image pixels are inspected."""
    normalized_points = _validate_points(points, MIN_CALIBRATION_POINTS, MAX_CALIBRATION_POINTS, "Target calibration")
    return _fit_ellipse(normalized_points, EllipseFit)


def fit_human_hole_ellipse(points: Sequence[Mapping[str, object]]) -> HoleEllipseFit:
    """Fit exactly eight human-selected hole-boundary points; inspect no pixels."""
    normalized_points = _validate_points(points, 8, 8, "Hole boundary")
    return _fit_ellipse(normalized_points, HoleEllipseFit)


def assisted_diagonal_predictions(anchors: Sequence[Mapping[str, object]]) -> list[dict[str, float]]:
    """Predict four diagonal candidates from N/E/S/W anchors without finalizing them."""
    cardinal = _validate_points(anchors, 4, 4, "Assisted ellipse anchors")
    north, east, south, west = cardinal
    center_x = sum(point[0] for point in cardinal) / 4
    center_y = sum(point[1] for point in cardinal) / 4
    u_x, u_y = (east[0] - west[0]) / 2, (east[1] - west[1]) / 2
    v_x, v_y = (south[0] - north[0]) / 2, (south[1] - north[1]) / 2
    scale = math.sqrt(0.5)
    return [
        {"x_px": center_x + x_value * scale, "y_px": center_y + y_value * scale}
        for x_value, y_value in ((u_x + v_x, u_y + v_y), (-u_x + v_x, -u_y + v_y),
                                 (-u_x - v_x, -u_y - v_y), (u_x - v_x, u_y - v_y))
    ]


def calibration_stability(
    points: Sequence[Mapping[str, object]], ellipse: EllipseFit | HoleEllipseFit,
    label: str = "Target calibration",
) -> CalibrationStability:
    """Measure opposite-pair midpoint balance without changing the ellipse fit.

    The operator may click in any order.  Pairing is therefore derived from
    ellipse-local angular order, never the order of the raw clicks.  This is a
    diagnostic only: it neither normalizes diameter lengths nor changes points.
    """
    normalized = _validate_points(points, 8, 8, label)
    ordered = _ellipse_local_angular_order(normalized, ellipse)
    clock_labels = ("12h", "1h30", "3h", "4h30", "6h", "7h30", "9h", "10h30")
    pairs: list[dict[str, object]] = []
    midpoint_values: list[tuple[float, float]] = []
    for index in range(4):
        first = ordered[index]
        second = ordered[index + 4]
        midpoint = ((first[1][0] + second[1][0]) / 2, (first[1][1] + second[1][1]) / 2)
        midpoint_values.append(midpoint)
        pairs.append({
            "first": _point_diagnostic(first[0], first[1], clock_labels[index]),
            "second": _point_diagnostic(second[0], second[1], clock_labels[index + 4]),
            "midpoint": {
                "x_px": midpoint[0],
                "y_px": midpoint[1],
                "distance_to_ellipse_center_px": math.hypot(
                    midpoint[0] - ellipse.center_x_px, midpoint[1] - ellipse.center_y_px,
                ),
            },
        })
    midpoints = tuple(midpoint_values)
    mean_x = sum(point[0] for point in midpoints) / 4
    mean_y = sum(point[1] for point in midpoints) / 4
    cluster_rms = math.sqrt(sum((x - mean_x) ** 2 + (y - mean_y) ** 2 for x, y in midpoints) / 4)
    max_midpoint_spread = max(math.hypot(x - mean_x, y - mean_y) for x, y in midpoints)
    center_offset = math.hypot(mean_x - ellipse.center_x_px, mean_y - ellipse.center_y_px)
    normalized_deviation = max(cluster_rms, center_offset) / math.sqrt(ellipse.radius_major_px * ellipse.radius_minor_px)
    quality = "good" if normalized_deviation <= 0.03 else "usable" if normalized_deviation <= 0.08 else "unstable"
    return CalibrationStability(
        quality, cluster_rms, max_midpoint_spread, center_offset,
        normalized_deviation, midpoints, tuple(pairs),
    )


def cardinal_projective_center(
    points: Sequence[Mapping[str, object]], ellipse: EllipseFit | None = None,
) -> CardinalProjectiveCenterDiagnostics:
    """Intersect semantic 12h–6h and 9h–3h diameters without reordering.

    The four anchors carry their physical identity in ``semantic_role``.
    Their raw click position, fitted-ellipse angular order, and any ellipse
    center are intentionally not used to infer that identity.
    """
    try:
        anchors = _semantic_cardinal_anchors(points)
    except EllipseFitError as error:
        return _unavailable_cardinal_center(ellipse, str(error))
    north, east, south, west = (anchors[role] for role in SEMANTIC_CARDINAL_ROLES)
    vertical = {
        "first": _point_diagnostic(0, north, "12h"),
        "second": _point_diagnostic(2, south, "6h"),
    }
    horizontal = {
        "first": _point_diagnostic(3, west, "9h"),
        "second": _point_diagnostic(1, east, "3h"),
    }
    intersection = _line_intersection(north, south, west, east)
    if intersection is None:
        return _unavailable_cardinal_center(ellipse, "near_parallel_diameters", vertical, horizontal)
    center_x, center_y = intersection
    if ellipse is not None:
        normalized_radius = _normalized_ellipse_radius(center_x, center_y, ellipse)
        if not math.isfinite(normalized_radius) or normalized_radius > 1.25:
            return _unavailable_cardinal_center(ellipse, "intersection_outside_plausible_target_region", vertical, horizontal)
    dx = center_x - ellipse.center_x_px if ellipse is not None else None
    dy = center_y - ellipse.center_y_px if ellipse is not None else None
    return CardinalProjectiveCenterDiagnostics(
        available=True,
        reason=None,
        ellipse_center_x_px=ellipse.center_x_px if ellipse is not None else None,
        ellipse_center_y_px=ellipse.center_y_px if ellipse is not None else None,
        cardinal_center_x_px=center_x,
        cardinal_center_y_px=center_y,
        dx_px=dx,
        dy_px=dy,
        distance_px=math.hypot(dx, dy) if dx is not None and dy is not None else None,
        vertical_diameter=vertical,
        horizontal_diameter=horizontal,
    )


def require_cardinal_projective_center(
    points: Sequence[Mapping[str, object]], ellipse: EllipseFit | None = None,
) -> CardinalProjectiveCenterDiagnostics:
    """Return the authoritative center or reject invalid semantic geometry."""
    diagnostic = cardinal_projective_center(points, ellipse)
    if not diagnostic.available:
        raise EllipseFitError(f"cardinal_target_center_unavailable:{diagnostic.reason}")
    return diagnostic


def hole_cardinal_center(
    points: Sequence[Mapping[str, object]], ellipse: HoleEllipseFit | None = None,
) -> CardinalProjectiveCenterDiagnostics:
    """Authoritative hole center from explicit hole cardinal anchors."""
    remapped = []
    mapping = dict(zip(HOLE_SEMANTIC_CARDINAL_ROLES, SEMANTIC_CARDINAL_ROLES))
    for point in points:
        role = point.get("semantic_role")
        remapped.append({**point, "semantic_role": mapping.get(role, role)})
    return cardinal_projective_center(remapped, ellipse)


def require_hole_cardinal_center(
    points: Sequence[Mapping[str, object]], ellipse: HoleEllipseFit | None = None,
) -> CardinalProjectiveCenterDiagnostics:
    diagnostic = hole_cardinal_center(points, ellipse)
    if not diagnostic.available:
        raise EllipseFitError(f"hole_cardinal_center_unavailable:{diagnostic.reason}")
    return diagnostic


def _semantic_cardinal_anchors(points: Sequence[Mapping[str, object]]) -> dict[str, tuple[float, float]]:
    anchors: dict[str, tuple[float, float]] = {}
    for raw in points:
        role = raw.get("semantic_role")
        if role not in SEMANTIC_CARDINAL_ROLES:
            continue
        if role in anchors:
            raise EllipseFitError(f"duplicate_semantic_cardinal_anchor:{role}")
        try:
            x, y = float(raw["x_px"]), float(raw["y_px"])
        except (KeyError, TypeError, ValueError) as error:
            raise EllipseFitError(f"invalid_semantic_cardinal_anchor:{role}") from error
        if not math.isfinite(x) or not math.isfinite(y):
            raise EllipseFitError(f"invalid_semantic_cardinal_anchor:{role}")
        anchors[role] = (x, y)
    missing = [role for role in SEMANTIC_CARDINAL_ROLES if role not in anchors]
    if missing:
        raise EllipseFitError(f"missing_semantic_cardinal_anchors:{','.join(missing)}")
    return anchors


def _unavailable_cardinal_center(
    ellipse: EllipseFit | None, reason: str,
    vertical: dict[str, object] | None = None,
    horizontal: dict[str, object] | None = None,
) -> CardinalProjectiveCenterDiagnostics:
    return CardinalProjectiveCenterDiagnostics(
        available=False, reason=reason,
        ellipse_center_x_px=ellipse.center_x_px if ellipse is not None else None,
        ellipse_center_y_px=ellipse.center_y_px if ellipse is not None else None,
        cardinal_center_x_px=None, cardinal_center_y_px=None,
        dx_px=None, dy_px=None, distance_px=None,
        vertical_diameter=vertical or {}, horizontal_diameter=horizontal or {},
    )


def _normalized_ellipse_radius(x: float, y: float, ellipse: EllipseFit) -> float:
    angle = math.radians(ellipse.rotation_deg)
    dx, dy = x - ellipse.center_x_px, y - ellipse.center_y_px
    local_x = math.cos(angle) * dx + math.sin(angle) * dy
    local_y = -math.sin(angle) * dx + math.cos(angle) * dy
    return math.hypot(local_x / ellipse.radius_major_px, local_y / ellipse.radius_minor_px)


def opposite_pair_midpoint_diagnostics(
    points: Sequence[Mapping[str, object]], ellipse: EllipseFit | HoleEllipseFit,
    label: str = "Ellipse boundary",
) -> OppositePairMidpointDiagnostics:
    """Measure four point-pair midpoints against, but never instead of, ellipse center."""
    normalized = _validate_points(points, 8, 8, label)
    ordered = _ellipse_local_angular_order(normalized, ellipse)
    pairs: list[dict[str, object]] = []
    midpoint_values: list[tuple[float, float]] = []
    for pair_index in range(4):
        first_index, first = ordered[pair_index]
        second_index, second = ordered[pair_index + 4]
        midpoint_x, midpoint_y = (first[0] + second[0]) / 2, (first[1] + second[1]) / 2
        # Correction direction: move the pair midpoint toward the fitted center.
        dx, dy = ellipse.center_x_px - midpoint_x, ellipse.center_y_px - midpoint_y
        distance = math.hypot(dx, dy)
        severity = "strong_warning" if distance > 2.5 else "warning" if distance > 1.0 else "normal"
        midpoint_values.append((midpoint_x, midpoint_y))
        pairs.append({"pair_index": pair_index + 1, "first_point_index": first_index,
                      "second_point_index": second_index, "midpoint_x_px": midpoint_x,
                      "midpoint_y_px": midpoint_y, "dx_px": dx, "dy_px": dy,
                      "distance_px": distance, "severity": severity})
    rms = math.sqrt(sum(pair["distance_px"] ** 2 for pair in pairs) / 4)
    return OppositePairMidpointDiagnostics(
        tuple(pairs), rms, max(pair["distance_px"] for pair in pairs),
        sum(point[0] for point in midpoint_values) / 4, sum(point[1] for point in midpoint_values) / 4,
    )


def leave_one_out_point_diagnostics(
    points: Sequence[Mapping[str, object]], ellipse: EllipseFit | HoleEllipseFit,
    label: str = "Ellipse boundary",
) -> LeaveOneOutPointDiagnostics:
    """Measure each point against an ellipse fit that excludes that point.

    This is diagnostic evidence only.  It never alters the supplied points,
    authoritative full eight-point ellipse, or any scoring input.
    """
    normalized = _validate_points(points, 8, 8, label)
    canonical = _ellipse_local_angular_order(normalized, ellipse)
    canonical_position = {raw_index: position for position, (raw_index, _) in enumerate(canonical)}
    clock_labels = ("12h", "1h30", "3h", "4h30", "6h", "7h30", "9h", "10h30")
    diagnostics: list[dict[str, object]] = []
    for point_index, point in enumerate(normalized):
        remaining = [candidate for index, candidate in enumerate(normalized) if index != point_index]
        leave_one_out_fit = _fit_ellipse(remaining, type(ellipse))
        nearest_x, nearest_y = _nearest_point_on_ellipse(point, leave_one_out_fit)
        dx, dy = nearest_x - point[0], nearest_y - point[1]
        diagnostics.append({
            "point_index": point_index,
            "clock_position_index": canonical_position[point_index],
            "clock_label": clock_labels[canonical_position[point_index]],
            "loo_residual_px": math.hypot(dx, dy),
            "loo_dx_px": dx,
            "loo_dy_px": dy,
            "loo_distance_px": math.hypot(dx, dy),
            "nearest_ellipse_x_px": nearest_x,
            "nearest_ellipse_y_px": nearest_y,
            "full_fit_residual_px": ellipse_point_residuals(points, ellipse, label)[point_index],
        })
    return LeaveOneOutPointDiagnostics(tuple(diagnostics))


def pair_point_recommendations(
    midpoint_diagnostics: OppositePairMidpointDiagnostics,
    leave_one_out: LeaveOneOutPointDiagnostics,
    *, low_residual_px: float = 1.0,
) -> tuple[dict[str, object], ...]:
    """Recommend which endpoints deserve human inspection, never auto-correction."""
    by_index = {point["point_index"]: point for point in leave_one_out.points}
    recommendations: list[dict[str, object]] = []
    for pair in midpoint_diagnostics.pairs:
        first = by_index[pair["first_point_index"]]
        second = by_index[pair["second_point_index"]]
        first_residual, second_residual = first["loo_residual_px"], second["loo_residual_px"]
        larger, smaller = (first, second) if first_residual >= second_residual else (second, first)
        if pair["distance_px"] > low_residual_px and max(first_residual, second_residual) <= low_residual_px:
            recommendation, recommended_point_index = "check_other_pairs", None
        elif larger["loo_residual_px"] > smaller["loo_residual_px"] * 1.5 and larger["loo_residual_px"] - smaller["loo_residual_px"] >= 1.0:
            recommendation, recommended_point_index = "check_point", larger["point_index"]
        else:
            recommendation, recommended_point_index = "check_both", None
        recommendations.append({
            "pair_index": pair["pair_index"],
            "recommendation": recommendation,
            "recommended_point_index": recommended_point_index,
        })
    return tuple(recommendations)


def target_ghost_loo_confidence(
    points: Sequence[Mapping[str, object]], leave_one_out: LeaveOneOutPointDiagnostics,
) -> tuple[dict[str, object], ...]:
    """Compare target diagonal ghost directions with independent LOO evidence."""
    normalized = _validate_points(points, 8, 8, "Target calibration")
    ghosts = assisted_diagonal_predictions(points[:4])
    by_index = {point["point_index"]: point for point in leave_one_out.points}
    confidence: list[dict[str, object]] = []
    for ghost_index, ghost in enumerate(ghosts):
        point_index = ghost_index + 4
        point = normalized[point_index]
        ghost_dx, ghost_dy = ghost["x_px"] - point[0], ghost["y_px"] - point[1]
        loo = by_index[point_index]
        ghost_distance, loo_distance = math.hypot(ghost_dx, ghost_dy), loo["loo_distance_px"]
        if ghost_distance < 0.25 or loo_distance < 0.25:
            status = "insufficient"
        else:
            cosine_similarity = (ghost_dx * loo["loo_dx_px"] + ghost_dy * loo["loo_dy_px"]) / (ghost_distance * loo_distance)
            status = "high" if cosine_similarity >= 0.5 else "inconsistent"
        confidence.append({"point_index": point_index, "status": status})
    return tuple(confidence)


def _point_diagnostic(index: int, point: tuple[float, float], clock_label: str) -> dict[str, object]:
    return {
        "point_index": index,
        "x_px": point[0],
        "y_px": point[1],
        "clock_label": clock_label,
    }


def _line_intersection(
    first_start: tuple[float, float], first_end: tuple[float, float],
    second_start: tuple[float, float], second_end: tuple[float, float],
) -> tuple[float, float] | None:
    """Return a finite line intersection or ``None`` for unstable geometry."""
    x1, y1 = first_start
    x2, y2 = first_end
    x3, y3 = second_start
    x4, y4 = second_end
    first_dx, first_dy = x1 - x2, y1 - y2
    second_dx, second_dy = x3 - x4, y3 - y4
    denominator = first_dx * second_dy - first_dy * second_dx
    scale = math.hypot(first_dx, first_dy) * math.hypot(second_dx, second_dy)
    if not math.isfinite(denominator) or scale <= 0 or abs(denominator) <= scale * 1e-9:
        return None
    first_cross = x1 * y2 - y1 * x2
    second_cross = x3 * y4 - y3 * x4
    x_value = (first_cross * second_dx - first_dx * second_cross) / denominator
    y_value = (first_cross * second_dy - first_dy * second_cross) / denominator
    if not (math.isfinite(x_value) and math.isfinite(y_value)):
        return None
    return x_value, y_value


def _ellipse_local_angular_order(
    points: Sequence[tuple[float, float]], ellipse: EllipseFit | HoleEllipseFit,
) -> list[tuple[int, tuple[float, float]]]:
    """Return raw point indices clockwise from ellipse-local 12 o'clock.

    Scaling by the two fitted radii makes the angular ordering robust for
    oblique (elliptical) images.  The computed order is UI-only; callers keep
    and persist the original human point sequence.
    """
    rotation = math.radians(ellipse.rotation_deg)
    cosine, sine = math.cos(rotation), math.sin(rotation)
    ordered: list[tuple[float, int, tuple[float, float]]] = []
    for index, (x_value, y_value) in enumerate(points):
        delta_x = x_value - ellipse.center_x_px
        delta_y = y_value - ellipse.center_y_px
        local_x = cosine * delta_x + sine * delta_y
        local_y = -sine * delta_x + cosine * delta_y
        angle = math.atan2(local_y / ellipse.radius_minor_px, local_x / ellipse.radius_major_px)
        # Zero is local 12 o'clock; increasing values travel clockwise in image coordinates.
        clock_angle = (angle + math.pi / 2) % (2 * math.pi)
        ordered.append((clock_angle, index, (x_value, y_value)))
    ordered.sort(key=lambda item: (item[0], item[1]))
    return [(index, point) for _, index, point in ordered]


def _nearest_point_on_ellipse(
    point: tuple[float, float], ellipse: EllipseFit | HoleEllipseFit,
) -> tuple[float, float]:
    """Find the nearest rotated-ellipse point with a bounded 1-D minimization."""
    rotation = math.radians(ellipse.rotation_deg)
    cosine, sine = math.cos(rotation), math.sin(rotation)

    def point_at(theta: float) -> tuple[float, float]:
        local_x = ellipse.radius_major_px * math.cos(theta)
        local_y = ellipse.radius_minor_px * math.sin(theta)
        return (
            ellipse.center_x_px + cosine * local_x - sine * local_y,
            ellipse.center_y_px + sine * local_x + cosine * local_y,
        )

    def distance_squared(theta: float) -> float:
        x_value, y_value = point_at(theta)
        return (x_value - point[0]) ** 2 + (y_value - point[1]) ** 2

    samples = 720
    step = 2 * math.pi / samples
    seed = min(range(samples), key=lambda index: distance_squared(index * step)) * step
    lower, upper = seed - step, seed + step
    # Golden-section refinement is deterministic and avoids a scipy dependency.
    ratio = (math.sqrt(5) - 1) / 2
    left_probe, right_probe = upper - ratio * (upper - lower), lower + ratio * (upper - lower)
    for _ in range(40):
        if distance_squared(left_probe) <= distance_squared(right_probe):
            upper, right_probe = right_probe, left_probe
            left_probe = upper - ratio * (upper - lower)
        else:
            lower, left_probe = left_probe, right_probe
            right_probe = lower + ratio * (upper - lower)
    return point_at((lower + upper) / 2)


def _fit_ellipse(normalized_points: list[tuple[float, float]], result_type):
    point_array = np.asarray(normalized_points, dtype=np.float32)
    try:
        (center_x, center_y), (axis_one, axis_two), raw_angle = cv2.fitEllipse(
            point_array.reshape((-1, 1, 2))
        )
    except cv2.error as error:
        raise EllipseFitError("Points cannot produce a stable ellipse.") from error

    center_x = float(center_x)
    center_y = float(center_y)
    axis_one = float(axis_one)
    axis_two = float(axis_two)
    raw_angle = float(raw_angle)
    if not all(math.isfinite(value) for value in (center_x, center_y, axis_one, axis_two, raw_angle)):
        raise EllipseFitError("Ellipse fit returned non-finite geometry.")
    if axis_one <= 0 or axis_two <= 0:
        raise EllipseFitError("Ellipse fit returned non-positive axis lengths.")

    # OpenCV reports the angle for its first axis. Reorient to the major axis.
    if axis_one >= axis_two:
        radius_major = axis_one / 2
        radius_minor = axis_two / 2
        rotation = raw_angle % 180
    else:
        radius_major = axis_two / 2
        radius_minor = axis_one / 2
        rotation = (raw_angle + 90) % 180

    coordinate_extent = max(max(abs(x), abs(y)) for x, y in normalized_points)
    if radius_major > max(1_000_000, coordinate_extent * 1_000):
        raise EllipseFitError("Ellipse fit returned numerically nonphysical radii.")
    if radius_minor <= 1e-6 or radius_major <= 1e-6:
        raise EllipseFitError("Ellipse fit is degenerate.")
    if not 0 <= rotation < 180:
        raise EllipseFitError("Ellipse fit returned an invalid major-axis rotation.")

    residuals = _radial_residuals(
        normalized_points, center_x, center_y, radius_major, radius_minor, rotation
    )
    if not residuals or not all(math.isfinite(residual) for residual in residuals):
        raise EllipseFitError("Ellipse fit residual is invalid.")
    shared = dict(
        center_x_px=center_x,
        center_y_px=center_y,
        radius_major_px=radius_major,
        radius_minor_px=radius_minor,
        rotation_deg=rotation,
        axis_ratio=radius_minor / radius_major,
        point_count=len(normalized_points),
    )
    rms = math.sqrt(sum(value * value for value in residuals) / len(residuals))
    maximum = max(residuals)
    if result_type is EllipseFit:
        return EllipseFit(**shared, calibration_fit_residual_px=rms, max_radial_residual_px=maximum)
    return HoleEllipseFit(**shared, hole_ellipse_rms_residual_px=rms, hole_ellipse_max_residual_px=maximum)


def ellipse_point_residuals(
    points: Sequence[Mapping[str, object]], ellipse: EllipseFit | HoleEllipseFit,
    label: str = "Ellipse boundary",
) -> list[float]:
    """Return one non-authoritative radial residual per final human point."""
    normalized = _validate_points(points, 8, 8, label)
    return _radial_residuals(
        normalized, ellipse.center_x_px, ellipse.center_y_px,
        ellipse.radius_major_px, ellipse.radius_minor_px, ellipse.rotation_deg,
    )


def _validate_points(points: Sequence[Mapping[str, object]], minimum: int, maximum: int, label: str) -> list[tuple[float, float]]:
    if not minimum <= len(points) <= maximum:
        raise EllipseFitError(
            f"{label} requires {minimum}–{maximum} points."
        )
    normalized: list[tuple[float, float]] = []
    for index, point in enumerate(points, start=1):
        try:
            x_value = float(point["x_px"])
            y_value = float(point["y_px"])
        except (KeyError, TypeError, ValueError) as error:
            raise EllipseFitError(f"Point {index} must have numeric x_px and y_px.") from error
        if not math.isfinite(x_value) or not math.isfinite(y_value):
            raise EllipseFitError(f"Point {index} must be finite.")
        if x_value < 0 or y_value < 0:
            raise EllipseFitError(f"Point {index} must be nonnegative.")
        normalized.append((x_value, y_value))
    if len(set(normalized)) != len(normalized):
        raise EllipseFitError(f"{label} points must not be duplicated.")
    centered = np.asarray(normalized, dtype=np.float64) - np.mean(normalized, axis=0)
    if np.linalg.matrix_rank(centered) < 2:
        raise EllipseFitError(f"{label} points are degenerate or collinear.")
    return normalized


def _radial_residuals(
    points: Sequence[tuple[float, float]],
    center_x: float,
    center_y: float,
    radius_major: float,
    radius_minor: float,
    rotation_deg: float,
) -> list[float]:
    """Return center-ray-to-ellipse-intersection distances, not nearest distances."""
    angle = math.radians(rotation_deg)
    cosine = math.cos(angle)
    sine = math.sin(angle)
    residuals: list[float] = []
    for x_value, y_value in points:
        delta_x = x_value - center_x
        delta_y = y_value - center_y
        local_x = cosine * delta_x + sine * delta_y
        local_y = -sine * delta_x + cosine * delta_y
        normalized_radius_squared = (local_x / radius_major) ** 2 + (local_y / radius_minor) ** 2
        if normalized_radius_squared <= 0 or not math.isfinite(normalized_radius_squared):
            raise EllipseFitError("A calibration point lies at an invalid ellipse ray.")
        scale_to_boundary = 1 / math.sqrt(normalized_radius_squared)
        residuals.append(math.hypot(
            local_x - local_x * scale_to_boundary,
            local_y - local_y * scale_to_boundary,
        ))
    return residuals
