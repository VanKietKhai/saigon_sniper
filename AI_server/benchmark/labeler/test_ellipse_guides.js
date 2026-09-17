"use strict";

const assert = require("assert");
const guides = require("./static/ellipse_guides.js");

const points = [{ x_px: 10, y_px: 10 }, { x_px: 50, y_px: 10 }];
assert.strictEqual(guides.nearestHandleIndex(points, { x: 12, y: 11 }, 5), 0);
assert.strictEqual(guides.nearestHandleIndex(points, { x: 32, y: 10 }, 5), -1);
const moved = guides.replaceRawPoint(points, 1, { x: 61, y: 17 });
assert.deepStrictEqual(moved, [{ x_px: 10, y_px: 10 }, { x_px: 61, y_px: 17 }]);
assert.deepStrictEqual(points, [{ x_px: 10, y_px: 10 }, { x_px: 50, y_px: 10 }]);
assert.deepStrictEqual(guides.invalidatedGeometryState("target"), {
  fitState: "fitting", holeFitState: null, derivedResult: null, savedAnnotation: null,
});
assert.deepStrictEqual(guides.invalidatedGeometryState("hole"), {
  fitState: null, holeFitState: "fitting", derivedResult: null, savedAnnotation: null,
});
console.log("ellipse guide interaction tests: PASS");
