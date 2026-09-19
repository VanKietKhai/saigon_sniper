"use strict";

// Small, dependency-free helpers shared by the canvas UI and Node tests.
// Guide endpoints always come from raw human points; no guide may be stretched
// independently from those points.
(function exposeEllipseGuides(root) {
  function nearestHandleIndex(points, imagePoint, hitRadiusPx) {
    if (!imagePoint || !Number.isFinite(hitRadiusPx) || hitRadiusPx <= 0) return -1;
    let nearestIndex = -1;
    let nearestDistanceSquared = hitRadiusPx * hitRadiusPx;
    points.forEach((point, index) => {
      const distanceSquared = (point.x_px - imagePoint.x) ** 2 + (point.y_px - imagePoint.y) ** 2;
      if (distanceSquared <= nearestDistanceSquared) {
        nearestIndex = index;
        nearestDistanceSquared = distanceSquared;
      }
    });
    return nearestIndex;
  }

  function replaceRawPoint(points, pointIndex, imagePoint) {
    if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= points.length) {
      throw new Error("invalid_point_index");
    }
    if (!imagePoint || !Number.isFinite(imagePoint.x) || !Number.isFinite(imagePoint.y)) {
      throw new Error("invalid_image_point");
    }
    return points.map((point, index) => index === pointIndex
      ? { x_px: imagePoint.x, y_px: imagePoint.y }
      : { x_px: point.x_px, y_px: point.y_px });
  }

  function invalidatedGeometryState(kind) {
    if (kind === "target") {
      return { fitState: "fitting", holeFitState: null, derivedResult: null, savedAnnotation: null };
    }
    if (kind === "hole") {
      return { fitState: null, holeFitState: "fitting", derivedResult: null, savedAnnotation: null };
    }
    throw new Error("invalid_geometry_kind");
  }

  function localOppositePairs(points) {
    if (!Array.isArray(points) || points.length !== 8) throw new Error("need_eight_points");
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x_px / 8, y: sum.y + point.y_px / 8 }), { x: 0, y: 0 });
    const ordered = points.map((point, index) => ({ index, angle: Math.atan2(point.y_px - center.y, point.x_px - center.x) }))
      .sort((a, b) => a.angle - b.angle || a.index - b.index);
    return [0, 1, 2, 3].map((index) => ({ first_point_index: ordered[index].index, second_point_index: ordered[index + 4].index }));
  }

  function guideCenter(points) {
    const pairs = localOppositePairs(points); let a00 = 0, a01 = 0, a11 = 0, b0 = 0, b1 = 0;
    const lines = pairs.map((pair) => {
      const first = points[pair.first_point_index], second = points[pair.second_point_index];
      const dx = second.x_px - first.x_px, dy = second.y_px - first.y_px, length = Math.hypot(dx, dy);
      if (length <= 1e-9) throw new Error("zero_length_guide");
      const nx = -dy / length, ny = dx / length, constant = nx * first.x_px + ny * first.y_px;
      a00 += nx * nx; a01 += nx * ny; a11 += ny * ny; b0 += nx * constant; b1 += ny * constant;
      return { nx, ny, constant, first, second };
    });
    const determinant = a00 * a11 - a01 * a01;
    if (Math.abs(determinant) <= 1e-12) throw new Error("parallel_guides");
    const x_px = (a11 * b0 - a01 * b1) / determinant, y_px = (a00 * b1 - a01 * b0) / determinant;
    const residuals = lines.map((line) => Math.abs(line.nx * x_px + line.ny * y_px - line.constant));
    return { pairs, lines, x_px, y_px, rms_residual_px: Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / 4), max_residual_px: Math.max(...residuals) };
  }

  function nearestGuideLine(guide, point, radius) {
    let result = -1, best = radius;
    guide.lines.forEach((line, index) => {
      const dx = line.second.x_px - line.first.x_px, dy = line.second.y_px - line.first.y_px;
      const length2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((point.x - line.first.x_px) * dx + (point.y - line.first.y_px) * dy) / length2));
      const distance = Math.hypot(point.x - (line.first.x_px + t * dx), point.y - (line.first.y_px + t * dy));
      if (distance <= best) { result = index; best = distance; }
    }); return result;
  }
  function translatePair(points, pair, delta) { return points.map((point, index) => index === pair.first_point_index || index === pair.second_point_index ? {x_px: point.x_px + delta.x, y_px: point.y_px + delta.y} : point); }

  const api = { nearestHandleIndex, replaceRawPoint, invalidatedGeometryState, localOppositePairs, guideCenter, nearestGuideLine, translatePair };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LabelerEllipseGuides = api;
}(typeof window !== "undefined" ? window : globalThis));
