"use strict";

// Small, dependency-free helpers for the assisted eight-point workflow.
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
      ? { ...point, x_px: imagePoint.x, y_px: imagePoint.y }
      : { ...point });
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

  function diagonalGhosts(anchors) {
    if (!Array.isArray(anchors) || anchors.length !== 4) throw new Error("need_four_anchors");
    const [north, east, south, west] = anchors;
    const center = { x_px: (north.x_px + east.x_px + south.x_px + west.x_px) / 4, y_px: (north.y_px + east.y_px + south.y_px + west.y_px) / 4 };
    const u = {x: (east.x_px - west.x_px) / 2, y: (east.y_px - west.y_px) / 2}, v = {x: (south.x_px - north.x_px) / 2, y: (south.y_px - north.y_px) / 2};
    const k = Math.SQRT1_2;
    return [[u.x+v.x,u.y+v.y],[-u.x+v.x,-u.y+v.y],[-u.x-v.x,-u.y-v.y],[u.x-v.x,u.y-v.y]].map(([x,y]) => ({x_px:center.x_px+x*k,y_px:center.y_px+y*k}));
  }

  function localEdgeCandidate(imageData, width, height, predicted, radiusPx) {
    if (!imageData || !Number.isFinite(radiusPx) || radiusPx <= 0) return null;
    const centerX = Math.round(predicted.x_px), centerY = Math.round(predicted.y_px);
    let best = null;
    for (let y = Math.max(1, centerY - radiusPx); y <= Math.min(height - 2, centerY + radiusPx); y += 1) {
      for (let x = Math.max(1, centerX - radiusPx); x <= Math.min(width - 2, centerX + radiusPx); x += 1) {
        const distance = Math.hypot(x - predicted.x_px, y - predicted.y_px);
        if (distance > radiusPx) continue;
        const luminance = (px, py) => {
          const offset = (py * width + px) * 4;
          return imageData[offset] * 0.2126 + imageData[offset + 1] * 0.7152 + imageData[offset + 2] * 0.0722;
        };
        const gx = luminance(x + 1, y) - luminance(x - 1, y);
        const gy = luminance(x, y + 1) - luminance(x, y - 1);
        const strength = Math.hypot(gx, gy);
        if (!best || strength > best.strength) best = { x_px: x, y_px: y, strength, distance_px: distance };
      }
    }
    return best;
  }

  function pointResiduals(points, ellipse) {
    if (!ellipse || !Array.isArray(points)) return [];
    const angle = ellipse.rotation_deg * Math.PI / 180;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    return points.map((point) => {
      const dx = point.x_px - ellipse.center_x_px, dy = point.y_px - ellipse.center_y_px;
      const x = cosine * dx + sine * dy, y = -sine * dx + cosine * dy;
      const normalized = Math.sqrt((x / ellipse.radius_major_px) ** 2 + (y / ellipse.radius_minor_px) ** 2);
      return Math.abs(normalized - 1) * Math.min(ellipse.radius_major_px, ellipse.radius_minor_px);
    });
  }

  // Each image-open operation owns a monotonically increasing token.  Async
  // callbacks must check this token before touching UI state, so a late result
  // for a previously opened source can never leak into the current source.
  function createSourceSessionGuard() {
    let generation = 0;
    return {
      begin(sourceId) {
        generation += 1;
        return Object.freeze({ generation, sourceId });
      },
      isCurrent(token) {
        return Boolean(token) && token.generation === generation;
      },
    };
  }

  const api = { nearestHandleIndex, replaceRawPoint, invalidatedGeometryState, diagonalGhosts, localEdgeCandidate, pointResiduals, createSourceSessionGuard };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LabelerEllipseGuides = api;
}(typeof window !== "undefined" ? window : globalThis));
