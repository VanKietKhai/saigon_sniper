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
};

async function loadHealth() {
  const response = await fetch("/health");
  if (!response.ok) throw new Error("Health request failed");
  const health = await response.json();
  datasetConfigured.textContent = health.dataset_configured ? "Yes" : "No";
  manifestRecordCount.textContent = String(health.manifest_record_count);
}

function resetImage(message) {
  state.image = null;
  state.metadata = null;
  state.verifiedAndDecoded = false;
  state.pointerImage = null;
  state.mode = "none";
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
  controls.pan.setAttribute("aria-pressed", String(state.mode === "pan"));
  controls.calibration.setAttribute("aria-pressed", String(state.mode === "calibration"));
  calibrationStatus.textContent = ready
    ? `${state.calibrationPoints.length} / 8 points${state.calibrationPoints.length >= 5 ? " (minimum reached; fit not implemented)" : ""}`
    : "Disabled until verified JPG decode";
  zoomStatus.textContent = ready ? `${Math.round(state.view.scale * 100)}%` : "—";
  canvas.style.cursor = state.mode === "pan" ? "grab" : state.mode === "calibration" ? "crosshair" : "default";
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
  updateControls();
  render();
}

async function loadSource() {
  const sourceId = sourceIdInput.value.trim();
  if (!sourceId) {
    identityStatus.textContent = "Enter a source ID";
    return;
  }

  if (state.calibrationPoints.length > 0 && sourceId !== state.sourceId
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
  updateControls();
  render();
});
controls.clear.addEventListener("click", () => {
  if (state.calibrationPoints.length > 0 && window.confirm("Clear all transient calibration points?")) clearTransientPoints();
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
    updateControls();
    render();
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
