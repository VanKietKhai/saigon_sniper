# Ground Truth Consensus Layer 1 v1

## Scope

This file freezes Layer-1 geometry from the 20-source Pass A/Pass B pilot. It does not freeze Layer 2 or any final score.

## Inputs

- Raw annotations: `AI_server/benchmark/annotations/ground_truth_annotations.csv`
- Raw SHA-256: `0B02DFEB7219A7D0A097BC240B608DAB77D610F14B2C7B5D580B8C4B98C2E856`
- Twenty matched Pass A/Pass B source pairs from the committed pilot.

## Consensus geometry rule

For each semantic cardinal point (`12h`, `3h`, `6h`, `9h`) of both target and hole, Layer 1 stores the arithmetic mean of the corresponding Pass A and Pass B coordinates.

The authoritative centers are intersections of infinite cardinal diameter lines:

- target center: averaged 12h-to-6h and 9h-to-3h lines;
- hole center: averaged 12h-to-6h and 9h-to-3h lines.

Centers are not direct averages of prior A/B centers, and an ellipse center is not authoritative. Diagonal points have no stable semantic correspondence and are not consensus-authoritative.

## Layer 2 and scoring

Layer 2 is not frozen by this artifact. No final scores are generated or accepted here. The CSV intentionally contains no `reference_score_tenths` or other final-score field.

## Review status

Nineteen sources are `ACCEPTED`. `RIFLE_SRC_0312` is `REVIEW_REQUIRED` with reason `hole_6h_torn_paper_ambiguity`. Its Layer-1 geometry is preserved unchanged; the irregular/torn lower pellet-hole boundary requires adjudication before any Layer-2 use. Neither raw pass is replaced or altered.
