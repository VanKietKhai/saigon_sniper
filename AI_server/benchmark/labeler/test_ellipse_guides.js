"use strict";

const assert = require("assert");
const guides = require("./static/ellipse_guides.js");

const points = [{ x_px: 10, y_px: 10 }, { x_px: 50, y_px: 10 }];
assert.strictEqual(guides.nearestHandleIndex(points, { x: 12, y: 11 }, 5), 0);
assert.strictEqual(guides.nearestHandleIndex(points, { x: 32, y: 10 }, 5), -1);
const moved = guides.replaceRawPoint(points, 1, { x: 61, y: 17 });
assert.deepStrictEqual(moved, [{ x_px: 10, y_px: 10 }, { x_px: 61, y_px: 17 }]);
assert.deepStrictEqual(points, [{ x_px: 10, y_px: 10 }, { x_px: 50, y_px: 10 }]);
const semantic = guides.replaceRawPoint([{ x_px: 10, y_px: 10, semantic_role: "12h" }], 0, { x: 12, y: 14 });
assert.deepStrictEqual(semantic, [{ x_px: 12, y_px: 14, semantic_role: "12h" }]);
const holeSemantic = guides.replaceRawPoint([{ x_px: 10, y_px: 10, semantic_role: "hole_12h" }], 0, { x: 12, y: 14 });
assert.deepStrictEqual(holeSemantic, [{ x_px: 12, y_px: 14, semantic_role: "hole_12h" }]);
const diagonalAnchors = [{ x_px: 0, y_px: -10 }, { x_px: 20, y_px: 0 }, { x_px: 0, y_px: 10 }, { x_px: -20, y_px: 0 }];
assert.deepStrictEqual(guides.diagonalGhosts(diagonalAnchors), [
  { x_px: 14.142135623730951, y_px: 7.0710678118654755 },
  { x_px: -14.142135623730951, y_px: 7.0710678118654755 },
  { x_px: -14.142135623730951, y_px: -7.0710678118654755 },
  { x_px: 14.142135623730951, y_px: -7.0710678118654755 },
]);
assert.deepStrictEqual(guides.invalidatedGeometryState("target"), {
  fitState: "fitting", holeFitState: null, derivedResult: null, savedAnnotation: null,
});
assert.deepStrictEqual(guides.invalidatedGeometryState("hole"), {
  fitState: null, holeFitState: "fitting", derivedResult: null, savedAnnotation: null,
});
const sourceSessions = guides.createSourceSessionGuard();
const firstSource = sourceSessions.begin("RIFLE_SRC_0001");
assert.strictEqual(sourceSessions.isCurrent(firstSource), true);
const secondSource = sourceSessions.begin("RIFLE_SRC_0002");
assert.strictEqual(sourceSessions.isCurrent(firstSource), false, "late source A work must be rejected");
assert.strictEqual(sourceSessions.isCurrent(secondSource), true);
console.log("ellipse guide interaction tests: PASS");
