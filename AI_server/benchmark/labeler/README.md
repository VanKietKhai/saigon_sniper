# Ground Truth Labeler

This local utility creates independent, human-confirmed ground-truth geometry
for Saigon Sniper benchmarking. It is separate from production detection and
scoring services.

## V1 scope

V1 targets the Air Rifle 10 m single-shot JPG pilot. Its intended workflow is:

```text
manifest identity verification
→ human calibration points
→ ellipse fit
→ human hole center
→ derived geometry
→ provisional score
→ append-only save
→ independent repeat pass
→ later human consensus
```

The frozen reference rule set is
`saigon_sniper_air_rifle_10m_decimal_v1`. Raw human geometry, rather than a
derived score, is the authoritative annotation record. A provisional annotation
`derived_score_tenths` is not automatically trusted ground truth; only later
reviewed consensus can establish `reference_score_tenths`.

## Deferred from V1

- DNG support
- Air Pistol
- automatic computer-vision suggestions
- AI overlays or prediction-based labels
- automatic scoring authority
- perspective rectification
- multi-shot workflows

## Independence and local path safety

Production model predictions, `best.pt`, and YOLO are never authoritative
ground truth. The utility must not load them.

Raw source images remain outside this repository. A future runtime dataset root
must be supplied through local runtime configuration, such as an environment
variable or CLI argument; it must not be committed in source or annotation
records. Before any annotation is saved, the future utility must verify the
image SHA-256 against `rifle_source_manifest.csv`.

## R1.3D.1 scaffold

Only `GET /health` and the static placeholder UI exist in this stage. Image
loading, source-manifest browsing, calibration fitting, scoring, and annotation
saving are intentionally not implemented.
