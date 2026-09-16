"""Geometry-only ellipse fitting for human-selected calibration points."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import Mapping, Sequence

import cv2
import numpy as np


MIN_CALIBRATION_POINTS = 8
MAX_CALIBRATION_POINTS = 8


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
