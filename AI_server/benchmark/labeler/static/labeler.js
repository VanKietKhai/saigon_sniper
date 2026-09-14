"use strict";

document.documentElement.dataset.labelerStage = "verified-image-loading";

const transforms = window.LabelerCanvasTransforms;
const datasetConfigured = document.querySelector("#dataset-configured");
const manifestRecordCount = document.querySelector("#manifest-record-count");
const sourceIdStatus = document.querySelector("#source-id-status");
const identityStatus = document.querySelector("#identity-status");
const sourceIdInput = document.querySelector("#source-id-input");
const loadSourceButton = document.querySelector("#load-source");
const imageMessage = document.querySelector("#image-message");
const canvas = document.querySelector("#image-canvas");
const canvasStage = document.querySelector("#canvas-stage");
const context = canvas.getContext("2d");
const imageDetails = document.querySelector("#image-details");
const calibrationStatus = document.querySelector("#calibration-status");
const calibrationReference = document.querySelector("#calibration-reference");
const fitStatus = document.querySelector("#fit-status");
const fitDetails = document.querySelector("#fit-details");
const holeCenterStatus = document.querySelector("#hole-center-status");
const zoomStatus = document.querySelector("#zoom-status");
const cursorStatus = document.querySelector("#cursor-status");
const controls = {
  fit: document.querySelector("#fit-view"),
  oneToOne: document.querySelector("#one-to-one"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out"),
  pan: document.querySelector("#pan-mode"),
  calibration: document.querySelector("#calibration-mode"),
  undo: document.querySelector("#undo-point"),
  clear: document.querySelector("#clear-points"),
  fitEllipse: document.querySelector("#fit-ellipse"),
  accept: document.querySelector("#accept-calibration"),
  redo: document.querySelector("#redo-calibration"),
  holeCenter: document.querySelector("#hole-center-mode"),
  clearHoleCenter: document.querySelector("#clear-hole-center"),
};

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const FIT_MARGIN_CSS_PX = 24;
const state = {
  sourceId: null,
  image: null,
  metadata: null,
  verifiedAndDecoded: false,
  view: { scale: 1, panX: 0, panY: 0 },
  calibrationPoints: [],
  mode: "none",
  pointerImage: null,
  panStart: null,
  ellipseFit: null,
  fitState: "not_fitted",
  fitError: null,
  calibrationReference: null,
  holeCenter: null,
};

async function loadHealth() {
  const response = await fetch("/health");
  if (!response.ok) throw new Error("Health request failed");
  const health = await response.json();
  datasetConfigured.textContent = health.dataset_configured ? "Yes" : "No";
  manifestRecordCount.textContent = String(health.manifest_record_count);
}

async function loadCalibrationReference() {
  const response = await fetch("/api/calibration/reference");
  if (!response.ok) throw new Error("Frozen calibration reference unavailable");
  state.calibrationReference = await response.json();
  calibrationReference.textContent = `${state.calibrationReference.reference_diameter_mm} mm outer black / 4-ring boundary`;
}

function invalidateFit(nextState = "not_fitted") {
  state.ellipseFit = null;
  state.fitState = nextState;
  state.fitError = null;
  clearHoleCenter();
}

function clearHoleCenter() {
  state.holeCenter = null;
  if (state.mode === "hole_center") state.mode = "none";
}

function resetImage(message) {
  state.image = null;
  state.metadata = null;
  state.verifiedAndDecoded = false;
  state.pointerImage = null;
  state.mode = "none";
  invalidateFit();
  imageMessage.hidden = false;
  imageMessage.textContent = message;
  imageDetails.textContent = "Not loaded";
  cursorStatus.textContent = "Outside image";
  updateControls();
  render();
}

function canvasCssSize() {
  const rect = canvas.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function resizeCanvasBackingStore() {
  const size = canvasCssSize();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(size.width * ratio));
  canvas.height = Math.max(1, Math.round(size.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function render() {
  resizeCanvasBackingStore();
  const size = canvasCssSize();
  context.clearRect(0, 0, size.width, size.height);
  if (!state.image) return;

  const { scale, panX, panY } = state.view;
  context.imageSmoothingEnabled = true;
  context.drawImage(state.image, panX, panY,
    state.image.naturalWidth * scale, state.image.naturalHeight * scale);
  for (const [index, point] of state.calibrationPoints.entries()) {
    const display = transforms.imageToDisplay({ x: point.x_px, y: point.y_px }, state.view);
    context.save();
    context.strokeStyle = "#f0a928";
    context.fillStyle = "#14251a";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(display.x, display.y, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#f4f6f4";
    context.font = "12px Arial";
    context.fillText(String(index + 1), display.x + 8, display.y - 8);
    context.restore();
  }
  if (state.ellipseFit) {
    const ellipse = state.ellipseFit;
    const center = transforms.imageToDisplay({ x: ellipse.center_x_px, y: ellipse.center_y_px }, state.view);
    context.save();
    context.translate(center.x, center.y);
    context.rotate((ellipse.rotation_deg * Math.PI) / 180);
    context.strokeStyle = "#62d8ff";
    context.lineWidth = 2;
    context.setLineDash([7, 4]);
    context.beginPath();
    context.ellipse(0, 0, ellipse.radius_major_px * state.view.scale,
      ellipse.radius_minor_px * state.view.scale, 0, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    context.strokeStyle = "#ff5a7a";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-9, 0);
    context.lineTo(9, 0);
    context.moveTo(0, -9);
    context.lineTo(0, 9);
    context.stroke();
    context.restore();
  }
  if (state.holeCenter) {
    const display = transforms.imageToDisplay(
      { x: state.holeCenter.x_px, y: state.holeCenter.y_px }, state.view,
    );
    context.save();
    context.strokeStyle = "#74e86f";
    context.fillStyle = "rgba(20, 37, 26, 0.85)";
    context.lineWidth = 2;
    context.beginPath();
    context.rect(display.x - 6, display.y - 6, 12, 12);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(display.x - 10, display.y);
    context.lineTo(display.x + 10, display.y);
    context.moveTo(display.x, display.y - 10);
    context.lineTo(display.x, display.y + 10);
    context.stroke();
    context.restore();
  }
  if (state.pointerImage) {
    const display = transforms.imageToDisplay(state.pointerImage, state.view);
    context.save();
    context.strokeStyle = "#62d8ff";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(display.x - 10, display.y);
    context.lineTo(display.x + 10, display.y);
    context.moveTo(display.x, display.y - 10);
    context.lineTo(display.x, display.y + 10);
    context.stroke();
    context.restore();
  }
}

function updateControls() {
  const ready = state.verifiedAndDecoded;
  for (const control of Object.values(controls)) control.disabled = !ready;
  controls.undo.disabled = !ready || state.calibrationPoints.length === 0;
  controls.clear.disabled = !ready || state.calibrationPoints.length === 0;
  controls.fitEllipse.disabled = !ready || state.calibrationPoints.length < 5;
  controls.accept.disabled = !ready || state.fitState !== "fitted";
  controls.redo.disabled = !ready || state.calibrationPoints.length === 0;
  const holeCenterReady = ready && state.fitState === "accepted" && state.ellipseFit !== null;
  controls.holeCenter.disabled = !holeCenterReady;
  controls.clearHoleCenter.disabled = !holeCenterReady || state.holeCenter === null;
  controls.pan.setAttribute("aria-pressed", String(state.mode === "pan"));
  controls.calibration.setAttribute("aria-pressed", String(state.mode === "calibration"));
  controls.holeCenter.setAttribute("aria-pressed", String(state.mode === "hole_center"));
  calibrationStatus.textContent = ready
    ? `${state.calibrationPoints.length} / 8 points${state.calibrationPoints.length >= 5 ? " (ready to fit)" : ""}`
    : "Disabled until verified JPG decode";
  fitStatus.textContent = state.fitState.replaceAll("_", " ");
  fitDetails.textContent = state.ellipseFit
    ? `Center ${state.ellipseFit.center_x_px.toFixed(2)}, ${state.ellipseFit.center_y_px.toFixed(2)} px · Major ${state.ellipseFit.radius_major_px.toFixed(2)} px · Minor ${state.ellipseFit.radius_minor_px.toFixed(2)} px · Rotation ${state.ellipseFit.rotation_deg.toFixed(2)}° · RMS ${state.ellipseFit.calibration_fit_residual_px.toFixed(3)} px · Max ${state.ellipseFit.max_radial_residual_px.toFixed(3)} px · Axis ratio ${state.ellipseFit.axis_ratio.toFixed(4)} · ${state.ellipseFit.point_count} points`
    : state.fitError || "—";
  holeCenterStatus.textContent = !holeCenterReady
    ? "Unavailable until calibration accepted"
    : state.holeCenter
      ? `X ${state.holeCenter.x_px.toFixed(2)} px · Y ${state.holeCenter.y_px.toFixed(2)} px (human-confirmed, transient)`
      : "Not set";
  zoomStatus.textContent = ready ? `${Math.round(state.view.scale * 100)}%` : "—";
  canvas.style.cursor = state.mode === "pan" ? "grab" : (state.mode === "calibration" || state.mode === "hole_center") ? "crosshair" : "default";
}

function fitView() {
  if (!state.image) return;
  state.view = transforms.fitView(canvasCssSize(), {
    width: state.image.naturalWidth,
    height: state.image.naturalHeight,
  }, FIT_MARGIN_CSS_PX);
  render();
  updateControls();
}

function setOneToOne() {
  if (!state.image) return;
  const size = canvasCssSize();
  state.view = {
    scale: 1,
    panX: (size.width - state.image.naturalWidth) / 2,
    panY: (size.height - state.image.naturalHeight) / 2,
  };
  render();
  updateControls();
}

function zoomAt(displayPoint, multiplier) {
  if (!state.image) return;
  const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.view.scale * multiplier));
  state.view = transforms.zoomAroundDisplayPoint(state.view, displayPoint, nextScale);
  render();
  updateControls();
}

function displayPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function imagePointFromEvent(event) {
  const imagePoint = transforms.displayToImage(displayPointFromEvent(event), state.view);
  return transforms.pointIsInsideImage(imagePoint, {
    width: state.image.naturalWidth,
    height: state.image.naturalHeight,
  }) ? imagePoint : null;
}

function clearTransientPoints() {
  state.calibrationPoints = [];
  invalidateFit();
  updateControls();
  render();
}

function setHoleCenter(imagePoint) {
  if (!imagePoint || !Number.isFinite(imagePoint.x) || !Number.isFinite(imagePoint.y)
    || imagePoint.x < 0 || imagePoint.y < 0) return;
  if (state.holeCenter && !window.confirm("Replace the existing transient hole center?")) return;
  state.holeCenter = { x_px: imagePoint.x, y_px: imagePoint.y };
  updateControls();
  render();
}

async function fitEllipse() {
  if (!state.verifiedAndDecoded || state.calibrationPoints.length < 5) return;
  invalidateFit();
  state.fitState = "fitting";
  updateControls();
  try {
    const response = await fetch("/api/calibration/fit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: state.calibrationPoints }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.message || "ellipse_fit_failed");
    state.ellipseFit = payload.ellipse;
    state.fitState = "fitted";
  } catch (error) {
    invalidateFit("needs_redo");
    state.fitError = error.message;
  }
  updateControls();
  render();
}

function redoCalibration() {
  if (state.calibrationPoints.length === 0) return;
  if (window.confirm("Redo calibration and discard transient points and fitted ellipse?")) {
    clearTransientPoints();
    state.fitState = "needs_redo";
    updateControls();
  }
}

async function loadSource() {
  const sourceId = sourceIdInput.value.trim();
  if (!sourceId) {
    identityStatus.textContent = "Enter a source ID";
    return;
  }

  if ((state.calibrationPoints.length > 0 || state.ellipseFit || state.holeCenter) && sourceId !== state.sourceId
    && !window.confirm("Changing source discards transient calibration points. Continue?")) return;
  if (sourceId !== state.sourceId) clearTransientPoints();
  resetImage("Checking source identity...");
  try {
    const response = await fetch(`/api/sources/${encodeURIComponent(sourceId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.status || "source_not_found");

    sourceIdStatus.textContent = payload.source.source_id;
    identityStatus.textContent = payload.identity.status;
    if (payload.identity.status !== "verified") {
      resetImage(`Image unavailable: ${payload.identity.status}`);
      return;
    }

    const verifiedImage = new Image();
    verifiedImage.onload = () => {
      state.sourceId = payload.source.source_id;
      state.metadata = payload.source;
      state.image = verifiedImage;
      state.verifiedAndDecoded = true;
      imageDetails.textContent = `${payload.source.original_filename} · ${verifiedImage.naturalWidth} × ${verifiedImage.naturalHeight} px`;
      imageMessage.hidden = true;
      fitView();
    };
    verifiedImage.onerror = () => {
      identityStatus.textContent = "verified_image_load_failed";
      resetImage("Verified image could not be decoded");
    };
    verifiedImage.src = `/api/sources/${encodeURIComponent(sourceId)}/image`;
  } catch (error) {
    identityStatus.textContent = error.message;
    resetImage("Image unavailable");
  }
}

loadSourceButton.addEventListener("click", loadSource);
sourceIdInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadSource();
});
controls.fit.addEventListener("click", fitView);
controls.oneToOne.addEventListener("click", setOneToOne);
controls.zoomIn.addEventListener("click", () => {
  const size = canvasCssSize();
  zoomAt({ x: size.width / 2, y: size.height / 2 }, 1.25);
});
controls.zoomOut.addEventListener("click", () => {
  const size = canvasCssSize();
  zoomAt({ x: size.width / 2, y: size.height / 2 }, 0.8);
});
controls.pan.addEventListener("click", () => {
  state.mode = state.mode === "pan" ? "none" : "pan";
  updateControls();
});
controls.calibration.addEventListener("click", () => {
  state.mode = state.mode === "calibration" ? "none" : "calibration";
  updateControls();
});
controls.undo.addEventListener("click", () => {
  state.calibrationPoints.pop();
  invalidateFit();
  updateControls();
  render();
});
controls.clear.addEventListener("click", () => {
  if (state.calibrationPoints.length > 0 && window.confirm("Clear all transient calibration points?")) clearTransientPoints();
});
controls.fitEllipse.addEventListener("click", fitEllipse);
controls.accept.addEventListener("click", () => {
  if (state.ellipseFit) {
    state.fitState = "accepted";
    updateControls();
  }
});
controls.redo.addEventListener("click", redoCalibration);
controls.holeCenter.addEventListener("click", () => {
  state.mode = state.mode === "hole_center" ? "none" : "hole_center";
  updateControls();
});
controls.clearHoleCenter.addEventListener("click", () => {
  if (state.holeCenter && window.confirm("Clear the transient hole center?")) {
    clearHoleCenter();
    updateControls();
    render();
  }
});
canvas.addEventListener("wheel", (event) => {
  if (!state.verifiedAndDecoded) return;
  event.preventDefault();
  zoomAt(displayPointFromEvent(event), event.deltaY < 0 ? 1.15 : 1 / 1.15);
}, { passive: false });
canvas.addEventListener("pointermove", (event) => {
  if (!state.verifiedAndDecoded) return;
  if (state.panStart) {
    const point = displayPointFromEvent(event);
    state.view.panX = state.panStart.panX + point.x - state.panStart.pointer.x;
    state.view.panY = state.panStart.panY + point.y - state.panStart.pointer.y;
  }
  state.pointerImage = imagePointFromEvent(event);
  cursorStatus.textContent = state.pointerImage
    ? `X ${state.pointerImage.x.toFixed(2)} px · Y ${state.pointerImage.y.toFixed(2)} px`
    : "Outside image";
  render();
});
canvas.addEventListener("pointerleave", () => {
  state.pointerImage = null;
  cursorStatus.textContent = "Outside image";
  render();
});
canvas.addEventListener("pointerdown", (event) => {
  if (!state.verifiedAndDecoded || event.button !== 0) return;
  if (state.mode === "pan") {
    state.panStart = { pointer: displayPointFromEvent(event), panX: state.view.panX, panY: state.view.panY };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    return;
  }
  if (state.mode === "calibration") {
    const imagePoint = imagePointFromEvent(event);
    if (!imagePoint) {
      calibrationStatus.textContent = "Outside image: point not added";
      return;
    }
    if (state.calibrationPoints.length >= 8) {
      calibrationStatus.textContent = "Maximum 8 calibration points reached";
      return;
    }
    state.calibrationPoints.push({ x_px: imagePoint.x, y_px: imagePoint.y });
    invalidateFit();
    updateControls();
    render();
  }
  if (state.mode === "hole_center") {
    const imagePoint = imagePointFromEvent(event);
    if (!imagePoint) {
      holeCenterStatus.textContent = "Outside image: hole center not set";
      return;
    }
    setHoleCenter(imagePoint);
  }
});
canvas.addEventListener("pointerup", (event) => {
  if (!state.panStart) return;
  state.panStart = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  updateControls();
});
new ResizeObserver(() => render()).observe(canvasStage);
render();
loadHealth().catch(() => {
  datasetConfigured.textContent = "Unavailable";
  manifestRecordCount.textContent = "Unavailable";
});
loadCalibrationReference().catch(() => {
  calibrationReference.textContent = "Frozen reference unavailable";
});
