"""Pure benchmark reference for Layer-2 image-to-target-plane geometry."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

import numpy as np


SPEC_ID = "saigon_sniper_air_rifle_10m_layer2_homography_v1"
SCORE_RULE_ID = "saigon_sniper_air_rifle_10m_decimal_v1"
RING1_RADIUS_MM = 22.75
PELLET_RADIUS_MM = 2.25
MAX_VALID_CENTER_RADIUS_MM = 25.0
DECIMAL_EPSILON = 1e-9
REQUIRED_INPUT_ROLES = ("12h", "3h", "6h", "9h")
CANONICAL_CARDINAL_POINTS = {
    "12h": (0.0, -RING1_RADIUS_MM),
    "3h": (RING1_RADIUS_MM, 0.0),
    "6h": (0.0, RING1_RADIUS_MM),
    "9h": (-RING1_RADIUS_MM, 0.0),
}


class InvalidGeometryError(ValueError):
    """Raised when Layer-2 image geometry cannot safely define a homography."""


def _finite_point(point: Sequence[float], *, label: str) -> tuple[float, float]:
    if len(point) != 2:
        raise InvalidGeometryError(f"{label} must contain exactly two coordinates.")
    try:
        x, y = float(point[0]), float(point[1])
    except (TypeError, ValueError) as error:
        raise InvalidGeometryError(f"{label} must be numeric.") from error
    if not math.isfinite(x) or not math.isfinite(y):
        raise InvalidGeometryError(f"{label} must be finite.")
    return x, y


def _ordered_image_points(cardinal_points: Mapping[str, Sequence[float]]) -> np.ndarray:
    if set(cardinal_points) != set(REQUIRED_INPUT_ROLES):
        missing = sorted(set(REQUIRED_INPUT_ROLES) - set(cardinal_points))
        extra = sorted(set(cardinal_points) - set(REQUIRED_INPUT_ROLES))
        raise InvalidGeometryError(f"Cardinal roles must be exact; missing={missing}, extra={extra}.")
    return np.asarray(
        [_finite_point(cardinal_points[role], label=role) for role in REQUIRED_INPUT_ROLES],
        dtype=np.float64,
    )


def _is_nondegenerate(points: np.ndarray) -> bool:
    # The semantic order is circular: 12h, 3h, 6h, 9h.  A shoelace area
    # rejects collapse, and every three-point area rejects collinear corners.
    shifted = np.roll(points, -1, axis=0)
    area2 = abs(float(np.sum(points[:, 0] * shifted[:, 1] - points[:, 1] * shifted[:, 0])))
    if area2 <= 1e-9:
        return False
    for omit in range(4):
        triple = np.delete(points, omit, axis=0)
        matrix = np.c_[triple, np.ones(3)]
        if abs(float(np.linalg.det(matrix))) <= 1e-9:
            return False
    return True


def build_image_to_mm_homography(cardinal_points: Mapping[str, Sequence[float]]) -> np.ndarray:
    """Build a finite, invertible image-pixel to physical-mm homography.

    Input keys are semantic identities, not an interchangeable point sequence.
    """
    source = _ordered_image_points(cardinal_points)
    destination = np.asarray([CANONICAL_CARDINAL_POINTS[role] for role in REQUIRED_INPUT_ROLES], dtype=np.float64)
    if not _is_nondegenerate(source):
        raise InvalidGeometryError("Cardinal image quadrilateral is degenerate.")

    rows: list[list[float]] = []
    for (x, y), (u, v) in zip(source, destination, strict=True):
        rows.extend(([-x, -y, -1.0, 0.0, 0.0, 0.0, u * x, u * y, u],
                     [0.0, 0.0, 0.0, -x, -y, -1.0, v * x, v * y, v]))
    design = np.asarray(rows, dtype=np.float64)
    if np.linalg.matrix_rank(design) != 8:
        raise InvalidGeometryError("Cardinal image geometry cannot determine a homography.")
    _, _, vh = np.linalg.svd(design)
    homography = vh[-1].reshape(3, 3)
    scale = homography[2, 2]
    if not math.isfinite(float(scale)) or abs(float(scale)) <= 1e-15:
        raise InvalidGeometryError("Homography normalization is invalid.")
    homography /= scale
    if not np.all(np.isfinite(homography)) or abs(float(np.linalg.det(homography))) <= 1e-15:
        raise InvalidGeometryError("Homography is non-finite or non-invertible.")
    inverse = np.linalg.inv(homography)
    if not np.all(np.isfinite(inverse)):
        raise InvalidGeometryError("Homography inverse is non-finite.")
    return homography


def transform_point_to_mm(homography: np.ndarray, point_px: Sequence[float]) -> tuple[float, float]:
    """Transform one finite image point and reject points at projective infinity."""
    point = _finite_point(point_px, label="point_px")
    matrix = np.asarray(homography, dtype=np.float64)
    if matrix.shape != (3, 3) or not np.all(np.isfinite(matrix)):
        raise InvalidGeometryError("Homography must be a finite 3x3 matrix.")
    projected = matrix @ np.asarray((point[0], point[1], 1.0), dtype=np.float64)
    denominator = float(projected[2])
    if not math.isfinite(denominator) or abs(denominator) <= 1e-15:
        raise InvalidGeometryError("Point transforms to projective infinity.")
    x_mm, y_mm = float(projected[0] / denominator), float(projected[1] / denominator)
    if not math.isfinite(x_mm) or not math.isfinite(y_mm):
        raise InvalidGeometryError("Transformed physical point is non-finite.")
    return x_mm, y_mm


def physical_radius_mm(point_mm: Sequence[float]) -> float:
    """Return Euclidean radius in the physical target plane."""
    x_mm, y_mm = _finite_point(point_mm, label="point_mm")
    return math.hypot(x_mm, y_mm)


def score_from_layer2_reference(radius_mm: float) -> int:
    """Apply the frozen air-rifle decimal rule to Layer-2 physical radius."""
    radius = float(radius_mm)
    if not math.isfinite(radius) or radius < 0:
        raise ValueError("radius_mm must be finite and nonnegative.")
    if radius > MAX_VALID_CENTER_RADIUS_MM:
        return 0
    raw_tenths = (11.0 - radius / 2.5) * 10
    return max(10, min(109, math.floor(raw_tenths + DECIMAL_EPSILON)))
