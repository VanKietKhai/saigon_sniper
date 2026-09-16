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

## R1.3D.6 provisional human-geometry derivation

After accepted calibration and one human-confirmed hole center, the labeler
posts raw human geometry to `/api/derive`. The backend refits the ellipse and
uses the frozen reference rule set, independently of production scoring. It
derives local ellipse-axis diagnostics `mm_per_px_major` and
`mm_per_px_minor`, then calculates distance as:

```text
R_mm * sqrt((u_px / major_radius_px)^2 + (v_px / minor_radius_px)^2)
```

where `u_px` and `v_px` are the hole displacement along the normalized ellipse
major and minor axes, and `R_mm` is the 15.25 mm calibration radius. This is an
affine / moderate-perspective normalization, not projective homography
rectification; severe perspective still requires human review or exclusion.

The frozen reference independently derives a provisional integer-tenths score.
The strict physical 25.0 mm outer radius has no epsilon extension; only decimal
zone arithmetic uses its frozen numerical epsilon. A result is always labeled
**PROVISIONAL — NOT YET SAVED GROUND TRUTH**. Any source, calibration, or hole
center change clears it. No distance, scale, score, or annotation is persisted.

## Precision labeling workflow

For precision work, keep Browser/Page Zoom at **100%** and use the Labeler
image zoom controls for magnification. At an effective scale of one or more
original image pixels per CSS pixel, the canvas disables image smoothing so
source pixels remain distinct. The optional precision loupe samples those
original pixels with nearest-neighbor rendering; it is visual-only and cannot
change stored coordinates.

The desktop layout keeps the image viewport stationary and vertically centered
in Fit view while the control panel scrolls independently. `W`, `A`, `S`, `D`
and arrow keys pan the view by 60 CSS pixels; `Shift` uses 240 pixels and `Alt`
uses 15 pixels. Holding `Space` while left-dragging temporarily pans without
changing the selected calibration or hole-center mode. All of these controls
change only the display transform; saved geometry remains in original-image
pixels.

## R1.3E.1b eight-point hole ellipse

The current hole workflow replaces the historical single-click center with
exactly eight human-selected hole-boundary points in original-image
coordinates. It is enabled only after accepted target calibration. The browser
numbers the points, permits undo/clear, rejects a ninth point, and requires an
explicit fit followed by **Xác nhận tâm lỗ đạn** before derivation or saving.
Zoom, pan, loupe, and pixel mode affect only display.

The server validates all eight points as finite, nonnegative, distinct,
non-collinear, and inside the verified source dimensions. OpenCV fits only
those supplied points; it never uses image pixels. The fitted center is the
only authoritative hole center for derivation and persistence. A submitted
freehand `hole_center` is not accepted as authority. New records store the raw
eight points, `hole_center_method=ellipse_8pt_v2`, and fitted ellipse geometry
plus RMS/max residual diagnostics.

Legacy single-click CSV storage is deliberately not appended with the new
header. This prevents a restarted ellipse pilot from silently mixing schemas
with aborted old-UI evidence; preserve that evidence and start a separately
approved new-pilot storage file.
