import unittest

from scoring import TARGET_SPECS, normalize_target_type, score_issf_decimal_tenths


class DecimalScoringTests(unittest.TestCase):
    def test_target_specifications(self):
        self.assertEqual(TARGET_SPECS["air_rifle_10m"]["max_scoring_radius_mm"], 25.0)
        self.assertEqual(TARGET_SPECS["air_pistol_10m"]["max_scoring_radius_mm"], 80.0)

    def test_air_rifle_decimal_boundaries(self):
        cases = [
            (0.00000, 109),
            (0.25000, 109),
            (0.25001, 108),
            (0.50000, 108),
            (0.50001, 107),
            (2.50000, 100),
            (2.50001, 99),
            (25.00000, 10),
            (25.00001, 0),
        ]
        for distance_mm, expected_tenths in cases:
            with self.subTest(distance_mm=distance_mm):
                self.assertEqual(
                    score_issf_decimal_tenths(distance_mm, "air_rifle_10m"),
                    expected_tenths,
                )

    def test_air_pistol_decimal_boundaries(self):
        cases = [
            (0.00000, 109),
            (0.80000, 109),
            (0.80001, 108),
            (8.00000, 100),
            (8.00001, 99),
            (80.00000, 10),
            (80.00001, 0),
        ]
        for distance_mm, expected_tenths in cases:
            with self.subTest(distance_mm=distance_mm):
                self.assertEqual(
                    score_issf_decimal_tenths(distance_mm, "air_pistol_10m"),
                    expected_tenths,
                )

    def test_aliases_and_unknown_target_type(self):
        self.assertEqual(normalize_target_type("bia_nho"), "air_rifle_10m")
        self.assertEqual(normalize_target_type("bia_lon"), "air_pistol_10m")
        with self.assertRaises(ValueError):
            normalize_target_type("unsupported_target")


if __name__ == "__main__":
    unittest.main()
