# Layer-2 homography v1

Specification ID: `saigon_sniper_air_rifle_10m_layer2_homography_v1`.

This benchmark-only specification maps authoritative Layer-1 target cardinal
points from image pixels to millimetres in the target plane. It supplies a
physical shot-center radius to the already frozen
`saigon_sniper_air_rifle_10m_decimal_v1` scoring rule; it does not replace or
change that rule.

## Semantic Layer-1 inputs

The four image-space inputs have explicit semantic identities. They must not
be inferred from click order or ellipse orientation.

| Role | Target-plane coordinate (mm) |
| --- | ---: |
| `12h` | `(0.00, -22.75)` |
| `3h` | `(+22.75, 0.00)` |
| `6h` | `(0.00, +22.75)` |
| `9h` | `(-22.75, 0.00)` |

The 22.75 mm radius is the outer boundary of printed score ring 1. The
authoritative Layer-1 hole center is transformed with the same mapping.

## Homography procedure and invalid geometry

`H_image_to_mm` is the projective homography mapping the four semantic
cardinals above to their fixed target-plane coordinates. Before use, all four
image points and the resulting matrix and inverse must be finite, and the
image quadrilateral must be non-degenerate. NaN, infinity, a collapsed or
collinear quadrilateral, or a non-invertible homography is invalid geometry.

Invalid geometry fails explicitly. There is no fallback to an ellipse center,
pixel-radius approximation, average-diameter scaling, or a source-specific
correction.

For a valid mapping, transform the authoritative hole center `(x_px, y_px)`
to `(x_mm, y_mm)` and calculate:

`radius_mm = sqrt(x_mm² + y_mm²)`

Physical scoring uses `radius_mm`, never a raw-pixel Euclidean distance.

## Scoring connection

Layer 2 supplies only `radius_mm` to
`saigon_sniper_air_rifle_10m_decimal_v1`. Its frozen values remain unchanged:

- pellet radius: 2.25 mm;
- printed ring-1 radius: 22.75 mm;
- maximum valid shot-center radius: 25.00 mm.

The existing decimal boundaries, epsilon, and rounding policy are not
redefined here. In particular, a center at exactly 25.00 mm is a 1.0 hit and a
center beyond 25.00 mm is a miss.

## Independent validation evidence

This design was validated with 192 independently placed manual points across
six sources and four printed rings: ring 2 (20.25 mm), ring 5 (12.75 mm),
ring 6 (10.25 mm), and ring 8 (5.25 mm).

For the five accepted sources (`RIFLE_SRC_0559`, `RIFLE_SRC_0587`,
`RIFLE_SRC_0119`, `RIFLE_SRC_0339`, and `RIFLE_SRC_0532`), 160 points had mean
absolute residual 0.0360 mm, median 0.0222 mm, p95 0.1118 mm, maximum 0.2072
mm, and 0/160 above 0.25 mm. No shared inner-radius worsening or common
directional bias was observed.

This is validation evidence, not a guarantee of zero error for every future
image.

`RIFLE_SRC_0284` is retained as evidence but has status
`SOURCE_SPECIFIC_EXCLUDE_FROM_LAYER2_ACCEPTANCE`: its upper/right inner region
showed a repeatable source-specific distortion gradient. Do not delete or
alter its Layer-1 consensus and do not build a special correction model.
