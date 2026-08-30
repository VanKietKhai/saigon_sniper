import math


TARGET_SPECS = {
    "air_rifle_10m": {
        "black_radius_mm": 15.25,
        "ring_gap_mm": 2.5,
        "max_scoring_radius_mm": 25.0,
    },
    "air_pistol_10m": {
        "black_radius_mm": 29.75,
        "ring_gap_mm": 8.0,
        "max_scoring_radius_mm": 80.0,
    },
}
TARGET_TYPE_ALIASES = {
    "air_rifle_10m": "air_rifle_10m",
    "bia_nho": "air_rifle_10m",
    "sung_truong": "air_rifle_10m",
    "súng trường": "air_rifle_10m",
    "air_pistol_10m": "air_pistol_10m",
    "bia_lon": "air_pistol_10m",
    "sung_ngan": "air_pistol_10m",
    "súng ngắn": "air_pistol_10m",
}
DECIMAL_BOUNDARY_EPSILON = 1e-9


def normalize_target_type(target_type):
    normalized = target_type.strip().lower()
    try:
        return TARGET_TYPE_ALIASES[normalized]
    except KeyError as error:
        raise ValueError(f"Unsupported target_type: {target_type}") from error


def score_issf_decimal_tenths(distance_mm, target_type):
    """Return the deterministic ISSF-style decimal score in integer tenths."""
    spec = TARGET_SPECS[normalize_target_type(target_type)]
    max_scoring_radius_mm = spec["max_scoring_radius_mm"]
    ring_gap_mm = spec["ring_gap_mm"]

    if distance_mm > max_scoring_radius_mm + DECIMAL_BOUNDARY_EPSILON:
        return 0

    raw_tenths = (11.0 - (distance_mm / ring_gap_mm)) * 10
    return max(0, min(109, math.floor(raw_tenths + DECIMAL_BOUNDARY_EPSILON)))
