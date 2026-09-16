"""Synthetic geometry tests for human calibration ellipse fitting."""

from __future__ import annotations

import math
import unittest

from .ellipse import EllipseFitError, fit_human_calibration_ellipse, fit_human_hole_ellipse


def ellipse_points(center_x, center_y, major, minor, rotation_deg, count, perturbation=0):
    angle = math.radians(rotation_deg)
    cosine, sine = math.cos(angle), math.sin(angle)
    points = []
    for index in range(count):
        theta = 2 * math.pi * index / count
        radial_offset = perturbation if index % 2 else -perturbation
        local_x = (major + radial_offset) * math.cos(theta)
        local_y = (minor + radial_offset) * math.sin(theta)
        points.append({
            "x_px": center_x + cosine * local_x - sine * local_y,
            "y_px": center_y + sine * local_x + cosine * local_y,
        })
    return points


class EllipseFitTests(unittest.TestCase):
    def test_hole_ellipse_requires_exactly_eight_and_is_geometry_only(self):
        points = ellipse_points(412, 275, 18, 9, 47, 8)
        fitted = fit_human_hole_ellipse(points)
        self.assertAlmostEqual(fitted.center_x_px, 412, places=3)
        self.assertAlmostEqual(fitted.center_y_px, 275, places=3)
        self.assertAlmostEqual(fitted.radius_major_px, 18, places=3)
        self.assertAlmostEqual(fitted.radius_minor_px, 9, places=3)
        self.assertAlmostEqual(fitted.rotation_deg, 47, places=3)
        self.assertLess(fitted.hole_ellipse_rms_residual_px, 1e-3)
        for invalid in (points[:7], points + [points[0]], [points[0]] * 8):
            with self.assertRaises(EllipseFitError):
                fit_human_hole_ellipse(invalid)
    def test_perfect_circle(self):
        fitted = fit_human_calibration_ellipse(ellipse_points(120, 80, 40, 40, 0, 8))
        self.assertAlmostEqual(fitted.center_x_px, 120, places=3)
        self.assertAlmostEqual(fitted.center_y_px, 80, places=3)
        self.assertAlmostEqual(fitted.radius_major_px, 40, places=3)
        self.assertAlmostEqual(fitted.radius_minor_px, 40, places=3)
        self.assertLess(fitted.calibration_fit_residual_px, 1e-3)

    def test_known_rotated_ellipse_normalizes_major_axis(self):
        fitted = fit_human_calibration_ellipse(ellipse_points(100, 200, 80, 40, 30, 8))
        self.assertAlmostEqual(fitted.center_x_px, 100, places=3)
        self.assertAlmostEqual(fitted.center_y_px, 200, places=3)
        self.assertAlmostEqual(fitted.radius_major_px, 80, places=3)
        self.assertAlmostEqual(fitted.radius_minor_px, 40, places=3)
        self.assertAlmostEqual(fitted.rotation_deg, 30, places=3)
        self.assertGreaterEqual(fitted.radius_major_px, fitted.radius_minor_px)
        self.assertGreaterEqual(fitted.rotation_deg, 0)
        self.assertLess(fitted.rotation_deg, 180)

    def test_translated_ellipse(self):
        fitted = fit_human_calibration_ellipse(ellipse_points(1300, 900, 60, 30, 135, 6))
        self.assertAlmostEqual(fitted.center_x_px, 1300, places=3)
        self.assertAlmostEqual(fitted.center_y_px, 900, places=3)
        self.assertAlmostEqual(fitted.rotation_deg, 135, places=3)

    def test_five_and_eight_points_are_supported(self):
        for count in (5, 8):
            fitted = fit_human_calibration_ellipse(ellipse_points(100, 100, 30, 20, 10, count))
            self.assertEqual(fitted.point_count, count)

    def test_invalid_count_and_degenerate_inputs_are_rejected(self):
        points = ellipse_points(100, 100, 30, 20, 0, 5)
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse(points[:4])
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse(ellipse_points(100, 100, 30, 20, 0, 9))
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse([points[0]] * 5)
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse([{"x_px": index, "y_px": index} for index in range(5)])

    def test_nonfinite_values_are_rejected(self):
        points = ellipse_points(100, 100, 30, 20, 0, 5)
        points[0]["x_px"] = float("nan")
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse(points)
        points = ellipse_points(100, 100, 30, 20, 0, 5)
        points[0]["y_px"] = float("inf")
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse(points)

    def test_residual_distinguishes_ideal_and_perturbed_geometry(self):
        ideal = fit_human_calibration_ellipse(ellipse_points(100, 100, 50, 20, 60, 8))
        perturbed = fit_human_calibration_ellipse(
            ellipse_points(100, 100, 50, 20, 60, 8, perturbation=3)
        )
        self.assertLess(ideal.calibration_fit_residual_px, 1e-3)
        self.assertGreater(perturbed.calibration_fit_residual_px, ideal.calibration_fit_residual_px + 0.1)


if __name__ == "__main__":
    unittest.main()
