"""Synthetic geometry tests for human calibration ellipse fitting."""

from __future__ import annotations

import math
import unittest

from .ellipse import (EllipseFitError, assisted_diagonal_predictions, calibration_stability,
                      ellipse_point_residuals, fit_human_calibration_ellipse, fit_human_hole_ellipse)


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
    def test_four_cardinal_anchors_predict_affine_diagonals_without_finalizing_them(self):
        anchors = [{"x_px": 100, "y_px": 40}, {"x_px": 180, "y_px": 100},
                   {"x_px": 100, "y_px": 160}, {"x_px": 20, "y_px": 100}]
        predictions = assisted_diagonal_predictions(anchors)
        self.assertEqual(len(predictions), 4)
        self.assertAlmostEqual(predictions[0]["x_px"], 156.5685, places=3)
        self.assertAlmostEqual(predictions[0]["y_px"], 142.4264, places=3)
        self.assertEqual(len(anchors), 4, "Ghost predictions must not finalize points.")

    def test_rotated_affine_anchors_produce_expected_diagonals(self):
        anchors = [{"x_px": 200, "y_px": 70}, {"x_px": 260, "y_px": 150},
                   {"x_px": 200, "y_px": 230}, {"x_px": 140, "y_px": 150}]
        predictions = assisted_diagonal_predictions(anchors)
        self.assertAlmostEqual(sum(point["x_px"] for point in predictions) / 4, 200, places=6)
        self.assertAlmostEqual(sum(point["y_px"] for point in predictions) / 4, 150, places=6)

    def test_calibration_stability_reports_balanced_and_unstable_clicks(self):
        balanced = ellipse_points(200, 150, 80, 40, 25, 8)
        balanced_fit = fit_human_calibration_ellipse(balanced)
        diagnostics = calibration_stability(balanced, balanced_fit)
        self.assertEqual(diagnostics.quality, "good")
        self.assertLess(diagnostics.normalized_deviation, 0.03)
        uneven = [point.copy() for point in balanced]
        uneven[0]["x_px"] += 90
        uneven[1]["x_px"] += 90
        uneven_fit = fit_human_calibration_ellipse(uneven)
        self.assertEqual(calibration_stability(uneven, uneven_fit).quality, "unstable")

    def test_opposite_pairs_are_derived_from_ellipse_order_not_click_order(self):
        points = ellipse_points(300, 210, 90, 40, 31, 8)
        # Deliberately simulate a non-clockwise human click order.
        shuffled = [points[index] for index in (3, 7, 1, 5, 0, 4, 2, 6)]
        fitted = fit_human_calibration_ellipse(shuffled)
        diagnostics = calibration_stability(shuffled, fitted)
        self.assertEqual(len(diagnostics.pairs), 4)
        self.assertEqual({pair["first"]["clock_label"] for pair in diagnostics.pairs}, {"12h", "1h30", "3h", "4h30"})
        self.assertEqual({pair["second"]["clock_label"] for pair in diagnostics.pairs}, {"6h", "7h30", "9h", "10h30"})
        self.assertLess(diagnostics.midpoint_cluster_rms_px, 1e-3)

    def test_elliptical_diameter_lengths_are_not_normalized(self):
        points = ellipse_points(240, 180, 120, 35, 18, 8)
        fitted = fit_human_calibration_ellipse(points)
        diagnostics = calibration_stability(points, fitted)
        lengths = [math.hypot(
            pair["first"]["x_px"] - pair["second"]["x_px"],
            pair["first"]["y_px"] - pair["second"]["y_px"],
        ) for pair in diagnostics.pairs]
        self.assertGreater(max(lengths) - min(lengths), 50)
        self.assertEqual(diagnostics.quality, "good")
        self.assertAlmostEqual(fitted.radius_major_px, 120, places=3)
        self.assertAlmostEqual(fitted.radius_minor_px, 35, places=3)

    def test_hole_stability_uses_same_midpoint_diagnostic(self):
        points = ellipse_points(412, 275, 18, 9, 47, 8)
        fitted = fit_human_hole_ellipse(points)
        diagnostics = calibration_stability(points, fitted, "Hole boundary")
        self.assertEqual(diagnostics.quality, "good")
        self.assertEqual(len(diagnostics.midpoints), 4)
        self.assertLess(diagnostics.midpoint_center_offset_px, 1e-3)
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
        fitted = fit_human_calibration_ellipse(ellipse_points(1300, 900, 60, 30, 135, 8))
        self.assertAlmostEqual(fitted.center_x_px, 1300, places=3)
        self.assertAlmostEqual(fitted.center_y_px, 900, places=3)
        self.assertAlmostEqual(fitted.rotation_deg, 135, places=3)

    def test_target_refit_moves_the_authoritative_ellipse_center(self):
        points = ellipse_points(300, 200, 80, 45, 30, 8)
        initial = fit_human_calibration_ellipse(points)
        edited = [point.copy() for point in points]
        edited[0]["x_px"] += 24
        edited[0]["y_px"] += 12
        refitted = fit_human_calibration_ellipse(edited)
        self.assertNotEqual(
            (round(initial.center_x_px, 4), round(initial.center_y_px, 4)),
            (round(refitted.center_x_px, 4), round(refitted.center_y_px, 4)),
        )

    def test_target_calibration_requires_exactly_eight_points(self):
        points = ellipse_points(100, 100, 30, 20, 10, 8)
        self.assertEqual(fit_human_calibration_ellipse(points).point_count, 8)
        for invalid in (points[:7], points + [points[0]]):
            with self.assertRaises(EllipseFitError):
                fit_human_calibration_ellipse(invalid)

    def test_invalid_count_and_degenerate_inputs_are_rejected(self):
        points = ellipse_points(100, 100, 30, 20, 0, 8)
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse(points[:4])
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse(ellipse_points(100, 100, 30, 20, 0, 9))
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse([points[0]] * 8)
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse([{"x_px": index, "y_px": index} for index in range(8)])

    def test_nonfinite_values_are_rejected(self):
        points = ellipse_points(100, 100, 30, 20, 0, 8)
        points[0]["x_px"] = float("nan")
        with self.assertRaises(EllipseFitError):
            fit_human_calibration_ellipse(points)
        points = ellipse_points(100, 100, 30, 20, 0, 8)
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

    def test_per_point_residuals_flag_a_bad_final_diagonal(self):
        points = ellipse_points(100, 100, 50, 30, 20, 8)
        points[1]["x_px"] += 20
        fitted = fit_human_calibration_ellipse(points)
        residuals = ellipse_point_residuals(points, fitted)
        self.assertEqual(len(residuals), 8)
        self.assertGreater(max(residuals), 2)
        self.assertGreater(max(residuals), sum(residuals) / len(residuals))


if __name__ == "__main__":
    unittest.main()
