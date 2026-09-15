"use strict";

/**
 * Canvas coordinates are CSS pixels. `scale` is CSS pixels per original image
 * pixel, and `panX`/`panY` locate the image origin in CSS canvas pixels.
 * Canvas backing-store pixels are deliberately not part of this contract.
 */
(function exposeCanvasTransforms(globalScope) {
  const EPSILON = 1e-9;

  function imageToDisplay(point, view) {
    return {
      x: view.panX + point.x * view.scale,
      y: view.panY + point.y * view.scale,
    };
  }

  function displayToImage(point, view) {
    if (!Number.isFinite(view.scale) || view.scale <= 0) {
      throw new Error("Canvas view scale must be a positive finite number.");
    }
    return {
      x: (point.x - view.panX) / view.scale,
      y: (point.y - view.panY) / view.scale,
    };
  }

  function pointIsInsideImage(point, imageSize) {
    return point.x >= 0 && point.y >= 0
      && point.x < imageSize.width && point.y < imageSize.height;
  }

  function fitView(viewport, imageSize, margin = 24) {
    const availableWidth = Math.max(1, viewport.width - 2 * margin);
    const availableHeight = Math.max(1, viewport.height - 2 * margin);
    const scale = Math.min(
      availableWidth / imageSize.width,
      availableHeight / imageSize.height,
    );
    return {
      scale,
      panX: (viewport.width - imageSize.width * scale) / 2,
      panY: (viewport.height - imageSize.height * scale) / 2,
    };
  }

  function zoomAroundDisplayPoint(view, displayPoint, nextScale) {
    if (!Number.isFinite(nextScale) || nextScale <= 0) {
      throw new Error("Zoom scale must be a positive finite number.");
    }
    const imagePoint = displayToImage(displayPoint, view);
    return {
      scale: nextScale,
      panX: displayPoint.x - imagePoint.x * nextScale,
      panY: displayPoint.y - imagePoint.y * nextScale,
    };
  }

  function panView(view, delta) {
    if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
      throw new Error("Canvas pan delta must be finite.");
    }
    return {
      scale: view.scale,
      panX: view.panX + delta.x,
      panY: view.panY + delta.y,
    };
  }

  function pointsNearlyEqual(first, second) {
    return Math.abs(first.x - second.x) < EPSILON
      && Math.abs(first.y - second.y) < EPSILON;
  }

  const api = {
    imageToDisplay,
    displayToImage,
    pointIsInsideImage,
    fitView,
    zoomAroundDisplayPoint,
    panView,
    pointsNearlyEqual,
  };
  globalScope.LabelerCanvasTransforms = api;
  if (typeof module !== "undefined") module.exports = api;
}(typeof window === "undefined" ? globalThis : window));
