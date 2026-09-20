"""Synthetic geometry tests for human calibration ellipse fitting."""

from __future__ import annotations

import math
import unittest
from unittest.mock import patch

from .ellipse import (EllipseFitError, LeaveOneOutPointDiagnostics,
                      OppositePairMidpointDiagnostics, assisted_diagonal_predictions,
                      calibration_stability, cardinal_projective_center, ellipse_point_residuals,
                      fit_human_calibration_ellipse, fit_human_hole_ellipse,
                      hole_cardinal_center,
                      leave_one_out_point_diagnostics, opposite_pair_midpoint_diagnostics,
                      pair_point_recommendations, target_ghost_loo_confidence)


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


def projective_circle_points(center_x, center_y, radius):
    """Eight circle points under a fixed non-affine image homography."""
    homography = ((1.12, 0.18, 140), (0.09, 0.94, 75), (0.0022, -0.0014, 1))

    def project(x_value, y_value):
        denominator = homography[2][0] * x_value + homography[2][1] * y_value + homography[2][2]
        return {
            "x_px": (homography[0][0] * x_value + homography[0][1] * y_value + homography[0][2]) / denominator,
            "y_px": (homography[1][0] * x_value + homography[1][1] * y_value + homography[1][2]) / denominator,
        }

    # Start at physical 12h and proceed clockwise in image coordinates.
    clock = [project(center_x + radius * math.sin(index * math.pi / 4), center_y - radius * math.cos(index * math.pi / 4)) for index in range(8)]
    points = [
        {**clock[0], "semantic_role": "12h"}, {**clock[2], "semantic_role": "3h"},
        {**clock[4], "semantic_role": "6h"}, {**clock[6], "semantic_role": "9h"},
        clock[1], clock[3], clock[5], clock[7],
    ]
    return points, project(center_x, center_y)


class EllipseFitTests(unittest.TestCase):
    def test_hole_cardinal_center_recovers_projected_physical_center_without_ellipse_authority(self):
        points, physical_center = projective_circle_points(500, 500, 100)
        hole_points = [
            {**points[0], "semantic_role": "hole_12h"},
            {**points[1], "semantic_role": "hole_3h"},
            {**points[2], "semantic_role": "hole_6h"},
            {**points[3], "semantic_role": "hole_9h"},
            *points[4:],
        ]
        fitted = fit_human_hole_ellipse(hole_points)
        diagnostic = hole_cardinal_center(hole_points[:4], fitted)
        self.assertTrue(diagnostic.available)
        self.assertAlmostEqual(diagnostic.cardinal_center_x_px, physical_center["x_px"], places=5)
        self.assertAlmostEqual(diagnostic.cardinal_center_y_px, physical_center["y_px"], places=5)
        self.assertGreater(diagnostic.distance_px, 0.25)

    def test_hole_cardinal_center_rejects_missing_or_parallel_semantic_anchors(self):
        missing = [{"x_px": 0, "y_px": 0}] * 4
        self.assertFalse(hole_cardinal_center(missing).available)
        parallel = [
            {"x_px": 0, "y_px": 0, "semantic_role": "hole_12h"},
            {"x_px": 0, "y_px": 2, "semantic_role": "hole_3h"},
            {"x_px": 2, "y_px": 0, "semantic_role": "hole_6h"},
            {"x_px": 2, "y_px": 2, "semantic_role": "hole_9h"},
        ]
        self.assertFalse(hole_cardinal_center(parallel).available)
    def test_cardinal_projective_center_recovers_physical_center_under_perspective(self):
        points, physical_center = projective_circle_points(500, 500, 100)
        fitted = fit_human_calibration_ellipse(points)
        diagnostic = cardinal_projective_center(points, fitted)
        self.assertTrue(diagnostic.available)
        self.assertAlmostEqual(diagnostic.cardinal_center_x_px, physical_center["x_px"], places=5)
        self.assertAlmostEqual(diagnostic.cardinal_center_y_px, physical_center["y_px"], places=5)
        self.assertGreater(diagnostic.distance_px, 0.25)
        # The diagnostic does not replace the existing ellipse authority.
        self.assertEqual(fitted.bull_center_x_px, fitted.center_x_px)
        self.assertEqual(fitted.bull_center_y_px, fitted.center_y_px)

    def test_cardinal_projective_center_uses_semantic_mapping_not_raw_click_order(self):
        points, physical_center = projective_circle_points(500, 500, 100)
        shuffled = [points[index] for index in (3, 7, 1, 5, 0, 4, 2, 6)]
        diagnostic = cardinal_projective_center(shuffled, fit_human_calibration_ellipse(shuffled))
        self.assertTrue(diagnostic.available)
        self.assertAlmostEqual(diagnostic.cardinal_center_x_px, physical_center["x_px"], places=5)
        self.assertAlmostEqual(diagnostic.cardinal_center_y_px, physical_center["y_px"], places=5)
        self.assertEqual(diagnostic.vertical_diameter["first"]["clock_label"], "12h")
        self.assertEqual(diagnostic.vertical_diameter["second"]["clock_label"], "6h")
        self.assertEqual(diagnostic.horizontal_diameter["first"]["clock_label"], "9h")
        self.assertEqual(diagnostic.horizontal_diameter["second"]["clock_label"], "3h")

    def test_cardinal_projective_center_marks_parallel_diameters_unavailable(self):
        points = ellipse_points(100, 100, 50, 30, 0, 8)
        fitted = fit_human_calibration_ellipse(points)
        points[0]["semantic_role"] = "12h"; points[1]["semantic_role"] = "3h"
        points[2]["semantic_role"] = "6h"; points[3]["semantic_role"] = "9h"
        points[0].update(x_px=10.0, y_px=10.0); points[2].update(x_px=10.0, y_px=90.0)
        points[3].update(x_px=30.0, y_px=10.0); points[1].update(x_px=30.0, y_px=90.0)
        diagnostic = cardinal_projective_center(points, fitted)
        self.assertFalse(diagnostic.available)
        self.assertEqual(diagnostic.reason, "near_parallel_diameters")

    def test_four_cardinal_anchors_predict_affine_diagonals_without_finalizing_them(self):
        anchors = [{"x_px": 100, "y_px": 40}, {"x_px": 180, "y_px": 100},
                   {"x_px": 100, "y_px": 160}, {"x_px": 20, "y_px": 100}]
        predictions = assisted_diagonal_predictions(anchors)
        self.assertEqual(len(predictions), 4)
        self.assertAlmostEqual(predictions[0]["x_px"], 156.5685, places=3)
        self.assertAlmostEqual(predictions[0]["y_px"], 142.4264, places=3)
        self.assertEqual(len(anchors), 4, "Ghost predictions must not finalize points.")

    def test_ghost_correction_vector_points_from_current_diagonal_to_prediction(self):
        anchors = [{"x_px": 100, "y_px": 40}, {"x_px": 180, "y_px": 100},
                   {"x_px": 100, "y_px": 160}, {"x_px": 20, "y_px": 100}]
        ghost = assisted_diagonal_predictions(anchors)[0]
        current = {"x_px": ghost["x_px"] - 3, "y_px": ghost["y_px"] - 2}
        self.assertGreater(ghost["x_px"] - current["x_px"], 0)
        self.assertGreater(ghost["y_px"] - current["y_px"], 0)
        self.assertAlmostEqual(math.hypot(ghost["x_px"] - current["x_px"], ghost["y_px"] - current["y_px"]), math.sqrt(13))

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

    def test_opposite_pair_midpoints_are_zero_for_symmetric_rotated_ellipse(self):
        points = ellipse_points(300, 200, 80, 35, 31, 8)
        diagnostics = opposite_pair_midpoint_diagnostics(points, fit_human_calibration_ellipse(points))
        self.assertEqual(len(diagnostics.pairs), 4)
        self.assertLess(diagnostics.midpoint_rms_px, 1e-3)
        self.assertLess(diagnostics.midpoint_max_px, 1e-3)

    def test_midpoint_diagnostics_ignore_click_order_and_flag_shifted_pair(self):
        points = ellipse_points(300, 200, 80, 35, 31, 8)
        shifted = [point.copy() for point in points]
        shifted[1]["x_px"] += 20
        shuffled = [shifted[index] for index in (3, 7, 1, 5, 0, 4, 2, 6)]
        diagnostics = opposite_pair_midpoint_diagnostics(shuffled, fit_human_calibration_ellipse(shuffled))
        self.assertGreater(diagnostics.midpoint_max_px, 2.5)
        self.assertEqual(max(pair["distance_px"] for pair in diagnostics.pairs), diagnostics.midpoint_max_px)

    def test_midpoint_pair_numbering_is_canonical_from_local_twelve_oclock(self):
        points = ellipse_points(300, 200, 80, 35, 31, 8)
        shuffled = [points[index] for index in (3, 7, 1, 5, 0, 4, 2, 6)]
        diagnostics = opposite_pair_midpoint_diagnostics(shuffled, fit_human_calibration_ellipse(shuffled))
        # Clockwise from local 12h: 12↔6, 1h30↔7h30, 3↔9, 4h30↔10h30.
        expected_coordinates = [
            (points[6], points[2]), (points[7], points[3]),
            (points[0], points[4]), (points[1], points[5]),
        ]
        for pair, (first, second) in zip(diagnostics.pairs, expected_coordinates):
            actual_first = shuffled[pair["first_point_index"]]
            actual_second = shuffled[pair["second_point_index"]]
            self.assertAlmostEqual(actual_first["x_px"], first["x_px"], places=5)
            self.assertAlmostEqual(actual_first["y_px"], first["y_px"], places=5)
            self.assertAlmostEqual(actual_second["x_px"], second["x_px"], places=5)
            self.assertAlmostEqual(actual_second["y_px"], second["y_px"], places=5)

    def test_midpoint_correction_vector_points_from_midpoint_to_fitted_center(self):
        points = ellipse_points(300, 200, 80, 35, 31, 8)
        points[1]["x_px"] += 20
        diagnostics = opposite_pair_midpoint_diagnostics(points, fit_human_calibration_ellipse(points))
        pair = max(diagnostics.pairs, key=lambda item: item["distance_px"])
        self.assertLess(pair["dx_px"], 0, "Midpoint right of center needs a left correction.")
        self.assertAlmostEqual(pair["distance_px"], math.hypot(pair["dx_px"], pair["dy_px"]), places=9)

    def test_leave_one_out_identifies_one_bad_point_and_points_back_to_ellipse(self):
        points = ellipse_points(300, 200, 80, 35, 31, 8)
        points[0]["y_px"] += 15
        fitted = fit_human_calibration_ellipse(points)
        diagnostics = leave_one_out_point_diagnostics(points, fitted)
        worst = max(diagnostics.points, key=lambda item: item["loo_residual_px"])
        self.assertEqual(worst["point_index"], 0)
        self.assertGreater(worst["loo_residual_px"], 5)
        self.assertLess(worst["loo_dy_px"], 0, "The shifted-down point should be corrected upward.")
        self.assertAlmostEqual(worst["loo_distance_px"], math.hypot(worst["loo_dx_px"], worst["loo_dy_px"]), places=6)

    def test_leave_one_out_keeps_counterpart_low_and_recommends_bad_endpoint(self):
        points = ellipse_points(300, 200, 80, 35, 31, 8)
        points[0]["y_px"] += 15
        fitted = fit_human_calibration_ellipse(points)
        midpoint = opposite_pair_midpoint_diagnostics(points, fitted)
        leave_one_out = leave_one_out_point_diagnostics(points, fitted)
        recommendations = pair_point_recommendations(midpoint, leave_one_out)
        bad_pair = next(pair for pair in midpoint.pairs if 0 in (pair["first_point_index"], pair["second_point_index"]))
        recommendation = next(item for item in recommendations if item["pair_index"] == bad_pair["pair_index"])
        counterpart = bad_pair["second_point_index"] if bad_pair["first_point_index"] == 0 else bad_pair["first_point_index"]
        by_index = {item["point_index"]: item for item in leave_one_out.points}
        self.assertLess(by_index[counterpart]["loo_residual_px"], by_index[0]["loo_residual_px"] / 1.5)
        self.assertEqual(recommendation["recommendation"], "check_point")
        self.assertEqual(recommendation["recommended_point_index"], 0)

    def test_leave_one_out_names_stay_canonical_after_shuffled_clicks(self):
        points = ellipse_points(300, 200, 80, 35, 31, 8)
        shuffled = [points[index] for index in (3, 7, 1, 5, 0, 4, 2, 6)]
        diagnostics = leave_one_out_point_diagnostics(shuffled, fit_human_calibration_ellipse(shuffled))
        self.assertEqual(
            [item["clock_label"] for item in sorted(diagnostics.points, key=lambda item: item["clock_position_index"])],
            ["12h", "1h30", "3h", "4h30", "6h", "7h30", "9h", "10h30"],
        )

    def test_similar_endpoint_residuals_recommend_checking_both(self):
        midpoint = OppositePairMidpointDiagnostics(({
            "pair_index": 1, "first_point_index": 0, "second_point_index": 4, "distance_px": 2.0,
        },), 2.0, 2.0, 0.0, 0.0)
        leave_one_out = LeaveOneOutPointDiagnostics((
            {"point_index": 0, "loo_residual_px": 2.1}, {"point_index": 4, "loo_residual_px": 1.8},
        ))
        recommendation = pair_point_recommendations(midpoint, leave_one_out)[0]
        self.assertEqual(recommendation["recommendation"], "check_both")

    def test_low_endpoint_residuals_with_high_pair_offset_checks_other_pairs(self):
        midpoint = OppositePairMidpointDiagnostics(({
            "pair_index": 1, "first_point_index": 0, "second_point_index": 4, "distance_px": 3.0,
        },), 3.0, 3.0, 0.0, 0.0)
        leave_one_out = LeaveOneOutPointDiagnostics((
            {"point_index": 0, "loo_residual_px": 0.4}, {"point_index": 4, "loo_residual_px": 0.5},
        ))
        recommendation = pair_point_recommendations(midpoint, leave_one_out)[0]
        self.assertEqual(recommendation["recommendation"], "check_other_pairs")
        self.assertIsNone(recommendation["recommended_point_index"])

    def test_hole_leave_one_out_is_available_and_detects_bad_boundary_point(self):
        points = ellipse_points(412, 275, 18, 9, 47, 8)
        points[5]["y_px"] -= 8
        diagnostics = leave_one_out_point_diagnostics(points, fit_human_hole_ellipse(points), "Hole boundary")
        self.assertEqual(max(diagnostics.points, key=lambda item: item["loo_residual_px"])["point_index"], 5)

    def test_target_ghost_and_loo_agreement_and_disagreement_are_advisory(self):
        anchors = [{"x_px": 100, "y_px": 40}, {"x_px": 180, "y_px": 100},
                   {"x_px": 100, "y_px": 160}, {"x_px": 20, "y_px": 100}]
        ghosts = assisted_diagonal_predictions(anchors)
        points = anchors + [{"x_px": ghost["x_px"] - 3, "y_px": ghost["y_px"] - 2} for ghost in ghosts]
        leave_one_out = LeaveOneOutPointDiagnostics(tuple(
            {"point_index": index, "loo_dx_px": (3 if index == 4 else -3), "loo_dy_px": (2 if index == 4 else 2), "loo_distance_px": math.sqrt(13)}
            for index in range(8)
        ))
        confidence = {item["point_index"]: item["status"] for item in target_ghost_loo_confidence(points, leave_one_out)}
        self.assertEqual(confidence[4], "high")
        self.assertEqual(confidence[5], "inconsistent")


if __name__ == "__main__":
    unittest.main()
