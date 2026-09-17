"use strict";

document.documentElement.dataset.labelerStage = "verified-image-loading";

const transforms = window.LabelerCanvasTransforms;
const guides = window.LabelerEllipseGuides;
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
const calibrationQuality = document.querySelector("#calibration-quality");
const printedCenterStatus = document.querySelector("#printed-center-status");
const holeCenterStatus = document.querySelector("#hole-center-status");
const holeStabilityStatus = document.querySelector("#hole-stability-status");
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
const provisionalScoreCard = document.querySelector("#provisional-score-card");
const provisionalScoreValue = document.querySelector("#provisional-score-value");
const provisionalScoreSummary = document.querySelector("#provisional-score-summary");
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
  printedCenter: document.querySelector("#printed-center-mode"),
  holeBoundary: document.querySelector("#hole-boundary-mode"),
  undoHole: document.querySelector("#undo-hole-point"),
  clearHole: document.querySelector("#clear-hole-points"),
  fitHole: document.querySelector("#fit-hole-ellipse"),
  acceptHole: document.querySelector("#accept-hole-ellipse"),
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
  invalid_hole_boundary_points: "Tám điểm mép lỗ đạn không hợp lệ",
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
  calibrationStability: null,
  printedCenterReference: null,
  calibrationReference: null,
  holeBoundaryPoints: [],
  holeEllipseFit: null,
  holeStability: null,
  holeFitState: "not_fitted",
  holeCenter: null,
  derivedResult: null,
  derivationError: null,
  savedAnnotation: null,
  draggedHandle: null,
  refitTimer: null,
  targetEditRevision: 0,
  holeEditRevision: 0,
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
  calibrationReference.textContent = `${String(state.calibrationReference.reference_diameter_mm).replace(".", ",")} mm biên ngoài vòng 1`;
}

function invalidateFit(nextState = "not_fitted") {
  state.ellipseFit = null;
  state.fitState = nextState;
  state.fitError = null;
  state.calibrationStability = null;
  clearHoleGeometry();
}

function invalidateDerived() {
  state.derivedResult = null;
  state.derivationError = null;
}

function updateProvisionalScoreCard() {
  provisionalScoreCard.classList.toggle("is-miss", Boolean(state.derivedResult?.is_miss));
  provisionalScoreCard.classList.toggle("is-stale", !state.derivedResult);
  if (!state.derivedResult) {
    provisionalScoreValue.textContent = "—";
    provisionalScoreSummary.textContent = "Kết quả cũ đã hết hiệu lực — hãy Tính điểm tạm tính lại trước khi lưu.";
    return;
  }
  provisionalScoreValue.textContent = state.derivedResult.is_miss ? "MISS / 0.0" : state.derivedResult.provisional_score.toFixed(1);
  provisionalScoreSummary.textContent = `${state.derivedResult.center_distance_mm.toFixed(4)} mm · ${state.derivedResult.rule_set_id} · TẠM TÍNH — CHƯA LƯU`;
}

function clearHoleGeometry() {
  state.holeBoundaryPoints = [];
  state.holeEllipseFit = null;
  state.holeStability = null;
  state.holeFitState = "not_fitted";
  state.holeCenter = null;
  if (state.mode === "hole_boundary") state.mode = "none";
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
  state.printedCenterReference = null;
  state.draggedHandle = null;
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

function clockLabelsFromStability(stability) {
  const labels = new Map();
  stability?.pairs?.forEach((pair) => {
    labels.set(pair.first.point_index, pair.first.clock_label);
    labels.set(pair.second.point_index, pair.second.clock_label);
  });
  return labels;
}

function drawOppositeGuides(stability, lineColor, midpointColor) {
  if (!stability?.pairs) return;
  context.save();
  context.strokeStyle = lineColor;
  context.fillStyle = midpointColor;
  context.lineWidth = 1.5;
  stability.pairs.forEach((pair) => {
    const first = transforms.imageToDisplay({ x: pair.first.x_px, y: pair.first.y_px }, state.view);
    const second = transforms.imageToDisplay({ x: pair.second.x_px, y: pair.second.y_px }, state.view);
    const midpoint = transforms.imageToDisplay(pair.midpoint, state.view);
    context.beginPath(); context.moveTo(first.x, first.y); context.lineTo(second.x, second.y); context.stroke();
    context.beginPath(); context.arc(midpoint.x, midpoint.y, 4, 0, Math.PI * 2); context.fill();
  });
  context.restore();
}

function drawReferenceMarker(point) {
  if (!point) return;
  const display = transforms.imageToDisplay(point, state.view);
  context.save();
  context.strokeStyle = "#ffe66d";
  context.lineWidth = 2;
  context.beginPath(); context.arc(display.x, display.y, 7, 0, Math.PI * 2); context.stroke();
  context.fillStyle = "#ffe66d"; context.font = "12px Arial"; context.fillText("10", display.x + 9, display.y - 9);
  context.restore();
}

function stabilitySummary(stability) {
  if (!stability) return "Chưa khớp";
  const quality = stability.quality === "good" ? "Ổn định"
    : stability.quality === "usable" ? "Có thể dùng" : "Chưa ổn định";
  return `${quality} · RMS midpoint ${stability.midpoint_cluster_rms_px.toFixed(2)} px · tối đa ${stability.max_midpoint_spread_px.toFixed(2)} px · lệch tâm ${stability.midpoint_center_offset_px.toFixed(2)} px`;
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
  const targetLabels = clockLabelsFromStability(state.calibrationStability);
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
    context.fillText(targetLabels.get(index) || `P${index + 1}`, display.x + 8, display.y - 8);
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
    drawOppositeGuides(state.calibrationStability, "rgba(98, 216, 255, 0.45)", "#ffcc66");
  }
  drawReferenceMarker(state.printedCenterReference);
  const holeLabels = clockLabelsFromStability(state.holeStability);
  for (const [index, point] of state.holeBoundaryPoints.entries()) {
    const display = transforms.imageToDisplay({ x: point.x_px, y: point.y_px }, state.view);
    context.save(); context.fillStyle = "#ff7a45"; context.strokeStyle = "#23150f"; context.lineWidth = 2;
    context.beginPath(); context.arc(display.x, display.y, 5, 0, Math.PI * 2); context.fill(); context.stroke();
    context.fillStyle = "#f4f6f4"; context.font = "12px Arial"; context.fillText(holeLabels.get(index) || `P${index + 1}`, display.x + 7, display.y - 7); context.restore();
  }
  if (state.holeEllipseFit) {
    const ellipse = state.holeEllipseFit;
    const center = transforms.imageToDisplay({ x: ellipse.center_x_px, y: ellipse.center_y_px }, state.view);
    context.save(); context.translate(center.x, center.y); context.rotate((ellipse.rotation_deg * Math.PI) / 180);
    context.strokeStyle = "#74e86f"; context.lineWidth = 2; context.setLineDash([5, 3]); context.beginPath();
    context.ellipse(0, 0, ellipse.radius_major_px * state.view.scale, ellipse.radius_minor_px * state.view.scale, 0, 0, Math.PI * 2); context.stroke(); context.setLineDash([]); context.restore();
    drawOppositeGuides(state.holeStability, "rgba(116, 232, 111, 0.45)", "#c8ff7a");
    context.save(); context.strokeStyle = "#ff9d5c"; context.lineWidth = 2; context.beginPath();
    context.moveTo(center.x - 7, center.y - 7); context.lineTo(center.x + 7, center.y + 7);
    context.moveTo(center.x + 7, center.y - 7); context.lineTo(center.x - 7, center.y + 7); context.stroke(); context.restore();
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
    || (state.mode !== "calibration" && state.mode !== "hole_boundary")) return;

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
  controls.fitEllipse.disabled = !ready || state.calibrationPoints.length !== 8;
  controls.accept.disabled = !ready || state.fitState !== "fitted";
  controls.redo.disabled = !ready || state.calibrationPoints.length === 0;
  controls.printedCenter.disabled = !ready || !state.ellipseFit;
  const holeCenterReady = ready && state.fitState === "accepted" && state.ellipseFit !== null;
  controls.holeBoundary.disabled = !holeCenterReady;
  controls.undoHole.disabled = !holeCenterReady || state.holeBoundaryPoints.length === 0;
  controls.clearHole.disabled = !holeCenterReady || state.holeBoundaryPoints.length === 0;
  controls.fitHole.disabled = !holeCenterReady || state.holeBoundaryPoints.length !== 8;
  controls.acceptHole.disabled = !holeCenterReady || state.holeFitState !== "fitted";
  controls.derive.disabled = !holeCenterReady || state.holeFitState !== "accepted" || !state.sourceId;
  controls.save.disabled = !state.derivedResult || state.fitState !== "accepted" || state.holeFitState !== "accepted" || !labelerId.value.trim() || state.savedAnnotation !== null;
  controls.loupe.disabled = !ready || !pixelModeIsActive();
  controls.pan.setAttribute("aria-pressed", String(state.mode === "pan"));
  controls.calibration.setAttribute("aria-pressed", String(state.mode === "calibration"));
  controls.printedCenter.setAttribute("aria-pressed", String(state.mode === "printed_center"));
  controls.holeBoundary.setAttribute("aria-pressed", String(state.mode === "hole_boundary"));
  controls.loupe.setAttribute("aria-pressed", String(state.loupeEnabled && pixelModeIsActive()));
  calibrationStatus.textContent = ready
    ? `${state.calibrationPoints.length} / 8 điểm${state.calibrationPoints.length === 8 ? " (có thể khớp elip)" : " (cần đúng 8 điểm)"}`
    : "Chưa kích hoạt: cần ảnh JPG đã xác minh";
  fitStatus.textContent = displayFitState(state.fitState);
  fitDetails.textContent = state.ellipseFit
    ? `Tâm bia ${state.ellipseFit.center_x_px.toFixed(2)}, ${state.ellipseFit.center_y_px.toFixed(2)} px · Bán kính trục lớn ${state.ellipseFit.radius_major_px.toFixed(2)} px · Bán kính trục nhỏ ${state.ellipseFit.radius_minor_px.toFixed(2)} px · Góc xoay ${state.ellipseFit.rotation_deg.toFixed(2)}° · Sai số RMS ${state.ellipseFit.calibration_fit_residual_px.toFixed(3)} px · Sai số lớn nhất ${state.ellipseFit.max_radial_residual_px.toFixed(3)} px · Tỷ lệ trục ${state.ellipseFit.axis_ratio.toFixed(4)} · ${state.ellipseFit.point_count} điểm`
    : state.fitError ? "Không thể khớp elip từ các điểm đã chọn" : "—";
  calibrationQuality.textContent = stabilitySummary(state.calibrationStability);
  printedCenterStatus.textContent = !state.printedCenterReference
    ? "Chưa đánh dấu (chỉ chẩn đoán)"
    : !state.ellipseFit ? "Đã đánh dấu; cần khớp elip để so sánh"
      : `Lệch tâm fit ${Math.hypot(state.printedCenterReference.x_px - state.ellipseFit.center_x_px, state.printedCenterReference.y_px - state.ellipseFit.center_y_px).toFixed(2)} px · không ảnh hưởng điểm`;
  holeCenterStatus.textContent = !holeCenterReady
    ? "Vui lòng xác nhận hiệu chuẩn trước khi đánh dấu mép lỗ đạn."
    : state.holeEllipseFit
      ? `Tâm ${state.holeEllipseFit.center_x_px.toFixed(2)}, ${state.holeEllipseFit.center_y_px.toFixed(2)} px · Trục lớn ${state.holeEllipseFit.radius_major_px.toFixed(2)} px · Trục nhỏ ${state.holeEllipseFit.radius_minor_px.toFixed(2)} px · Góc ${state.holeEllipseFit.rotation_deg.toFixed(2)}° · Tỷ lệ trục ${state.holeEllipseFit.axis_ratio.toFixed(4)} · RMS ${state.holeEllipseFit.hole_ellipse_rms_residual_px.toFixed(3)} px · lớn nhất ${state.holeEllipseFit.hole_ellipse_max_residual_px.toFixed(3)} px · ${state.holeFitState === "accepted" ? "đã xác nhận" : "chưa xác nhận"}`
      : `${state.holeBoundaryPoints.length} / 8 điểm mép lỗ đạn`;
  holeStabilityStatus.textContent = stabilitySummary(state.holeStability);
  derivationStatus.textContent = state.derivedResult
    ? "TẠM TÍNH — CHƯA LƯU DỮ LIỆU GROUND TRUTH"
    : state.derivationError ? "Không thể tính điểm tạm tính" : "Chưa tính";
  derivationDetails.textContent = state.derivedResult
    ? `Bộ quy tắc ${state.derivedResult.rule_set_id} · Tâm bia ${state.derivedResult.target_center_x_px.toFixed(2)}, ${state.derivedResult.target_center_y_px.toFixed(2)} px · Tâm lỗ đạn ${state.derivedResult.hole_center_x_px.toFixed(2)}, ${state.derivedResult.hole_center_y_px.toFixed(2)} px · Tỷ lệ trục lớn ${state.derivedResult.mm_per_px_major.toFixed(6)} mm/px · Tỷ lệ trục nhỏ ${state.derivedResult.mm_per_px_minor.toFixed(6)} mm/px · Khoảng cách tâm bia – tâm lỗ đạn ${state.derivedResult.center_distance_mm.toFixed(4)} mm · ${state.derivedResult.is_miss ? "0,0 / Ngoài vùng tính điểm" : `Điểm Ground Truth tạm tính ${state.derivedResult.provisional_score.toFixed(1)}`}`
    : "—";
  zoomStatus.textContent = ready ? `${Math.round(state.view.scale * 100)}%` : "—";
  pixelModeStatus.textContent = !ready ? "—" : pixelModeIsActive()
    ? "Bật tự động — hiển thị pixel gốc" : "Tắt — sẽ tự bật từ 100%";
  updateProvisionalScoreCard();
  canvas.style.cursor = state.panStart ? "grabbing" : (state.mode === "pan" || state.spacePanActive)
    ? "grab" : (state.mode === "calibration" || state.mode === "hole_boundary") ? "crosshair" : "default";
}

async function saveAnnotation() {
  if (!state.derivedResult || !labelerId.value.trim() || state.savedAnnotation) return;
  const score = state.derivedResult.provisional_score.toFixed(1);
  if (!window.confirm(`Lưu lượt chấm ${annotationPass.value} cho ${state.sourceId}, người chấm ${labelerId.value.trim()}, điểm tạm tính ${score}?`)) return;
  saveStatus.textContent = "Đang lưu lượt chấm…";
  const response = await fetch("/api/annotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_id: state.sourceId, annotation_pass: annotationPass.value, labeler_id: labelerId.value.trim(), calibration_points: state.calibrationPoints, hole_boundary_points: state.holeBoundaryPoints, perspective_status: perspectiveStatus.value, label_quality: labelQuality.value, notes: annotationNotes.value }) });
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
  state.printedCenterReference = null;
  invalidateFit();
  updateControls();
  render();
}

function addHoleBoundaryPoint(imagePoint) {
  if (!imagePoint || !Number.isFinite(imagePoint.x) || !Number.isFinite(imagePoint.y)
    || imagePoint.x < 0 || imagePoint.y < 0) return;
  if (state.holeBoundaryPoints.length >= 8) { holeCenterStatus.textContent = "Đã đủ 8 điểm mép lỗ đạn; không thể thêm điểm thứ 9."; return; }
  state.holeBoundaryPoints.push({ x_px: imagePoint.x, y_px: imagePoint.y });
  state.holeEllipseFit = null; state.holeStability = null; state.holeFitState = "not_fitted"; state.holeCenter = null;
  invalidateDerived();
  updateControls();
  render();
}

async function deriveScore() {
  if (!state.sourceId || state.holeFitState !== "accepted" || !state.ellipseFit || state.fitState !== "accepted") return;
  invalidateDerived();
  derivationStatus.textContent = "Đang tính điểm tạm tính…";
  try {
    const response = await fetch("/api/derive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_id: state.sourceId,
        calibration_points: state.calibrationPoints,
        hole_boundary_points: state.holeBoundaryPoints,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.status || "provisional_derivation_failed");
    if (payload.result.source_id !== state.sourceId) throw new Error("stale_source_result_rejected");
    state.derivedResult = payload.result;
    state.holeEllipseFit = payload.hole_ellipse;
    state.holeCenter = { x_px: payload.hole_ellipse.center_x_px, y_px: payload.hole_ellipse.center_y_px };
  } catch (error) {
    state.derivationError = displayStatus(error.message);
  }
  updateControls();
}

async function fitHoleEllipse() {
  if (state.holeBoundaryPoints.length !== 8) return;
  state.holeFitState = "fitting"; state.holeEllipseFit = null; state.holeCenter = null; invalidateDerived(); updateControls();
  try {
    const response = await fetch("/api/hole-ellipse/fit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: state.holeBoundaryPoints }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.detail?.status || "invalid_hole_boundary_points");
    state.holeEllipseFit = payload.ellipse; state.holeStability = payload.stability; state.holeFitState = "fitted";
  } catch (error) { state.holeFitState = "needs_redo"; holeCenterStatus.textContent = displayStatus(error.message); }
  updateControls(); render();
}

async function fitEllipse() {
  if (!state.verifiedAndDecoded || state.calibrationPoints.length !== 8) return;
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
    state.calibrationStability = payload.stability;
    state.fitState = "fitted";
  } catch (error) {
    invalidateFit("needs_redo");
    state.fitError = displayStatus(error.message);
  }
  updateControls();
  render();
}

function scheduleLiveRefit(kind) {
  if (state.refitTimer) window.clearTimeout(state.refitTimer);
  state.refitTimer = window.setTimeout(() => {
    state.refitTimer = null;
    if (kind === "target") fitTargetPreview();
    else fitHolePreview();
  }, 80);
}

async function fitTargetPreview() {
  if (state.calibrationPoints.length !== 8) return;
  const revision = state.targetEditRevision;
  try {
    const response = await fetch("/api/calibration/fit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: state.calibrationPoints }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.status || "ellipse_fit_failed");
    if (revision !== state.targetEditRevision) return;
    state.ellipseFit = payload.ellipse; state.calibrationStability = payload.stability; state.fitState = "fitted"; state.fitError = null;
  } catch (error) {
    if (revision !== state.targetEditRevision) return;
    state.fitState = "needs_redo"; state.fitError = displayStatus(error.message);
  }
  updateControls(); render();
}

async function fitHolePreview() {
  if (state.holeBoundaryPoints.length !== 8) return;
  const revision = state.holeEditRevision;
  try {
    const response = await fetch("/api/hole-ellipse/fit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: state.holeBoundaryPoints }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.status || "invalid_hole_boundary_points");
    if (revision !== state.holeEditRevision) return;
    state.holeEllipseFit = payload.ellipse; state.holeStability = payload.stability; state.holeFitState = "fitted";
  } catch (error) {
    if (revision !== state.holeEditRevision) return;
    state.holeFitState = "needs_redo"; holeCenterStatus.textContent = displayStatus(error.message);
  }
  updateControls(); render();
}

function beginHandleDrag(kind, event, imagePoint) {
  const points = kind === "target" ? state.calibrationPoints : state.holeBoundaryPoints;
  const pointIndex = guides.nearestHandleIndex(points, imagePoint, 12 / state.view.scale);
  if (pointIndex < 0) return false;
  state.draggedHandle = { kind, pointIndex, pointerId: event.pointerId };
  canvas.setPointerCapture(event.pointerId);
  if (kind === "target") {
    const invalidated = guides.invalidatedGeometryState("target");
    state.fitState = invalidated.fitState; state.savedAnnotation = invalidated.savedAnnotation; invalidateDerived();
  } else {
    const invalidated = guides.invalidatedGeometryState("hole");
    state.holeFitState = invalidated.holeFitState; state.holeCenter = null; state.savedAnnotation = invalidated.savedAnnotation; invalidateDerived();
  }
  updateControls(); render();
  return true;
}

function updateDraggedHandle(imagePoint) {
  if (!state.draggedHandle || !imagePoint) return;
  const { kind, pointIndex } = state.draggedHandle;
  if (kind === "target") {
    state.calibrationPoints = guides.replaceRawPoint(state.calibrationPoints, pointIndex, imagePoint);
    state.targetEditRevision += 1;
  } else {
    state.holeBoundaryPoints = guides.replaceRawPoint(state.holeBoundaryPoints, pointIndex, imagePoint);
    state.holeEditRevision += 1;
  }
  invalidateDerived();
  scheduleLiveRefit(kind);
  updateControls(); render();
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

  if ((state.calibrationPoints.length > 0 || state.ellipseFit || state.holeBoundaryPoints.length > 0) && sourceId !== state.sourceId
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
controls.printedCenter.addEventListener("click", () => {
  state.mode = state.mode === "printed_center" ? "none" : "printed_center";
  updateControls(); render();
});
controls.holeBoundary.addEventListener("click", () => {
  state.mode = state.mode === "hole_boundary" ? "none" : "hole_boundary";
  updateControls();
});
controls.undoHole.addEventListener("click", () => {
  state.holeBoundaryPoints.pop(); state.holeEllipseFit = null; state.holeFitState = "not_fitted"; state.holeCenter = null; invalidateDerived();
  updateControls(); render();
});
controls.clearHole.addEventListener("click", () => {
  if (state.holeBoundaryPoints.length && window.confirm("Bạn có muốn xóa các điểm mép lỗ đạn không?")) {
    clearHoleGeometry();
    updateControls();
    render();
  }
});
controls.fitHole.addEventListener("click", fitHoleEllipse);
controls.acceptHole.addEventListener("click", () => {
  if (state.holeEllipseFit) { state.holeFitState = "accepted"; state.holeCenter = { x_px: state.holeEllipseFit.center_x_px, y_px: state.holeEllipseFit.center_y_px }; updateControls(); render(); }
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
  if (state.draggedHandle?.pointerId === event.pointerId) {
    const imagePoint = imagePointFromEvent(event);
    if (imagePoint) updateDraggedHandle(imagePoint);
  }
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
  const imagePoint = imagePointFromEvent(event);
  if (!imagePoint) {
    if (state.mode === "calibration") calibrationStatus.textContent = "Con trỏ nằm ngoài vùng ảnh: không thêm điểm";
    else if (state.mode === "hole_boundary") holeCenterStatus.textContent = "Con trỏ nằm ngoài vùng ảnh: chưa thêm điểm mép lỗ đạn";
    return;
  }
  if (beginHandleDrag("target", event, imagePoint) || beginHandleDrag("hole", event, imagePoint)) return;
  if (state.mode === "printed_center") {
    state.printedCenterReference = { x_px: imagePoint.x, y_px: imagePoint.y };
    state.mode = "none";
    updateControls(); render();
    return;
  }
  if (state.mode === "calibration") {
    if (state.calibrationPoints.length >= 8) {
      calibrationStatus.textContent = "Chỉ được chọn tối đa 8 điểm hiệu chuẩn";
      return;
    }
    state.calibrationPoints.push({ x_px: imagePoint.x, y_px: imagePoint.y });
    invalidateFit();
    updateControls();
    render();
  }
  if (state.mode === "hole_boundary") {
    addHoleBoundaryPoint(imagePoint);
  }
});
canvas.addEventListener("pointerup", (event) => {
  if (state.draggedHandle?.pointerId === event.pointerId) {
    state.draggedHandle = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    updateControls(); render();
    return;
  }
  if (!state.panStart) return;
  state.panStart = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  updateControls();
});
canvas.addEventListener("pointercancel", (event) => {
  if (state.draggedHandle?.pointerId === event.pointerId) {
    state.draggedHandle = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    updateControls(); render();
    return;
  }
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
