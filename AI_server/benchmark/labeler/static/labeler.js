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
const derivationStatus = document.querySelector("#derivation-status");
const derivationDetails = document.querySelector("#derivation-details");
const zoomStatus = document.querySelector("#zoom-status");
const pixelModeStatus = document.querySelector("#pixel-mode-status");
const cursorStatus = document.querySelector("#cursor-status");
const labelerId = document.querySelector("#labeler-id");
const annotationPass = document.querySelector("#annotation-pass");
const perspectiveStatus = document.querySelector("#perspective-status");
const labelQuality = document.querySelector("#label-quality");
const annotationNotes = document.querySelector("#annotation-notes");
const saveStatus = document.querySelector("#save-status");
const controls = {
  fit: document.querySelector("#fit-view"),
  oneToOne: document.querySelector("#one-to-one"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out"),
  pan: document.querySelector("#pan-mode"),
  loupe: document.querySelector("#loupe-toggle"),
  calibration: document.querySelector("#calibration-mode"),
  undo: document.querySelector("#undo-point"),
  clear: document.querySelector("#clear-points"),
  fitEllipse: document.querySelector("#fit-ellipse"),
  accept: document.querySelector("#accept-calibration"),
  redo: document.querySelector("#redo-calibration"),
  holeCenter: document.querySelector("#hole-center-mode"),
  clearHoleCenter: document.querySelector("#clear-hole-center"),
  derive: document.querySelector("#derive-score"),
  save: document.querySelector("#save-annotation"),
};

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const FIT_MARGIN_CSS_PX = 24;
const PAN_DISTANCE_CSS_PX = 60;
const PAN_FINE_DISTANCE_CSS_PX = 15;
const PAN_FAST_DISTANCE_CSS_PX = 240;
const LOUPE_SIZE_CSS_PX = 144;
const LOUPE_SOURCE_PIXELS = 12;
const statusText = {
  verified: "Đã xác minh",
  unsupported_format: "Định dạng ảnh chưa được hỗ trợ",
  dataset_not_configured: "Chưa cấu hình thư mục dữ liệu",
  file_missing: "Không tìm thấy tệp ảnh",
  hash_mismatch: "Ảnh không khớp mã xác minh SHA-256",
  unsafe_path: "Đường dẫn ảnh không hợp lệ",
  source_not_found: "Không tìm thấy mã ảnh",
  verified_image_load_failed: "Không thể giải mã ảnh đã xác minh",
  stale_source_result_rejected: "Kết quả không còn thuộc ảnh hiện tại",
  provisional_derivation_failed: "Không thể tính điểm tạm tính",
  ellipse_fit_failed: "Không thể khớp elip từ các điểm đã chọn",
  invalid_calibration_points: "Các điểm hiệu chuẩn không hợp lệ",
  invalid_human_geometry: "Không thể tính điểm từ hình học đã chọn",
};
const fitStateText = {
  not_fitted: "Chưa khớp",
  fitting: "Đang khớp…",
  fitted: "Đã khớp",
  accepted: "Đã xác nhận",
  needs_redo: "Cần làm lại",
};

function displayStatus(value, fallback = "Lỗi không xác định") {
  return statusText[value] || fallback;
}

function displayFitState(value) {
  return fitStateText[value] || "Không rõ";
}
const state = {
  sourceId: null,
  image: null,
  metadata: null,
  verifiedAndDecoded: false,
  view: { scale: 1, panX: 0, panY: 0 },
  fitActive: false,
  calibrationPoints: [],
  mode: "none",
  pointerImage: null,
  panStart: null,
  spacePanActive: false,
  loupeEnabled: false,
  ellipseFit: null,
  fitState: "not_fitted",
  fitError: null,
  calibrationReference: null,
  holeCenter: null,
  derivedResult: null,
  derivationError: null,
  savedAnnotation: null,
};

async function loadHealth() {
  const response = await fetch("/health");
  if (!response.ok) throw new Error("health_request_failed");
  const health = await response.json();
  datasetConfigured.textContent = health.dataset_configured ? "Đã cấu hình" : "Chưa cấu hình";
  manifestRecordCount.textContent = String(health.manifest_record_count);
}

async function loadCalibrationReference() {
  const response = await fetch("/api/calibration/reference");
  if (!response.ok) throw new Error("calibration_reference_unavailable");
  state.calibrationReference = await response.json();
  calibrationReference.textContent = `${String(state.calibrationReference.reference_diameter_mm).replace(".", ",")} mm mép ngoài vùng đen / vòng 4`;
}

function invalidateFit(nextState = "not_fitted") {
  state.ellipseFit = null;
  state.fitState = nextState;
  state.fitError = null;
  clearHoleCenter();
}

function invalidateDerived() {
  state.derivedResult = null;
  state.derivationError = null;
}

function clearHoleCenter() {
  state.holeCenter = null;
  if (state.mode === "hole_center") state.mode = "none";
  invalidateDerived();
}

function resetImage(message) {
  state.image = null;
  state.metadata = null;
  state.verifiedAndDecoded = false;
  state.pointerImage = null;
  state.mode = "none";
  state.fitActive = false;
  state.panStart = null;
  state.savedAnnotation = null;
  saveStatus.textContent = "Chưa lưu lượt chấm";
  invalidateFit();
  imageMessage.hidden = false;
  imageMessage.textContent = message;
  imageDetails.textContent = "Chưa mở";
  cursorStatus.textContent = "Ngoài vùng ảnh";
  updateControls();
  render();
}

function pixelModeIsActive() {
  return state.view.scale >= 1;
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
  context.imageSmoothingEnabled = !pixelModeIsActive();
  if ("imageSmoothingQuality" in context) {
    context.imageSmoothingQuality = pixelModeIsActive() ? "low" : "high";
  }
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
  drawPrecisionLoupe(size);
}

function drawPrecisionLoupe(viewportSize) {
  if (!state.loupeEnabled || !pixelModeIsActive() || !state.pointerImage
    || (state.mode !== "calibration" && state.mode !== "hole_center")) return;

  const sourceWidth = Math.min(LOUPE_SOURCE_PIXELS, state.image.naturalWidth);
  const sourceHeight = Math.min(LOUPE_SOURCE_PIXELS, state.image.naturalHeight);
  const pointerX = Math.round(state.pointerImage.x);
  const pointerY = Math.round(state.pointerImage.y);
  const sourceX = Math.max(0, Math.min(state.image.naturalWidth - sourceWidth,
    pointerX - Math.floor(sourceWidth / 2)));
  const sourceY = Math.max(0, Math.min(state.image.naturalHeight - sourceHeight,
    pointerY - Math.floor(sourceHeight / 2)));
  const pointerDisplay = transforms.imageToDisplay(state.pointerImage, state.view);
  const left = Math.max(8, Math.min(viewportSize.width - LOUPE_SIZE_CSS_PX - 8,
    pointerDisplay.x + 18));
  const top = Math.max(8, Math.min(viewportSize.height - LOUPE_SIZE_CSS_PX - 8,
    pointerDisplay.y + 18));
  const crossX = left + ((state.pointerImage.x - sourceX) / sourceWidth) * LOUPE_SIZE_CSS_PX;
  const crossY = top + ((state.pointerImage.y - sourceY) / sourceHeight) * LOUPE_SIZE_CSS_PX;

  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(state.image, sourceX, sourceY, sourceWidth, sourceHeight,
    left, top, LOUPE_SIZE_CSS_PX, LOUPE_SIZE_CSS_PX);
  context.strokeStyle = "#f4f6f4";
  context.lineWidth = 2;
  context.strokeRect(left, top, LOUPE_SIZE_CSS_PX, LOUPE_SIZE_CSS_PX);
  context.strokeStyle = "#ff5a7a";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(crossX - 12, crossY);
  context.lineTo(crossX + 12, crossY);
  context.moveTo(crossX, crossY - 12);
  context.lineTo(crossX, crossY + 12);
  context.stroke();
  context.restore();
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
  controls.derive.disabled = !holeCenterReady || state.holeCenter === null || !state.sourceId;
  controls.save.disabled = !state.derivedResult || !labelerId.value.trim() || state.savedAnnotation !== null;
  controls.loupe.disabled = !ready || !pixelModeIsActive();
  controls.pan.setAttribute("aria-pressed", String(state.mode === "pan"));
  controls.calibration.setAttribute("aria-pressed", String(state.mode === "calibration"));
  controls.holeCenter.setAttribute("aria-pressed", String(state.mode === "hole_center"));
  controls.loupe.setAttribute("aria-pressed", String(state.loupeEnabled && pixelModeIsActive()));
  calibrationStatus.textContent = ready
    ? `${state.calibrationPoints.length} / 8 điểm${state.calibrationPoints.length >= 5 ? " (có thể khớp elip)" : " (cần ít nhất 5 điểm)"}`
    : "Chưa kích hoạt: cần ảnh JPG đã xác minh";
  fitStatus.textContent = displayFitState(state.fitState);
  fitDetails.textContent = state.ellipseFit
    ? `Tâm bia ${state.ellipseFit.center_x_px.toFixed(2)}, ${state.ellipseFit.center_y_px.toFixed(2)} px · Bán kính trục lớn ${state.ellipseFit.radius_major_px.toFixed(2)} px · Bán kính trục nhỏ ${state.ellipseFit.radius_minor_px.toFixed(2)} px · Góc xoay ${state.ellipseFit.rotation_deg.toFixed(2)}° · Sai số RMS ${state.ellipseFit.calibration_fit_residual_px.toFixed(3)} px · Sai số lớn nhất ${state.ellipseFit.max_radial_residual_px.toFixed(3)} px · Tỷ lệ trục ${state.ellipseFit.axis_ratio.toFixed(4)} · ${state.ellipseFit.point_count} điểm`
    : state.fitError ? "Không thể khớp elip từ các điểm đã chọn" : "—";
  holeCenterStatus.textContent = !holeCenterReady
    ? "Vui lòng xác nhận hiệu chuẩn trước khi chọn tâm lỗ đạn."
    : state.holeCenter
      ? `X ${state.holeCenter.x_px.toFixed(2)} px · Y ${state.holeCenter.y_px.toFixed(2)} px (đã chọn thủ công, tạm thời)`
      : "Chưa chọn";
  derivationStatus.textContent = state.derivedResult
    ? "TẠM TÍNH — CHƯA LƯU DỮ LIỆU GROUND TRUTH"
    : state.derivationError ? "Không thể tính điểm tạm tính" : "Chưa tính";
  derivationDetails.textContent = state.derivedResult
    ? `Bộ quy tắc ${state.derivedResult.rule_set_id} · Tâm bia ${state.derivedResult.target_center_x_px.toFixed(2)}, ${state.derivedResult.target_center_y_px.toFixed(2)} px · Tâm lỗ đạn ${state.derivedResult.hole_center_x_px.toFixed(2)}, ${state.derivedResult.hole_center_y_px.toFixed(2)} px · Tỷ lệ trục lớn ${state.derivedResult.mm_per_px_major.toFixed(6)} mm/px · Tỷ lệ trục nhỏ ${state.derivedResult.mm_per_px_minor.toFixed(6)} mm/px · Khoảng cách tâm bia – tâm lỗ đạn ${state.derivedResult.center_distance_mm.toFixed(4)} mm · ${state.derivedResult.is_miss ? "0,0 / Ngoài vùng tính điểm" : `Điểm Ground Truth tạm tính ${state.derivedResult.provisional_score.toFixed(1)}`}`
    : "—";
  zoomStatus.textContent = ready ? `${Math.round(state.view.scale * 100)}%` : "—";
  pixelModeStatus.textContent = !ready ? "—" : pixelModeIsActive()
    ? "Bật tự động — hiển thị pixel gốc" : "Tắt — sẽ tự bật từ 100%";
  canvas.style.cursor = state.panStart ? "grabbing" : (state.mode === "pan" || state.spacePanActive)
    ? "grab" : (state.mode === "calibration" || state.mode === "hole_center") ? "crosshair" : "default";
}

async function saveAnnotation() {
  if (!state.derivedResult || !labelerId.value.trim() || state.savedAnnotation) return;
  const score = state.derivedResult.provisional_score.toFixed(1);
  if (!window.confirm(`Lưu lượt chấm ${annotationPass.value} cho ${state.sourceId}, người chấm ${labelerId.value.trim()}, điểm tạm tính ${score}?`)) return;
  saveStatus.textContent = "Đang lưu lượt chấm…";
  const response = await fetch("/api/annotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_id: state.sourceId, annotation_pass: annotationPass.value, labeler_id: labelerId.value.trim(), calibration_points: state.calibrationPoints, hole_center: state.holeCenter, perspective_status: perspectiveStatus.value, label_quality: labelQuality.value, notes: annotationNotes.value }) });
  const payload = await response.json();
  if (!response.ok) { saveStatus.textContent = payload.detail?.status === "duplicate_annotation_pass" ? "Lượt chấm này đã tồn tại." : "Không thể lưu lượt chấm."; return; }
  state.savedAnnotation = payload.annotation_id;
  saveStatus.textContent = `Đã lưu lượt chấm. Mã annotation: ${payload.annotation_id}`;
  updateControls();
}

function fitView() {
  if (!state.image) return;
  state.view = transforms.fitView(canvasCssSize(), {
    width: state.image.naturalWidth,
    height: state.image.naturalHeight,
  }, FIT_MARGIN_CSS_PX);
  state.fitActive = true;
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
  state.fitActive = false;
  render();
  updateControls();
}

function zoomAt(displayPoint, multiplier) {
  if (!state.image) return;
  const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.view.scale * multiplier));
  state.view = transforms.zoomAroundDisplayPoint(state.view, displayPoint, nextScale);
  state.fitActive = false;
  render();
  updateControls();
}

function panViewBy(delta) {
  if (!state.image) return;
  state.view = transforms.panView(state.view, delta);
  state.fitActive = false;
  render();
  updateControls();
}

function focusedElementAcceptsText() {
  const active = document.activeElement;
  return active instanceof HTMLElement && (
    active.matches("input, textarea, select") || active.isContentEditable
  );
}

function keyboardPanDelta(event) {
  const distance = event.altKey ? PAN_FINE_DISTANCE_CSS_PX
    : event.shiftKey ? PAN_FAST_DISTANCE_CSS_PX : PAN_DISTANCE_CSS_PX;
  switch (event.key.toLowerCase()) {
    case "w":
    case "arrowup": return { x: 0, y: distance };
    case "s":
    case "arrowdown": return { x: 0, y: -distance };
    case "a":
    case "arrowleft": return { x: distance, y: 0 };
    case "d":
    case "arrowright": return { x: -distance, y: 0 };
    default: return null;
  }
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
  if (state.holeCenter && !window.confirm("Bạn có muốn chọn lại tâm lỗ đạn hiện tại không?")) return;
  state.holeCenter = { x_px: imagePoint.x, y_px: imagePoint.y };
  invalidateDerived();
  updateControls();
  render();
}

async function deriveScore() {
  if (!state.sourceId || !state.holeCenter || !state.ellipseFit || state.fitState !== "accepted") return;
  invalidateDerived();
  derivationStatus.textContent = "Đang tính điểm tạm tính…";
  try {
    const response = await fetch("/api/derive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_id: state.sourceId,
        calibration_points: state.calibrationPoints,
        hole_center: state.holeCenter,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.status || "provisional_derivation_failed");
    if (payload.result.source_id !== state.sourceId) throw new Error("stale_source_result_rejected");
    state.derivedResult = payload.result;
  } catch (error) {
    state.derivationError = displayStatus(error.message);
  }
  updateControls();
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
    if (!response.ok) throw new Error(payload.detail?.status || "ellipse_fit_failed");
    state.ellipseFit = payload.ellipse;
    state.fitState = "fitted";
  } catch (error) {
    invalidateFit("needs_redo");
    state.fitError = displayStatus(error.message);
  }
  updateControls();
  render();
}

function redoCalibration() {
  if (state.calibrationPoints.length === 0) return;
  if (window.confirm("Bạn có muốn thực hiện lại phần hiệu chuẩn không? Các điểm tạm thời và elip đã khớp sẽ bị hủy.")) {
    clearTransientPoints();
    state.fitState = "needs_redo";
    updateControls();
  }
}

async function loadSource() {
  const sourceId = sourceIdInput.value.trim();
  if (!sourceId) {
    identityStatus.textContent = "Nhập mã ảnh";
    return;
  }

  if ((state.calibrationPoints.length > 0 || state.ellipseFit || state.holeCenter) && sourceId !== state.sourceId
    && !window.confirm("Bạn có muốn chuyển sang ảnh khác? Các thao tác chưa lưu trên ảnh hiện tại sẽ bị hủy.")) return;
  if (sourceId !== state.sourceId) clearTransientPoints();
  resetImage("Đang kiểm tra trạng thái xác minh ảnh…");
  try {
    const response = await fetch(`/api/sources/${encodeURIComponent(sourceId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.status || "source_not_found");

    sourceIdStatus.textContent = payload.source.source_id;
    identityStatus.textContent = displayStatus(payload.identity.status);
    if (payload.identity.status !== "verified") {
      resetImage(`Không thể mở ảnh: ${displayStatus(payload.identity.status)}`);
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
      identityStatus.textContent = displayStatus("verified_image_load_failed");
      resetImage("Không thể giải mã ảnh đã xác minh");
    };
    verifiedImage.src = `/api/sources/${encodeURIComponent(sourceId)}/image`;
  } catch (error) {
    identityStatus.textContent = displayStatus(error.message);
    resetImage("Không thể mở ảnh");
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
controls.loupe.addEventListener("click", () => {
  state.loupeEnabled = !state.loupeEnabled;
  updateControls();
  render();
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
  if (state.calibrationPoints.length > 0 && window.confirm("Bạn có muốn bỏ các điểm hiệu chuẩn hiện tại không?")) clearTransientPoints();
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
  if (state.holeCenter && window.confirm("Bạn có muốn xóa tâm lỗ đạn đã chọn không?")) {
    clearHoleCenter();
    updateControls();
    render();
  }
});
controls.derive.addEventListener("click", deriveScore);
controls.save.addEventListener("click", () => { saveAnnotation().catch(() => { saveStatus.textContent = "Không thể lưu lượt chấm."; }); });
labelerId.addEventListener("input", updateControls);
window.addEventListener("keydown", (event) => {
  if (!state.verifiedAndDecoded || focusedElementAcceptsText()) return;
  if (event.code === "Space") {
    state.spacePanActive = true;
    event.preventDefault();
    updateControls();
    return;
  }
  const delta = keyboardPanDelta(event);
  if (!delta) return;
  event.preventDefault();
  panViewBy(delta);
});
window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  state.spacePanActive = false;
  updateControls();
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
    state.view = transforms.panView({
      scale: state.view.scale,
      panX: state.panStart.panX,
      panY: state.panStart.panY,
    }, {
      x: point.x - state.panStart.pointer.x,
      y: point.y - state.panStart.pointer.y,
    });
    state.fitActive = false;
  }
  state.pointerImage = imagePointFromEvent(event);
  cursorStatus.textContent = state.pointerImage
    ? `X ${state.pointerImage.x.toFixed(2)} px · Y ${state.pointerImage.y.toFixed(2)} px`
    : "Ngoài vùng ảnh";
  render();
});
canvas.addEventListener("pointerleave", () => {
  state.pointerImage = null;
  cursorStatus.textContent = "Ngoài vùng ảnh";
  render();
});
canvas.addEventListener("pointerdown", (event) => {
  if (!state.verifiedAndDecoded || event.button !== 0) return;
  if (state.mode === "pan" || state.spacePanActive) {
    event.preventDefault();
    state.panStart = { pointer: displayPointFromEvent(event), panX: state.view.panX, panY: state.view.panY };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    return;
  }
  if (state.mode === "calibration") {
    const imagePoint = imagePointFromEvent(event);
    if (!imagePoint) {
      calibrationStatus.textContent = "Con trỏ nằm ngoài vùng ảnh: không thêm điểm";
      return;
    }
    if (state.calibrationPoints.length >= 8) {
      calibrationStatus.textContent = "Chỉ được chọn tối đa 8 điểm hiệu chuẩn";
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
      holeCenterStatus.textContent = "Con trỏ nằm ngoài vùng ảnh: chưa chọn tâm lỗ đạn";
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
canvas.addEventListener("pointercancel", (event) => {
  if (!state.panStart) return;
  state.panStart = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  updateControls();
});
new ResizeObserver(() => {
  if (state.fitActive && state.image) fitView();
  else render();
}).observe(canvasStage);
render();
loadHealth().catch(() => {
  datasetConfigured.textContent = "Không khả dụng";
  manifestRecordCount.textContent = "Không khả dụng";
});
loadCalibrationReference().catch(() => {
  calibrationReference.textContent = "Không tải được quy tắc cố định";
});
