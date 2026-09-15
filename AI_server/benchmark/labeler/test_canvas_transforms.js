"use strict";

const assert = require("assert");
const transforms = require("./static/canvas_transform.js");

function assertPoint(actual, expected, label) {
  assert(
    transforms.pointsNearlyEqual(actual, expected),
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const original = { x: 1234.56, y: 987.65 };

// A: scale 1, zero pan maps image coordinates exactly to display coordinates.
assertPoint(
  transforms.displayToImage(original, { scale: 1, panX: 0, panY: 0 }),
  original,
  "one-to-one mapping",
);

// B–D: inverse mapping works for smaller/larger scale and nonzero pan.
for (const view of [
  { scale: 0.5, panX: 0, panY: 0 },
  { scale: 2.75, panX: 310.25, panY: -87.5 },
]) {
  assertPoint(
    transforms.displayToImage(transforms.imageToDisplay(original, view), view),
    original,
    "image/display round trip",
  );
}

// E: zoom retains the image point under the display pointer.
const pointer = { x: 400, y: 300 };
const beforeZoom = { scale: 0.5, panX: 30, panY: 40 };
const afterZoom = transforms.zoomAroundDisplayPoint(beforeZoom, pointer, 1.25);
assertPoint(
  transforms.displayToImage(pointer, afterZoom),
  transforms.displayToImage(pointer, beforeZoom),
  "pointer-anchored zoom",
);

// F: panning is a display-only operation; original-image coordinates remain exact.
const beforePan = { scale: 2, panX: 140, panY: -30 };
const afterPan = transforms.panView(beforePan, { x: -180, y: 95 });
assertPoint(
  transforms.displayToImage(transforms.imageToDisplay(original, afterPan), afterPan),
  original,
  "view-only pan mapping",
);

// G: devicePixelRatio never participates in CSS-space transforms.
const cssView = { scale: 1, panX: 12, panY: 24 };
assertPoint(
  transforms.displayToImage({ x: 112, y: 224 }, cssView),
  { x: 100, y: 200 },
  "retina-independent CSS coordinate mapping",
);

// H: bounds checks reject outside clicks rather than clamping them.
assert.strictEqual(transforms.pointIsInsideImage({ x: -0.01, y: 1 }, { width: 10, height: 10 }), false);
assert.strictEqual(transforms.pointIsInsideImage({ x: 10, y: 1 }, { width: 10, height: 10 }), false);
assert.strictEqual(transforms.pointIsInsideImage({ x: 9.99, y: 9.99 }, { width: 10, height: 10 }), true);

console.log("canvas transform tests: PASS");
