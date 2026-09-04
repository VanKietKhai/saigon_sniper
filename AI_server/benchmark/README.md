# Single-shot AI scoring benchmark

This directory defines the metadata for a single-shot accuracy benchmark for
Saigon Sniper AI scoring. It covers only 10 m Air Rifle and 10 m Air Pistol,
with one shot per target. Multi-shot behavior is out of scope.

Raw target images remain local under `AI_server/test_images/` and are
intentionally ignored by Git. The `filename` field in `metadata.csv` is a
path relative to that local image directory.

## Metadata fields

`benchmark_id` is a stable record identifier. `filename` identifies the local
image. `target_type` is either `air_rifle_10m` or `air_pistol_10m`.

`reference_score_tenths` is the canonical trusted score, represented as an
integer number of tenths: `96` means 9.6, `109` means 10.9, and `0` is a
miss. It must not be filled with an AI prediction.

`reference_status` may be `unlabeled`, `verified`, or `disputed`.
`reference_source` records the independent trusted scoring source.
`provenance` may be `definitely_unseen`, `possibly_training`,
`known_training`, or `unknown`.
`split` may be `development`, `holdout`, or `excluded`.
`include_in_benchmark` controls whether a record is eligible for the selected
benchmark. `image_sha256` identifies the exact local image file. `notes` is
for objective capture or labeling context.

Set `include_in_benchmark=true` only when the reference status is `verified`,
a trusted `reference_score_tenths` exists, and the image is approved for its
selected split.

Final accuracy claims may use only records where all of the following are
true:

- `provenance=definitely_unseen`
- `split=holdout`
- `reference_status=verified`
- `include_in_benchmark=true`

Existing records deliberately start as unlabeled, with unknown provenance and
no reference score. AI predictions are not ground truth and must not be
entered into this metadata.

## Future R1 metrics

The future single-shot benchmark runner will report pipeline metrics:

- HTTP success rate
- bull detection rate
- hole detection rate
- raw multiple-hole detection rate
- end-to-end successful scoring rate

It will also report scoring accuracy metrics for eligible, independently
labeled records:

- exact score accuracy
- plus/minus 0.1 accuracy
- plus/minus 0.2 accuracy
- mean absolute error
- maximum absolute error

For a one-shot image, `raw_hole_count > 1` is recorded as detection ambiguity
or a possible false positive. It is not automatically an HTTP or pipeline
failure if the API still returns one valid score, but it must be tracked
separately.

## Rifle source manifest

`rifle_source_manifest.csv` records the external 600-image, single-shot Air
Rifle source pool. Raw source images remain outside Git and are not copied
into this repository. Each record has a stable `RIFLE_SRC_` identifier and a
SHA-256 hash so that the original source image is permanently identifiable.

All source-pool records initially remain unlabeled and unassigned. DNG files
are retained in the manifest, but backend compatibility for them is not yet
established. No image may become a final holdout because of an AI prediction;
final holdout selection occurs only after independent ground-truth labeling.
