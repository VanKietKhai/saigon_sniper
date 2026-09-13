# Air Rifle 10 m decimal reference rules

Rule set: `saigon_sniper_air_rifle_10m_decimal_v1`.

This is the frozen project reference scoring specification for Air Rifle 10 m
single-shot benchmarking. It is independent benchmark documentation, not an
import of production `scoring.py`. Any future scoring-rule change must create
a new rule-set version.

## Physical geometry

Printed target geometry:

- Score-1 diameter: 45.5 mm
- Score-1 radius: 22.75 mm
- Nominal integer-ring radial spacing: 2.5 mm

Projectile geometry:

- Nominal calibre/diameter: 4.5 mm
- Nominal radius: 2.25 mm

The score-1 printed-ring radius and pellet radius are distinct. A shot center
is a valid scoring hit through the pellet-edge-touch condition:

```text
22.75 mm printed score-1 radius + 2.25 mm pellet radius = 25.00 mm
```

Therefore the maximum valid shot-center radius is 25.00 mm.

## Decimal scoring rule

Let `d` be Euclidean distance in millimeters from target center to pellet-hole
center. The range from 1.0 through 10.9 has 100 discrete tenth-point values:

```text
25.00 mm / 100 = 0.25 mm per 0.1 point
```

For `d > 25.00 mm`, return a miss: 0.0. For `d <= 25.00 mm`, calculate integer
tenths independently as:

```text
raw_tenths = (11.0 - d / 2.5) * 10
score_tenths = min(109, floor(raw_tenths + epsilon))
score = score_tenths / 10
```

Use a small `epsilon = 1e-9` only to protect exact mathematical decimal-zone
boundaries from floating-point representation error. It must not extend the
physical 25.00 mm outer radius.

Every additional 0.25 mm of center distance lowers the score by exactly 0.1
point. The highest valid score is 10.9 (109 tenths), the lowest scoring hit is
1.0 (10 tenths), and 0.0 is a miss. Scores 0.1 through 0.9 are not valid
scoring hits.

## Boundary semantics

An exact boundary receives the higher score. Each zone is open at its inner
lower boundary and closed at its outer upper boundary, except the central zone:

| Distance `d` | Score |
|---|---:|
| 0.000000 <= d <= 0.250000 mm | 10.9 |
| 0.250000 < d <= 0.500000 mm | 10.8 |
| 0.500000 < d <= 0.750000 mm | 10.7 |
| 0.750000 < d <= 1.000000 mm | 10.6 |
| ... continuing in 0.25 mm intervals | ... |
| 24.500000 < d <= 24.750000 mm | 1.1 |
| 24.750000 < d <= 25.000000 mm | 1.0 |
| d > 25.000000 mm | 0.0 / miss |

Examples: 0.000000 and 0.250000 score 10.9; 0.250001 scores 10.8;
24.750000 scores 1.1; 24.750001 and 25.000000 score 1.0; 25.000001 is a miss.

## Ground Truth Labeler calibration

Ground Truth Labeler V1 uses the outer black aiming-area / 4-ring boundary as
its independent scale reference. Its nominal diameter is 30.5 mm. The labeler
uses 5–8 human-selected points followed by an ellipse fit, preserving the
points, center, x/y radii, rotation, and fit residual. The ellipse-derived
center is the normal target center for ground-truth geometry.

The labeler uses a precise human-confirmed hole center. It must not use
production YOLO bounding boxes or `best.pt` output as ground truth.
