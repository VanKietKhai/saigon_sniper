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

  const api = { nearestHandleIndex, replaceRawPoint, invalidatedGeometryState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LabelerEllipseGuides = api;
}(typeof window !== "undefined" ? window : globalThis));
