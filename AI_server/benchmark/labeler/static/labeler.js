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
const targetGuidedStatus = document.querySelector("#target-guided-status");
const targetMidpointDiagnostics = document.querySelector("#target-midpoint-diagnostics");
const holeCenterStatus = document.querySelector("#hole-center-status");
const holeStabilityStatus = document.querySelector("#hole-stability-status");
const holeMidpointDiagnostics = document.querySelector("#hole-midpoint-diagnostics");
const derivationStatus = document.querySelector("#derivation-status");
const derivationDetails = document.querySelector("#derivation-details");
const zoomStatus = document.querySelector("#zoom-status");
const pixelModeStatus = document.querySelector("#pixel-mode-status");
const cursorStatus = document.querySelector("#cursor-status");
const labelerId = document.querySelector("#labeler-id");
const annotationPass = document.querySelector("#annotation-pass");
const targetLabelQuality = document.querySelector("#target-label-quality");
const holeLabelQuality = document.querySelector("#hole-label-quality");
const savedAnnotationsPanel = document.querySelector("#saved-annotations-panel");
const savedAnnotationsList = document.querySelector("#saved-annotations-list");
const savedAnnotationsEmpty = document.querySelector("#saved-annotations-empty");
const annotationNotes = document.querySelector("#annotation-notes");
const saveStatus = document.querySelector("#save-status");
const provisionalScoreCard = document.querySelector("#provisional-score-card");
const provisionalScoreValue = document.querySelector("#provisional-score-value");
const provisionalScoreSummary = document.querySelector("#provisional-score-summary");
const controls = {
  fit: document.querySelector("#fit-view"),
  loupe: document.querySelector("#loupe-toggle"),
  calibration: document.querySelector("#calibration-mode"),
  undo: document.querySelector("#undo-point"),
  clear: document.querySelector("#clear-points"),
  fitEllipse: document.querySelector("#fit-ellipse"),
  acceptTargetGhosts: document.querySelector("#target-ghost-accept"),
  redo: document.querySelector("#redo-calibration"),
  holeBoundary: document.querySelector("#hole-boundary-mode"),
  undoHole: document.querySelector("#undo-hole-point"),
  clearHole: document.querySelector("#clear-hole-points"),
  fitHole: document.querySelector("#fit-hole-ellipse"),
  acceptHoleGhosts: document.querySelector("#hole-ghost-accept"),
  derive: document.querySelector("#derive-score"),
  save: document.querySelector("#save-annotation"),
  viewSaved: document.querySelector("#view-saved-annotations"),
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
  targetMidpoints: null,
  calibrationReference: null,
  holeBoundaryPoints: [],
  holeEllipseFit: null,
  holeStability: null,
  holeMidpoints: null,
  holeFitState: "not_fitted",
  holeCenter: null,
  derivedResult: null,
  derivationError: null,
  savedAnnotation: null,
  draggedHandle: null,
  refitTimer: null,
  targetEditRevision: 0,
  holeEditRevision: 0,
  imagePixels: null,
  targetSnapPreviews: [],
  holeSnapPreviews: [],
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
  state.targetMidpoints = null;
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
  state.holeSnapPreviews = [];
  state.holeEllipseFit = null;
  state.holeStability = null;
  state.holeMidpoints = null;
  state.holeFitState = "not_fitted";
  state.holeCenter = null;
  if (state.mode === "hole_boundary") state.mode = "none";
  invalidateDerived();
}


function resetImage(message) {
  state.image = null;
  state.imagePixels = null;
  state.metadata = null;
  state.verifiedAndDecoded = false;
  state.pointerImage = null;
  state.mode = "none";
  state.fitActive = false;
  state.panStart = null;
  state.savedAnnotation = null;
  state.targetSnapPreviews = [];
  state.holeSnapPreviews = [];
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

function stabilitySummary(stability) {
  if (!stability) return "Chưa khớp";
  const quality = stability.quality === "good" ? "Ổn định"
    : stability.quality === "usable" ? "Có thể dùng" : "Chưa ổn định";
  return `${quality} · RMS midpoint ${stability.midpoint_cluster_rms_px.toFixed(2)} px · tối đa ${stability.max_midpoint_spread_px.toFixed(2)} px · lệch tâm ${stability.midpoint_center_offset_px.toFixed(2)} px`;
}

function updateSnapPreviews(kind) {
  const points = kind === "target" ? state.calibrationPoints : state.holeBoundaryPoints;
  const key = kind === "target" ? "targetSnapPreviews" : "holeSnapPreviews";
  if (points.length !== 4 || !state.imagePixels) { state[key] = []; return; }
  const ghosts = guides.diagonalGhosts(points);
  state[key] = ghosts.map((ghost) => guides.localEdgeCandidate(
    state.imagePixels.data, state.imagePixels.width, state.imagePixels.height, ghost, 10,
  ) || ghost);
}

function drawGhostSuggestions(points, snapPreviews, color) {
  if (points.length !== 4) return;
  const ghosts = guides.diagonalGhosts(points);
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.setLineDash([4, 4]);
  ghosts.forEach((point, index) => {
    const display = transforms.imageToDisplay(point, state.view);
    context.globalAlpha = 0.55;
    context.beginPath(); context.arc(display.x, display.y, 6, 0, Math.PI * 2); context.stroke();
    const candidate = snapPreviews[index];
    if (candidate) {
      const candidateDisplay = transforms.imageToDisplay(candidate, state.view);
      context.globalAlpha = 0.85;
      context.setLineDash([]);
      context.beginPath(); context.moveTo(candidateDisplay.x - 5, candidateDisplay.y); context.lineTo(candidateDisplay.x + 5, candidateDisplay.y);
      context.moveTo(candidateDisplay.x, candidateDisplay.y - 5); context.lineTo(candidateDisplay.x, candidateDisplay.y + 5); context.stroke();
      context.setLineDash([4, 4]);
    }
  });
  context.restore();
}

function residualColor(residuals, index) {
  const residual = residuals[index] || 0;
  const rms = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / Math.max(1, residuals.length));
  if (residual > Math.max(2.5, rms * 2.25)) return "#ff4242";
  if (residual > Math.max(1.25, rms * 1.35)) return "#ffd43b";
  return null;
}

function midpointPointColor(diagnostics, index) {
  const worst = diagnostics?.pairs?.reduce((current, pair) => !current || pair.distance_px > current.distance_px ? pair : current, null);
  if (!worst || (worst.first_point_index !== index && worst.second_point_index !== index)) return null;
  return worst.severity === "strong_warning" ? "#ff4242" : worst.severity === "warning" ? "#ffd43b" : null;
}

function midpointSummary(diagnostics) {
  if (!diagnostics) return "Chưa khớp";
  const pairs = diagnostics.pairs.map((pair) => `Cặp ${pair.pair_index}: ${pair.distance_px.toFixed(1)} px${pair.severity === "strong_warning" ? " ⚠" : pair.severity === "warning" ? " !" : ""}`);
  return `${pairs.join(" · ")} · RMS ${diagnostics.midpoint_rms_px.toFixed(2)} px · Max ${diagnostics.midpoint_max_px.toFixed(2)} px`;
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
  drawGhostSuggestions(state.calibrationPoints, state.targetSnapPreviews, "#b67cff");
  drawGhostSuggestions(state.holeBoundaryPoints, state.holeSnapPreviews, "#b67cff");
  const targetResiduals = guides.pointResiduals(state.calibrationPoints, state.ellipseFit);
  for (const [index, point] of state.calibrationPoints.entries()) {
    const display = transforms.imageToDisplay({ x: point.x_px, y: point.y_px }, state.view);
    context.save();
    context.strokeStyle = midpointPointColor(state.targetMidpoints, index) || residualColor(targetResiduals, index) || "#f0a928";
    context.fillStyle = "#14251a";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(display.x, display.y, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
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
  const holeResiduals = guides.pointResiduals(state.holeBoundaryPoints, state.holeEllipseFit);
  for (const [index, point] of state.holeBoundaryPoints.entries()) {
    const display = transforms.imageToDisplay({ x: point.x_px, y: point.y_px }, state.view);
    context.save(); context.fillStyle = "#ff7a45"; context.strokeStyle = midpointPointColor(state.holeMidpoints, index) || residualColor(holeResiduals, index) || "#23150f"; context.lineWidth = 2;
    context.beginPath(); context.arc(display.x, display.y, 5, 0, Math.PI * 2); context.fill(); context.stroke();
    context.restore();
  }
  if (state.holeEllipseFit) {
    const ellipse = state.holeEllipseFit;
    const center = transforms.imageToDisplay({ x: ellipse.center_x_px, y: ellipse.center_y_px }, state.view);
    context.save(); context.translate(center.x, center.y); context.rotate((ellipse.rotation_deg * Math.PI) / 180);
    context.strokeStyle = "#74e86f"; context.lineWidth = 2; context.setLineDash([5, 3]); context.beginPath();
    context.ellipse(0, 0, ellipse.radius_major_px * state.view.scale, ellipse.radius_minor_px * state.view.scale, 0, 0, Math.PI * 2); context.stroke(); context.setLineDash([]); context.restore();
  }
  if (state.holeEllipseFit) {
    const display = transforms.imageToDisplay(
      {x_px: state.holeEllipseFit.center_x_px, y_px: state.holeEllipseFit.center_y_px}, state.view,
    );
    context.save();
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#41cf67";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(display.x, display.y, 6, 0, Math.PI * 2);
    context.fill();
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
  controls.acceptTargetGhosts.disabled = !ready || state.calibrationPoints.length !== 4;
  controls.redo.disabled = !ready || state.calibrationPoints.length === 0;
  const holeCenterReady = ready && state.ellipseFit !== null;
  controls.holeBoundary.disabled = !holeCenterReady;
  controls.undoHole.disabled = !holeCenterReady || state.holeBoundaryPoints.length === 0;
  controls.clearHole.disabled = !holeCenterReady || state.holeBoundaryPoints.length === 0;
  controls.fitHole.disabled = !holeCenterReady || state.holeBoundaryPoints.length !== 8;
  controls.acceptHoleGhosts.disabled = !holeCenterReady || state.holeBoundaryPoints.length !== 4;
  controls.derive.disabled = !holeCenterReady || !state.holeEllipseFit || !state.sourceId;
  controls.save.disabled = !state.derivedResult || !state.ellipseFit || !state.holeEllipseFit || !labelerId.value.trim() || !targetLabelQuality.value || !holeLabelQuality.value || state.savedAnnotation !== null;
  controls.loupe.disabled = !ready || !pixelModeIsActive();
  controls.calibration.setAttribute("aria-pressed", String(state.mode === "calibration"));
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
  targetMidpointDiagnostics.textContent = midpointSummary(state.targetMidpoints);
  targetGuidedStatus.textContent = state.calibrationPoints.length === 4
    ? "4 điểm chéo mờ và dấu + là gợi ý cục bộ; bấm Áp dụng rồi tinh chỉnh."
    : state.calibrationPoints.length === 8 ? "Đã có 8 điểm cuối cùng; tâm đỏ là tâm ellipse khớp." : "Đặt trước 4 điểm neo: trên, phải, dưới, trái.";
  holeCenterStatus.textContent = !holeCenterReady
    ? "Vui lòng xác nhận hiệu chuẩn trước khi đánh dấu mép lỗ đạn."
    : state.holeEllipseFit
      ? `Tâm ellipse ${state.holeEllipseFit.center_x_px.toFixed(2)}, ${state.holeEllipseFit.center_y_px.toFixed(2)} px · Trục lớn ${state.holeEllipseFit.radius_major_px.toFixed(2)} px · Trục nhỏ ${state.holeEllipseFit.radius_minor_px.toFixed(2)} px · Góc ${state.holeEllipseFit.rotation_deg.toFixed(2)}° · RMS ${state.holeEllipseFit.hole_ellipse_rms_residual_px.toFixed(3)} px · lớn nhất ${state.holeEllipseFit.hole_ellipse_max_residual_px.toFixed(3)} px`
      : `${state.holeBoundaryPoints.length} / 8 điểm mép lỗ đạn`;
  holeStabilityStatus.textContent = stabilitySummary(state.holeStability);
  holeMidpointDiagnostics.textContent = midpointSummary(state.holeMidpoints);
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
  const midpointWarning = Math.max(state.targetMidpoints?.midpoint_max_px || 0, state.holeMidpoints?.midpoint_max_px || 0) > 2.5
    ? "\n\nCó cặp điểm đối diện lệch nhiều. Nên kiểm tra lại trước khi lưu." : "";
  if (!window.confirm(`Lưu lượt chấm ${annotationPass.value} cho ${state.sourceId}, người chấm ${labelerId.value.trim()}, điểm tạm tính ${score}?${midpointWarning}`)) return;
  saveStatus.textContent = "Đang lưu lượt chấm…";
  const response = await fetch("/api/annotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_id: state.sourceId, annotation_pass: annotationPass.value, labeler_id: labelerId.value.trim(), calibration_points: state.calibrationPoints, hole_boundary_points: state.holeBoundaryPoints, target_label_quality: targetLabelQuality.value, hole_label_quality: holeLabelQuality.value, target_center_method: "assisted_ellipse_8pt_v1", hole_center_method: "assisted_ellipse_8pt_v1", notes: annotationNotes.value }) });
  const payload = await response.json();
  if (!response.ok) { saveStatus.textContent = payload.detail?.status === "duplicate_annotation_pass" ? "Lượt chấm này đã tồn tại." : "Không thể lưu lượt chấm."; return; }
  state.savedAnnotation = payload.annotation_id;
  saveStatus.textContent = `Đã lưu lượt chấm. Mã annotation: ${payload.annotation_id}`;
  updateControls();
}

async function toggleSavedAnnotations() {
  if (!savedAnnotationsPanel.hidden) { savedAnnotationsPanel.hidden = true; return; }
  const response = await fetch("/api/annotations/saved");
  const payload = await response.json();
  const items = response.ok ? payload.items : [];
  savedAnnotationsList.replaceChildren(...items.map((item) => {
    const row = document.createElement("li");
    row.textContent = `${item.source_id} · Pass ${item.annotation_pass} · ${item.labeler_id} · ${item.saved_at || ""}`;
    return row;
  }));
  savedAnnotationsEmpty.hidden = items.length > 0;
  savedAnnotationsPanel.hidden = false;
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
  state.targetSnapPreviews = [];
  invalidateFit();
  updateControls();
  render();
}

function addHoleBoundaryPoint(imagePoint) {
  if (!imagePoint || !Number.isFinite(imagePoint.x) || !Number.isFinite(imagePoint.y)
    || imagePoint.x < 0 || imagePoint.y < 0) return;
  if (state.holeBoundaryPoints.length >= 8) { holeCenterStatus.textContent = "Đã đủ 8 điểm mép lỗ đạn; không thể thêm điểm thứ 9."; return; }
  state.holeBoundaryPoints.push({ x_px: imagePoint.x, y_px: imagePoint.y });
  state.holeEllipseFit = null; state.holeStability = null; state.holeMidpoints = null; state.holeFitState = "not_fitted"; state.holeCenter = null;
  updateSnapPreviews("hole");
  invalidateDerived();
  updateControls();
  render();
}

async function deriveScore() {
  if (!state.sourceId || !state.holeEllipseFit || !state.ellipseFit) return;
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
  state.holeFitState = "fitting"; state.holeEllipseFit = null; state.holeMidpoints = null; state.holeCenter = null; invalidateDerived(); updateControls();
  try {
    const response = await fetch("/api/hole-ellipse/fit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: state.holeBoundaryPoints }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.detail?.status || "invalid_hole_boundary_points");
    state.holeEllipseFit = payload.ellipse; state.holeStability = payload.stability; state.holeMidpoints = payload.midpoint_diagnostics; state.holeFitState = "fitted";
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
    state.targetMidpoints = payload.midpoint_diagnostics;
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
    state.ellipseFit = payload.ellipse; state.calibrationStability = payload.stability; state.targetMidpoints = payload.midpoint_diagnostics; state.fitState = "fitted"; state.fitError = null;
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
    state.holeEllipseFit = payload.ellipse; state.holeStability = payload.stability; state.holeMidpoints = payload.midpoint_diagnostics; state.holeFitState = "fitted";
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
    state.fitState = invalidated.fitState; state.ellipseFit = null; state.targetMidpoints = null; state.savedAnnotation = invalidated.savedAnnotation; invalidateDerived();
  } else {
    const invalidated = guides.invalidatedGeometryState("hole");
    state.holeFitState = invalidated.holeFitState; state.holeEllipseFit = null; state.holeMidpoints = null; state.holeCenter = null; state.savedAnnotation = invalidated.savedAnnotation; invalidateDerived();
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
    if (state.calibrationPoints.length === 4) updateSnapPreviews("target");
  } else {
    state.holeBoundaryPoints = guides.replaceRawPoint(state.holeBoundaryPoints, pointIndex, imagePoint);
    state.holeEditRevision += 1;
    if (state.holeBoundaryPoints.length === 4) updateSnapPreviews("hole");
  }
  invalidateDerived();
  scheduleLiveRefit(kind);
  updateControls(); render();
}

function acceptGhosts(kind) {
  const points = kind === "target" ? state.calibrationPoints : state.holeBoundaryPoints;
  const previews = kind === "target" ? state.targetSnapPreviews : state.holeSnapPreviews;
  if (points.length !== 4) return;
  const finalPoints = previews.length === 4 ? previews : guides.diagonalGhosts(points);
  if (kind === "target") {
    state.calibrationPoints = [...points, ...finalPoints.map((point) => ({x_px: point.x_px, y_px: point.y_px}))];
    state.targetSnapPreviews = [];
    state.targetEditRevision += 1;
    invalidateFit();
  } else {
    state.holeBoundaryPoints = [...points, ...finalPoints.map((point) => ({x_px: point.x_px, y_px: point.y_px}))];
    state.holeSnapPreviews = [];
    state.holeEditRevision += 1;
    state.holeEllipseFit = null; state.holeStability = null; state.holeMidpoints = null; state.holeFitState = "not_fitted";
    invalidateDerived();
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
      const pixelCanvas = document.createElement("canvas");
      pixelCanvas.width = verifiedImage.naturalWidth;
      pixelCanvas.height = verifiedImage.naturalHeight;
      const pixelContext = pixelCanvas.getContext("2d", { willReadFrequently: true });
      pixelContext.drawImage(verifiedImage, 0, 0);
      state.imagePixels = { data: pixelContext.getImageData(0, 0, pixelCanvas.width, pixelCanvas.height).data, width: pixelCanvas.width, height: pixelCanvas.height };
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
  updateSnapPreviews("target");
  invalidateFit();
  updateControls();
  render();
});
controls.clear.addEventListener("click", () => {
  if (state.calibrationPoints.length > 0 && window.confirm("Bạn có muốn bỏ các điểm hiệu chuẩn hiện tại không?")) clearTransientPoints();
});
controls.fitEllipse.addEventListener("click", fitEllipse);
controls.acceptTargetGhosts.addEventListener("click", () => acceptGhosts("target"));
controls.redo.addEventListener("click", redoCalibration);
controls.holeBoundary.addEventListener("click", () => {
  state.mode = state.mode === "hole_boundary" ? "none" : "hole_boundary";
  updateControls();
});
controls.undoHole.addEventListener("click", () => {
  state.holeBoundaryPoints.pop(); state.holeEllipseFit = null; state.holeFitState = "not_fitted"; state.holeCenter = null; invalidateDerived();
  updateSnapPreviews("hole");
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
controls.acceptHoleGhosts.addEventListener("click", () => acceptGhosts("hole"));
controls.derive.addEventListener("click", deriveScore);
controls.save.addEventListener("click", () => { saveAnnotation().catch(() => { saveStatus.textContent = "Không thể lưu lượt chấm."; }); });
controls.viewSaved.addEventListener("click", () => { toggleSavedAnnotations().catch(() => { savedAnnotationsEmpty.textContent = "Không thể đọc nhãn đã lưu."; savedAnnotationsPanel.hidden = false; }); });
labelerId.addEventListener("input", updateControls);
targetLabelQuality.addEventListener("change", updateControls);
holeLabelQuality.addEventListener("change", updateControls);
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
  if (state.mode === "calibration") {
    if (state.calibrationPoints.length >= 8) {
      calibrationStatus.textContent = "Chỉ được chọn tối đa 8 điểm hiệu chuẩn";
      return;
    }
    state.calibrationPoints.push({ x_px: imagePoint.x, y_px: imagePoint.y });
    updateSnapPreviews("target");
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
