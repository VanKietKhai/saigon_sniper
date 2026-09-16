"""Independent synthetic tests for benchmark geometry and score derivation."""

from __future__ import annotations

import math
from pathlib import Path
import unittest

from .derivation import (
    DerivationError,
    affine_normalized_distance_mm,
    load_frozen_reference,
    provisional_score_tenths,
)
from .ellipse import EllipseFit


REFERENCE = load_frozen_reference(Path(__file__).parent.parent / "reference_rules.json")


def ellipse(center_x=100, center_y=200, major=100, minor=100, rotation=0):
    return EllipseFit(center_x, center_y, major, minor, rotation, 0, 0,
                      minor / major if major else 0, 8)


class DerivationTests(unittest.TestCase):
    def test_circle_center_and_axis_distances(self):
        fitted = ellipse()
        self.assertAlmostEqual(affine_normalized_distance_mm(fitted, {"x_px": 100, "y_px": 200}, REFERENCE)[0], 0)
        expected = 22.75 * 0.5
        self.assertAlmostEqual(affine_normalized_distance_mm(fitted, {"x_px": 150, "y_px": 200}, REFERENCE)[0], expected)
        self.assertAlmostEqual(affine_normalized_distance_mm(fitted, {"x_px": 100, "y_px": 250}, REFERENCE)[0], expected)

    def test_ellipse_axis_normalization_rotation_and_translation(self):
        fitted = ellipse(500, 700, 200, 80, 30)
        angle = math.radians(30)
        major_hole = {"x_px": 500 + math.cos(angle) * 100, "y_px": 700 + math.sin(angle) * 100}
        minor_hole = {"x_px": 500 - math.sin(angle) * 40, "y_px": 700 + math.cos(angle) * 40}
        expected = 11.375
        self.assertAlmostEqual(affine_normalized_distance_mm(fitted, major_hole, REFERENCE)[0], expected, places=8)
        self.assertAlmostEqual(affine_normalized_distance_mm(fitted, minor_hole, REFERENCE)[0], expected, places=8)
        boundary = {"x_px": 500 + math.cos(angle) * 200, "y_px": 700 + math.sin(angle) * 200}
        self.assertAlmostEqual(affine_normalized_distance_mm(fitted, boundary, REFERENCE)[0], 22.75, places=8)

    def test_ring_1_calibration_does_not_change_the_frozen_score_limit(self):
        self.assertAlmostEqual(REFERENCE.calibration_radius_mm, 22.75)
        self.assertAlmostEqual(REFERENCE.score_1_printed_radius_mm, 22.75)
        self.assertAlmostEqual(REFERENCE.max_valid_shot_center_radius_mm, 25.0)

    def test_invalid_geometry_and_hole_are_rejected(self):
        with self.assertRaises(DerivationError):
            affine_normalized_distance_mm(ellipse(major=0), {"x_px": 1, "y_px": 1}, REFERENCE)
        with self.assertRaises(DerivationError):
            affine_normalized_distance_mm(ellipse(), {"x_px": float("nan"), "y_px": 1}, REFERENCE)

    def test_independent_boundary_scoring(self):
        cases = ((0, 109), (0.25, 109), (0.250001, 108), (0.5, 108), (0.500001, 107),
                 (2.5, 100), (2.500001, 99), (24.75, 11), (24.750001, 10),
                 (25.0, 10), (25.000001, 0), (25.0 + 5e-10, 0))
        for distance, expected in cases:
            score = provisional_score_tenths(distance, REFERENCE)
            self.assertIsInstance(score, int)
            self.assertEqual(score, expected)
            self.assertLessEqual(score, 109)
        self.assertEqual(provisional_score_tenths(30, REFERENCE), 0)
        self.assertNotIn(provisional_score_tenths(25, REFERENCE), range(1, 10))


if __name__ == "__main__":
    unittest.main()
