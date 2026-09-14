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

## R1.3D.2 read-only source access

The labeler now reads the committed rifle source manifest and provides
`GET /api/sources`, `GET /api/sources/{source_id}`, and
`GET /api/sources/{source_id}/image`. The dataset root is supplied only through
the `SAIGON_SNIPER_DATASET_ROOT` environment variable. It is never committed or
returned to the browser.

JPG/JPEG files are resolved only through manifest `source_id`, kept beneath the
configured dataset root, and SHA-256 verified before serving. DNG records stay
visible in metadata but return `unsupported_format`; they are not decoded or
converted. Annotation saving remains unimplemented.

## R1.3D.3 inspection canvas

The browser loads a source image only from the verified image endpoint and
renders the decoded JPG in a high-DPI canvas. Canvas backing dimensions follow
`devicePixelRatio`; all interaction math remains in CSS pixels. The view scale
is CSS display pixels per original image pixel, so **100% / 1:1** means one
original pixel is one CSS display pixel even on Retina displays.

Fit centers the complete image with a small margin and preserves its aspect
ratio. Wheel zoom is pointer-anchored and bounded; visible zoom controls zoom
around the viewport center. Toggle **Pan mode** to drag the image. Toggle
**Calibration mode** to click transient calibration points. Each point is
stored as floating-point original-image coordinates (`x_px`, `y_px`) and is
never stored as canvas or screen coordinates. Pan and zoom do not change those
coordinates.

Calibration capture is enabled only after a manifest-verified JPG loads and
decodes. It accepts at most eight points, shows when the future five-point
minimum is reached, and supports transient undo and confirmed clear. Changing
source requires confirmation before existing transient points are discarded.
No points are persisted, and ellipse fitting, hole-center annotation, scoring,
and annotations remain unimplemented.

## R1.3D.4 human calibration fit

With 5–8 human-selected image-space calibration points, the labeler posts only
those coordinates to its local geometry endpoint. OpenCV `fitEllipse` is used
solely to fit that supplied geometry; it never reads image pixels to choose or
adjust a ring. The result is normalized to `radius_major_px >=
radius_minor_px`, with `rotation_deg` as the major-axis orientation in
`[0, 180)`.

Fit quality is a radial RMS residual in pixels. Each selected point is
transformed into ellipse-local coordinates, projected to the ellipse along its
center-to-point ray, and measured to that radial intersection. It is not an
orthogonal nearest-distance residual. The UI also reports maximum radial
residual and the non-authoritative `minor_radius / major_radius` axis ratio.

The fitted ellipse center is the transient V1 target center. The overlay and
center marker are transformed from original-image coordinates on every render,
so zoom, pan, Fit, and 100% view cannot mutate the fit. Fit acceptance and
redo are transient only: no annotation, score, physical scale, or hole center
is stored or calculated.

## R1.3D.5 human hole center

Only after a verified JPG has a fitted **and accepted** transient calibration,
the explicit **Hole Center mode** accepts one human-confirmed image-space click
as `x_px` and `y_px`. It neither detects nor adjusts the click from image
content. A second click requires replacement confirmation; Clear removes only
the in-memory center. The green square/cross marker uses the same image-to-
display transform as all calibration geometry, so view changes do not alter its
stored original-image coordinates.

Changing calibration points, refitting, redoing calibration, or changing the
source clears the transient hole center. Hole boundary points for torn or
ambiguous holes remain deferred to a later review workflow. This stage does not
calculate distance, scale, or any score, and it does not persist annotations.
