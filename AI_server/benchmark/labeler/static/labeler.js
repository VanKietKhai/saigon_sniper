"use strict";

document.documentElement.dataset.labelerStage = "verified-image-loading";

const transforms = window.LabelerCanvasTransforms;
const guides = window.LabelerEllipseGuides;
const sourceSessions = guides.createSourceSessionGuard();
const datasetConfigured = document.querySelector("#dataset-configured");
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
const centerComparison = document.querySelector("#center-comparison");
const derivationDetails = document.querySelector("#derivation-details");
const holeCenterStatus = document.querySelector("#hole-center-status");
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
const saveStatus = document.querySelector("#save-status");
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
  cardinalProjectiveCenter: null,
  ellipseFit: null,
  derivedResult: null,
  derivationError: null,
  targetSnapPreviews: [],
  holeBoundaryPoints: [],
  holeEllipseFit: null,
  holeStability: null,
  holeMidpoints: null,
  holeLeaveOneOut: null,
  holePairRecommendations: null,
  diagnosticFocus: null,
  holeFitState: "not_fitted",
  holeCenter: null,
  holeCardinalCenter: null,
  savedAnnotation: null,
  draggedHandle: null,
  refitTimer: null,
  targetEditRevision: 0,
  holeEditRevision: 0,
  imagePixels: null,
  holeSnapPreviews: [],
  sourceRequestToken: null,
};

async function loadHealth() {
  const response = await fetch("/health");
  if (!response.ok) throw new Error("health_request_failed");
  const health = await response.json();
  datasetConfigured.textContent = health.dataset_configured ? "Đã cấu hình" : "Chưa cấu hình";
}

function invalidateFit(nextState = "not_fitted") {
  void nextState;
  state.ellipseFit = null;
  state.cardinalProjectiveCenter = null;
  clearHoleGeometry();
}

function invalidateDerived() {
  state.derivedResult = null;
  state.derivationError = null;
}

function clearHoleGeometry() {
  state.holeBoundaryPoints = [];
  state.holeSnapPreviews = [];
  state.holeEllipseFit = null;
  state.holeStability = null;
  state.holeMidpoints = null;
  state.holeLeaveOneOut = null;
  state.holePairRecommendations = null;
  state.diagnosticFocus = null;
  state.holeFitState = "not_fitted";
  state.holeCenter = null; state.holeCardinalCenter = null;
  state.holeEditRevision += 1;
  if (state.mode === "hole_boundary") state.mode = "none";
  invalidateDerived();
}


function isCurrentSourceRequest(token) {
  return token === state.sourceRequestToken && sourceSessions.isCurrent(token);
}

function resetSourceState(message) {
  if (state.refitTimer) window.clearTimeout(state.refitTimer);
  state.refitTimer = null;
  state.sourceId = null;
  state.image = null;
  state.imagePixels = null;
  state.metadata = null;
  state.verifiedAndDecoded = false;
  state.view = { scale: 1, panX: 0, panY: 0 };
  state.pointerImage = null;
  state.mode = "none";
  state.fitActive = false;
  state.panStart = null;
  state.spacePanActive = false;
  state.loupeEnabled = false;
  state.calibrationPoints = [];
  state.targetSnapPreviews = [];
  state.cardinalProjectiveCenter = null;
  state.ellipseFit = null;
  state.derivedResult = null;
  state.derivationError = null;
  state.holeBoundaryPoints = [];
  state.holeEllipseFit = null;
  state.holeStability = null;
  state.holeMidpoints = null;
  state.holeLeaveOneOut = null;
  state.holePairRecommendations = null;
  state.diagnosticFocus = null;
  state.holeFitState = "not_fitted";
  state.holeCenter = null;
  state.holeCardinalCenter = null;
  state.savedAnnotation = null;
  state.holeSnapPreviews = [];
  state.draggedHandle = null;
  state.targetEditRevision += 1;
  state.holeEditRevision += 1;
  targetLabelQuality.value = "";
  holeLabelQuality.value = "";
  savedAnnotationsPanel.hidden = true;
  sourceIdStatus.textContent = "Chưa mở";
  identityStatus.textContent = "Đang kiểm tra…";
  saveStatus.textContent = "Chưa lưu lượt chấm";
  imageMessage.hidden = false;
  imageMessage.textContent = message;
  imageDetails.textContent = "Chưa mở";
  cursorStatus.textContent = "Ngoài vùng ảnh";
  updateControls();
  render();
}

function resetImage(message) {
  resetSourceState(message);
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
  // Diagonal points are only deterministic starting positions; never snap them to pixels.
  state[key] = ghosts;
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

function recommendedPoint(index, recommendations) {
  return recommendations?.some((item) => item.recommendation === "check_point" && item.recommended_point_index === index);
}

function drawDiagnosticPointRing(display, kind, index, recommendations) {
  const focused = state.diagnosticFocus?.kind === kind && state.diagnosticFocus.pointIndex === index;
  if (!focused && !recommendedPoint(index, recommendations)) return;
  context.save();
  context.strokeStyle = focused ? "#ff4242" : "#ff9f1c";
  context.lineWidth = focused ? 3 : 2.5;
  context.beginPath();
  context.arc(display.x, display.y, focused ? 11 : 9, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function midpointPairNames(kind) {
  return kind === "target"
    ? ["12h ↔ 6h", "1h30 ↔ 7h30", "3h ↔ 9h", "4h30 ↔ 10h30"]
    : ["Trên ↔ Dưới", "Trên-phải ↔ Dưới-trái", "Phải ↔ Trái", "Dưới-phải ↔ Trên-trái"];
}

function midpointDirection(pair) {
  const direction = (value, negative, positive, axis) => value < -0.05
    ? `${negative} ${Math.abs(value).toFixed(1)} px (${axis} ${value.toFixed(1)})`
    : value > 0.05 ? `${positive} ${Math.abs(value).toFixed(1)} px (${axis} +${value.toFixed(1)})`
      : `${axis} 0.0 px`;
  return `${direction(pair.dx_px, "←", "→", "Δx")}, ${direction(pair.dy_px, "↑", "↓", "Δy")}`;
}

function pointNames(kind) {
  return kind === "target"
    ? ["12h", "1h30", "3h", "4h30", "6h", "7h30", "9h", "10h30"]
    : ["Trên", "Trên-phải", "Phải", "Dưới-phải", "Dưới", "Dưới-trái", "Trái", "Trên-trái"];
}

function correctionDirection(point) {
  const direction = (value, negative, positive) => value < -0.05 ? `${negative} ${Math.abs(value).toFixed(1)} px` : value > 0.05 ? `${positive} ${Math.abs(value).toFixed(1)} px` : "0.0 px";
  return `${direction(point.loo_dx_px, "←", "→")}, ${direction(point.loo_dy_px, "↑", "↓")}`;
}

function ghostConfidence(point, confidence) {
  const status = confidence?.find((item) => item.point_index === point.point_index)?.status;
  return status === "high" ? "Độ tin cậy gợi ý: cao"
    : status === "inconsistent" ? "Gợi ý không đồng nhất — kiểm tra bằng loupe" : null;
}

function recommendationForPair(recommendations, pair) {
  return recommendations?.find((item) => item.pair_index === pair.pair_index) || { recommendation: "check_both", recommended_point_index: null };
}

function renderMidpointDiagnostics(container, diagnostics, pointDiagnostics, recommendations, kind, points, ghostLooConfidence = null) {
  if (!diagnostics) {
    container.textContent = "Chưa khớp";
    return;
  }
  const names = midpointPairNames(kind);
  const namesByPosition = pointNames(kind);
  const pointsByIndex = new Map((pointDiagnostics?.points || []).map((point) => [point.point_index, point]));
  const worstPair = diagnostics.pairs.reduce((worst, pair) => !worst || pair.distance_px > worst.distance_px ? pair : worst, null);
  const fragment = document.createDocumentFragment();
  diagnostics.pairs.forEach((pair, index) => {
    const block = document.createElement("section");
    const isWorst = pair.pair_index === worstPair.pair_index && worstPair.distance_px > 0.05;
    block.className = `midpoint-pair midpoint-pair--${pair.severity}${isWorst ? " midpoint-pair--worst" : ""}`;
    const heading = document.createElement("strong");
    heading.textContent = `Cặp ${pair.pair_index} — ${names[index]}`;
    const deviation = document.createElement("span");
    deviation.textContent = `Lệch: ${pair.distance_px.toFixed(1)} px${isWorst ? " — LỆCH LỚN NHẤT" : ""}`;
    const guidance = document.createElement("span");
    guidance.textContent = `Hướng chỉnh trung điểm: ${midpointDirection(pair)}`;
    block.append(heading, deviation, guidance);
    const recommendation = recommendationForPair(recommendations, pair);
    [pair.first_point_index, pair.second_point_index].forEach((pointIndex) => {
      const point = pointsByIndex.get(pointIndex);
      if (!point) return;
      const pointBlock = document.createElement("button");
      const pointName = namesByPosition[point.clock_position_index];
      const recommended = recommendation.recommended_point_index === pointIndex;
      pointBlock.type = "button";
      pointBlock.className = `loo-point${recommended ? " loo-point--recommended" : ""}`;
      pointBlock.textContent = `${pointName} · Sai số độc lập: ${point.loo_residual_px.toFixed(1)} px · Gợi ý chỉnh: ${correctionDirection(point)} · Δ tổng: ${point.loo_distance_px.toFixed(1)} px`;
      pointBlock.addEventListener("click", () => { state.diagnosticFocus = { kind, pointIndex }; render(); });
      block.append(pointBlock);
      const confidence = kind === "target" ? ghostConfidence(point, ghostLooConfidence) : null;
      if (confidence) {
        const confidenceNode = document.createElement("span");
        confidenceNode.className = "loo-confidence";
        confidenceNode.textContent = confidence;
        block.append(confidenceNode);
      }
    });
    const advice = document.createElement("span");
    advice.className = "loo-advice";
    if (recommendation.recommendation === "check_point") {
      const point = pointsByIndex.get(recommendation.recommended_point_index);
      advice.textContent = `⚠ Nên kiểm tra điểm ${namesByPosition[point.clock_position_index]} trước`;
    } else if (recommendation.recommendation === "check_other_pairs") {
      advice.textContent = "Cặp này lệch so với tâm hiện tại nhưng cả hai điểm riêng lẻ đều ổn. Hãy kiểm tra cặp khác đang kéo tâm ellipse.";
    } else {
      advice.textContent = "Cả hai điểm cần kiểm tra";
    }
    block.append(advice);
    fragment.append(block);
  });
  const summary = document.createElement("p");
  summary.className = "midpoint-summary";
  summary.textContent = `RMS: ${diagnostics.midpoint_rms_px.toFixed(2)} px · Max: ${diagnostics.midpoint_max_px.toFixed(2)} px`;
  fragment.append(summary);
  container.replaceChildren(fragment);
}

function diagonalCorrections(points) {
  if (points.length !== 8) return [];
  const ghosts = guides.diagonalGhosts(points.slice(0, 4));
  return ghosts.map((ghost, index) => {
    const pointIndex = index + 4, point = points[pointIndex];
    const dx_px = ghost.x_px - point.x_px, dy_px = ghost.y_px - point.y_px;
    return { point_index: pointIndex, point, ghost, dx_px, dy_px, distance_px: Math.hypot(dx_px, dy_px) };
  });
}

function drawArrow(start, end, color, width = 2, alpha = 0.8) {
  const from = transforms.imageToDisplay(start, state.view), to = transforms.imageToDisplay(end, state.view);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  context.save(); context.globalAlpha = alpha; context.strokeStyle = color; context.fillStyle = color; context.lineWidth = width;
  context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
  context.beginPath(); context.moveTo(to.x, to.y); context.lineTo(to.x - 7 * Math.cos(angle - Math.PI / 6), to.y - 7 * Math.sin(angle - Math.PI / 6)); context.lineTo(to.x - 7 * Math.cos(angle + Math.PI / 6), to.y - 7 * Math.sin(angle + Math.PI / 6)); context.closePath(); context.fill(); context.restore();
}

function drawDirectionalGuidance(points, diagnostics, includeDiagonalGuides = true) {
  diagnostics?.pairs?.filter((pair) => pair.severity !== "normal").forEach((pair) => {
    const midpoint = {x_px: pair.midpoint_x_px, y_px: pair.midpoint_y_px};
    drawArrow(midpoint, {x_px: midpoint.x_px + pair.dx_px, y_px: midpoint.y_px + pair.dy_px}, pair.severity === "strong_warning" ? "#ff4242" : "#ffd43b", 2.5);
  });
  if (includeDiagonalGuides) diagonalCorrections(points).filter((item) => item.distance_px > 1).forEach((item) => {
    drawArrow(item.point, item.ghost, item.distance_px > 2.5 ? "#ff4242" : "#ffd43b", 1.5, 0.6);
  });
}

function renderTargetBoundaryDiagnostics(container, pointDiagnostics) {
  const points = pointDiagnostics?.points || [];
  if (!points.length) { container.textContent = "Chưa khớp"; return; }
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("p");
  heading.textContent = "QA viền ellipse: chỉ kiểm tra từng điểm trên viền in; không quyết định tâm bia.";
  fragment.append(heading);
  points.forEach((point) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "loo-point";
    item.textContent = `Điểm ${point.point_index + 1} · Sai số độc lập: ${point.loo_residual_px.toFixed(1)} px · Nên kiểm tra lại điểm này trên viền.`;
    item.addEventListener("click", () => { state.diagnosticFocus = { kind: "target", pointIndex: point.point_index }; render(); });
    fragment.append(item);
  });
  container.replaceChildren(fragment);
}

function drawCardinalProjectiveDiagnostic() {
  const diagnostic = state.cardinalProjectiveCenter;
  if (!diagnostic?.available) return;
  const drawDiameter = (diameter) => {
    const first = transforms.imageToDisplay(diameter.first, state.view);
    const second = transforms.imageToDisplay(diameter.second, state.view);
    context.beginPath(); context.moveTo(first.x, first.y); context.lineTo(second.x, second.y); context.stroke();
  };
  context.save();
  context.strokeStyle = "#43e0bf";
  context.lineWidth = 1;
  context.globalAlpha = 0.55;
  context.setLineDash([3, 5]);
  drawDiameter(diagnostic.vertical_diameter);
  drawDiameter(diagnostic.horizontal_diameter);
  const center = transforms.imageToDisplay(
    { x: diagnostic.cardinal_center_x_px, y: diagnostic.cardinal_center_y_px }, state.view,
  );
  context.globalAlpha = 1;
  context.setLineDash([]);
  context.fillStyle = "#ff4242";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(center.x, center.y - 7); context.lineTo(center.x + 7, center.y);
  context.lineTo(center.x, center.y + 7); context.lineTo(center.x - 7, center.y);
  context.closePath(); context.fill(); context.stroke();
  context.restore();
}

function directionalMessageAt(imagePoint) {
  for (const correction of diagonalCorrections(state.holeBoundaryPoints)) {
    if (correction.distance_px > 1 && Math.hypot(imagePoint.x - correction.point.x_px, imagePoint.y - correction.point.y_px) <= 12 / state.view.scale) {
      const horizontal = correction.dx_px < -0.05 ? `← ${Math.abs(correction.dx_px).toFixed(1)} px` : correction.dx_px > 0.05 ? `→ ${Math.abs(correction.dx_px).toFixed(1)} px` : "ngang 0 px";
      const vertical = correction.dy_px < -0.05 ? `↑ ${Math.abs(correction.dy_px).toFixed(1)} px` : correction.dy_px > 0.05 ? `↓ ${Math.abs(correction.dy_px).toFixed(1)} px` : "dọc 0 px";
      return `Điểm này lệch ${correction.distance_px.toFixed(1)} px. Gợi ý: kéo ${horizontal}, ${vertical}.`;
    }
  }
  return null;
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
  drawCardinalProjectiveDiagnostic();
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
    context.restore();
  }
  if (state.ellipseFit) {
    const ellipse = state.ellipseFit;
    const center = transforms.imageToDisplay({ x: ellipse.center_x_px, y: ellipse.center_y_px }, state.view);
    context.save(); context.translate(center.x, center.y); context.rotate((ellipse.rotation_deg * Math.PI) / 180);
    context.strokeStyle = "#62d8ff"; context.lineWidth = 2; context.setLineDash([7, 4]); context.beginPath();
    context.ellipse(0, 0, ellipse.radius_major_px * state.view.scale, ellipse.radius_minor_px * state.view.scale, 0, 0, Math.PI * 2); context.stroke(); context.restore();
  }
  const holeResiduals = guides.pointResiduals(state.holeBoundaryPoints, state.holeEllipseFit);
  for (const [index, point] of state.holeBoundaryPoints.entries()) {
    const display = transforms.imageToDisplay({ x: point.x_px, y: point.y_px }, state.view);
    context.save(); context.fillStyle = "#ff7a45"; context.strokeStyle = residualColor(holeResiduals, index) || "#23150f"; context.lineWidth = 2;
    context.beginPath(); context.arc(display.x, display.y, 5, 0, Math.PI * 2); context.fill(); context.stroke();
    if (index < 4) {
      context.fillStyle = "#ffffff"; context.font = "12px sans-serif";
      context.fillText(["12h", "3h", "6h", "9h"][index], display.x + 7, display.y - 7);
    }
    context.restore();
  }
  if (state.holeEllipseFit) {
    const ellipse = state.holeEllipseFit;
    const center = transforms.imageToDisplay({ x: ellipse.center_x_px, y: ellipse.center_y_px }, state.view);
    context.save(); context.translate(center.x, center.y); context.rotate((ellipse.rotation_deg * Math.PI) / 180);
    context.strokeStyle = "#74e86f"; context.lineWidth = 2; context.setLineDash([5, 3]); context.beginPath();
    context.ellipse(0, 0, ellipse.radius_major_px * state.view.scale, ellipse.radius_minor_px * state.view.scale, 0, 0, Math.PI * 2); context.stroke(); context.setLineDash([]); context.restore();
  }
  if (state.holeCardinalCenter?.available) {
    const display = transforms.imageToDisplay(
      {x: state.holeCardinalCenter.cardinal_center_x_px, y: state.holeCardinalCenter.cardinal_center_y_px}, state.view,
    );
    context.save();
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#00ff4c";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(display.x, display.y - 9); context.lineTo(display.x + 9, display.y);
    context.lineTo(display.x, display.y + 9); context.lineTo(display.x - 9, display.y);
    context.closePath(); context.fill(); context.stroke();
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

function renderScoreDetails() {
  if (!state.derivedResult) {
    derivationDetails.textContent = "Chưa tính";
    return;
  }
  const result = state.derivedResult;
  const score = document.createElement("strong");
  score.className = "score-value";
  score.textContent = result.provisional_score.toFixed(1);
  const provisional = document.createElement("span");
  provisional.className = "score-caption";
  provisional.textContent = "Tạm tính";
  const target = document.createElement("p");
  target.className = "score-center";
  target.innerHTML = `Tâm bia:<br><span>${result.target_center_x_px.toFixed(2)}, ${result.target_center_y_px.toFixed(2)} px</span>`;
  const hole = document.createElement("p");
  hole.className = "score-center";
  hole.innerHTML = `Tâm lỗ:<br><span>${result.hole_center_x_px.toFixed(2)}, ${result.hole_center_y_px.toFixed(2)} px</span>`;
  derivationDetails.replaceChildren(score, provisional, target, hole);
}

function updateControls() {
  const ready = state.verifiedAndDecoded;
  for (const control of Object.values(controls)) control.disabled = !ready;
  controls.undo.disabled = !ready || state.calibrationPoints.length === 0;
  controls.clear.disabled = !ready || state.calibrationPoints.length === 0;
  controls.fitEllipse.disabled = !ready || state.calibrationPoints.length !== 8;
  controls.acceptTargetGhosts.disabled = !ready || state.calibrationPoints.length !== 4;
  controls.redo.disabled = !ready || state.calibrationPoints.length === 0;
  const cardinalReady = state.cardinalProjectiveCenter?.available === true;
  const holeCenterReady = ready && cardinalReady && state.ellipseFit !== null;
  controls.holeBoundary.disabled = !holeCenterReady;
  controls.undoHole.disabled = !holeCenterReady || state.holeBoundaryPoints.length === 0;
  controls.clearHole.disabled = !holeCenterReady || state.holeBoundaryPoints.length === 0;
  controls.fitHole.disabled = !holeCenterReady || state.holeBoundaryPoints.length !== 8;
  controls.acceptHoleGhosts.disabled = !holeCenterReady || state.holeBoundaryPoints.length !== 4;
  const holeCardinalReady = state.holeCardinalCenter?.available === true;
  controls.derive.disabled = !holeCenterReady || !holeCardinalReady || !state.holeEllipseFit || !state.sourceId;
  controls.save.disabled = !state.holeEllipseFit || !cardinalReady || !holeCardinalReady || !labelerId.value.trim() || !targetLabelQuality.value || !holeLabelQuality.value || state.savedAnnotation !== null;
  controls.loupe.disabled = !ready || !pixelModeIsActive();
  controls.calibration.setAttribute("aria-pressed", String(state.mode === "calibration"));
  controls.holeBoundary.setAttribute("aria-pressed", String(state.mode === "hole_boundary"));
  controls.loupe.setAttribute("aria-pressed", String(state.loupeEnabled && pixelModeIsActive()));
  calibrationStatus.textContent = ready
    ? `${state.calibrationPoints.length} / 8 điểm · 12h ✓  3h ✓  6h ✓  9h ✓`
    : "Chưa kích hoạt: cần ảnh JPG đã xác minh";
  const cardinal = state.cardinalProjectiveCenter;
  centerComparison.textContent = state.calibrationPoints.length < 4 ? "Chưa xác định"
    : !cardinal?.available ? "Không thể xác định tâm bia tin cậy. Hãy kiểm tra lại 4 điểm 12h / 3h / 6h / 9h."
      : `Tâm bia chính thức · Phương pháp: giao 12h–6h × 9h–3h · X: ${cardinal.cardinal_center_x_px.toFixed(2)} px · Y: ${cardinal.cardinal_center_y_px.toFixed(2)} px`;
  const holeCardinal = state.holeCardinalCenter;
  holeCenterStatus.textContent = !holeCenterReady
    ? "Vui lòng xác nhận hiệu chuẩn trước khi đánh dấu mép lỗ đạn."
    : state.holeBoundaryPoints.length < 4
      ? `${state.holeBoundaryPoints.length} / 8 điểm mép lỗ đạn · cần 12h, 3h, 6h, 9h trước`
      : !holeCardinal?.available
        ? "Không thể xác định tâm lỗ đạn tin cậy. Hãy kiểm tra lại 4 điểm 12h / 3h / 6h / 9h."
        : `Tâm lỗ đạn · Phương pháp: giao 12h–6h × 9h–3h · X: ${holeCardinal.cardinal_center_x_px.toFixed(2)} px · Y: ${holeCardinal.cardinal_center_y_px.toFixed(2)} px`;
  renderScoreDetails();
  zoomStatus.textContent = ready ? `${Math.round(state.view.scale * 100)}%` : "—";
  pixelModeStatus.textContent = !ready ? "—" : pixelModeIsActive()
    ? "Bật tự động — hiển thị pixel gốc" : "Tắt — sẽ tự bật từ 100%";
  canvas.style.cursor = state.panStart ? "grabbing" : (state.mode === "pan" || state.spacePanActive)
    ? "grab" : (state.mode === "calibration" || state.mode === "hole_boundary") ? "crosshair" : "default";
}

async function saveAnnotation() {
  if (!state.holeEllipseFit || !state.cardinalProjectiveCenter?.available || !state.holeCardinalCenter?.available || !labelerId.value.trim() || state.savedAnnotation) return;
  if (!window.confirm(`Lưu lượt chấm ${annotationPass.value} cho ${state.sourceId}, người chấm ${labelerId.value.trim()}?`)) return;
  const requestToken = state.sourceRequestToken;
  const sourceId = state.sourceId;
  saveStatus.textContent = "Đang lưu lượt chấm…";
  const response = await fetch("/api/annotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_id: sourceId, annotation_pass: annotationPass.value, labeler_id: labelerId.value.trim(), calibration_points: state.calibrationPoints, hole_boundary_points: state.holeBoundaryPoints, target_label_quality: targetLabelQuality.value, hole_label_quality: holeLabelQuality.value, target_center_method: "cardinal_diameter_intersection_v1", hole_center_method: "cardinal_diameter_intersection_v1", notes: "" }) });
  const payload = await response.json();
  if (!isCurrentSourceRequest(requestToken) || state.sourceId !== sourceId) return;
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
    const text = document.createElement("span");
    text.textContent = `${item.source_id} · Pass ${item.annotation_pass} · ${item.labeler_id} · ${item.saved_at || ""}`;
    const open = document.createElement("button");
    open.type = "button"; open.textContent = "Mở lại";
    open.addEventListener("click", () => { reloadSavedAnnotation(item.annotation_id).catch(() => { saveStatus.textContent = "Không thể mở lại annotation đã lưu."; }); });
    row.append(text, open);
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
  state.targetEditRevision += 1;
  invalidateFit();
  updateControls();
  render();
}

function addHoleBoundaryPoint(imagePoint) {
  if (!imagePoint || !Number.isFinite(imagePoint.x) || !Number.isFinite(imagePoint.y)
    || imagePoint.x < 0 || imagePoint.y < 0) return;
  if (state.holeBoundaryPoints.length >= 8) { holeCenterStatus.textContent = "Đã đủ 8 điểm mép lỗ đạn; không thể thêm điểm thứ 9."; return; }
  const roles = ["hole_12h", "hole_3h", "hole_6h", "hole_9h"];
  const semantic_role = roles[state.holeBoundaryPoints.length];
  state.holeBoundaryPoints.push({ x_px: imagePoint.x, y_px: imagePoint.y, ...(semantic_role ? { semantic_role } : {}) });
  state.holeEditRevision += 1;
  state.holeEllipseFit = null; state.holeStability = null; state.holeMidpoints = null; state.holeLeaveOneOut = null; state.holePairRecommendations = null; state.holeFitState = "not_fitted"; state.holeCenter = null;
  updateSnapPreviews("hole");
  if (state.holeBoundaryPoints.length === 4) determineHoleCenter();
  invalidateDerived();
  updateControls();
  render();
}

async function fitHoleEllipse() {
  if (state.holeBoundaryPoints.length !== 8) return;
  const requestToken = state.sourceRequestToken;
  const revision = state.holeEditRevision;
  state.holeFitState = "fitting"; state.holeEllipseFit = null; state.holeMidpoints = null; state.holeLeaveOneOut = null; state.holePairRecommendations = null; state.holeCenter = null; invalidateDerived(); updateControls();
  try {
    const response = await fetch("/api/hole-ellipse/fit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: state.holeBoundaryPoints }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.detail?.status || "invalid_hole_boundary_points");
    if (!isCurrentSourceRequest(requestToken) || revision !== state.holeEditRevision) return;
    state.holeEllipseFit = payload.ellipse; state.holeStability = payload.stability; state.holeMidpoints = payload.midpoint_diagnostics; state.holeLeaveOneOut = payload.leave_one_out_diagnostics; state.holePairRecommendations = payload.pair_point_recommendations; state.holeFitState = "fitted";
  } catch (error) { if (!isCurrentSourceRequest(requestToken) || revision !== state.holeEditRevision) return; state.holeFitState = "needs_redo"; holeCenterStatus.textContent = displayStatus(error.message); }
  updateControls(); render();
}

async function determineHoleCenter() {
  if (state.holeBoundaryPoints.length < 4) return;
  const requestToken = state.sourceRequestToken;
  const revision = state.holeEditRevision;
  const response = await fetch("/api/hole-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: state.holeBoundaryPoints.slice(0, 4) }) });
  const payload = await response.json();
  if (!isCurrentSourceRequest(requestToken) || revision !== state.holeEditRevision) return;
  state.holeCardinalCenter = response.ok ? payload.hole_cardinal_center : { available: false, reason: payload.detail?.status };
  updateControls(); render();
}

async function fitEllipse() {
  if (state.calibrationPoints.length !== 8) return;
  const requestToken = state.sourceRequestToken;
  const revision = state.targetEditRevision;
  const response = await fetch("/api/calibration/fit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: state.calibrationPoints }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail?.status || "ellipse_fit_failed");
  if (!isCurrentSourceRequest(requestToken) || revision !== state.targetEditRevision) return;
  state.ellipseFit = payload.ellipse;
  updateControls(); render();
}

async function deriveScore() {
  if (!state.sourceId || !state.ellipseFit || !state.holeEllipseFit) return;
  const requestToken = state.sourceRequestToken;
  const sourceId = state.sourceId;
  const targetRevision = state.targetEditRevision;
  const holeRevision = state.holeEditRevision;
  const response = await fetch("/api/derive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_id: sourceId, calibration_points: state.calibrationPoints, hole_boundary_points: state.holeBoundaryPoints }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail?.status || "provisional_derivation_failed");
  if (!isCurrentSourceRequest(requestToken) || state.sourceId !== sourceId || targetRevision !== state.targetEditRevision || holeRevision !== state.holeEditRevision) return;
  state.derivedResult = payload.result; updateControls(); render();
}

function scheduleLiveRefit(kind) {
  if (state.refitTimer) window.clearTimeout(state.refitTimer);
  state.refitTimer = window.setTimeout(() => {
    state.refitTimer = null;
    if (kind === "target") determineTargetCenter();
    else { fitHolePreview(); determineHoleCenter(); }
  }, 80);
}

async function determineTargetCenter() {
  if (state.calibrationPoints.length < 4) return;
  const requestToken = state.sourceRequestToken;
  const revision = state.targetEditRevision;
  try {
    const response = await fetch("/api/target-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: state.calibrationPoints.slice(0, 4) }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.status || "invalid_cardinal_target_geometry");
    if (!isCurrentSourceRequest(requestToken) || revision !== state.targetEditRevision) return;
    state.cardinalProjectiveCenter = payload.cardinal_projective_center;
  } catch (error) {
    if (!isCurrentSourceRequest(requestToken) || revision !== state.targetEditRevision) return;
    state.cardinalProjectiveCenter = { available: false, reason: error.message };
  }
  updateControls(); render();
}

async function fitHolePreview() {
  if (state.holeBoundaryPoints.length !== 8) return;
  const requestToken = state.sourceRequestToken;
  const revision = state.holeEditRevision;
  try {
    const response = await fetch("/api/hole-ellipse/fit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: state.holeBoundaryPoints }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.status || "invalid_hole_boundary_points");
    if (!isCurrentSourceRequest(requestToken) || revision !== state.holeEditRevision) return;
    state.holeEllipseFit = payload.ellipse; state.holeStability = payload.stability; state.holeMidpoints = payload.midpoint_diagnostics; state.holeLeaveOneOut = payload.leave_one_out_diagnostics; state.holePairRecommendations = payload.pair_point_recommendations; state.holeFitState = "fitted";
  } catch (error) {
    if (!isCurrentSourceRequest(requestToken) || revision !== state.holeEditRevision) return;
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
    state.cardinalProjectiveCenter = null; state.savedAnnotation = invalidated.savedAnnotation; invalidateDerived();
  } else {
    const invalidated = guides.invalidatedGeometryState("hole");
    state.holeFitState = invalidated.holeFitState; state.holeEllipseFit = null; state.holeMidpoints = null; state.holeLeaveOneOut = null; state.holePairRecommendations = null; state.holeCenter = null; state.holeCardinalCenter = null; state.savedAnnotation = invalidated.savedAnnotation; invalidateDerived();
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
    if (state.holeBoundaryPoints.length >= 4) updateSnapPreviews("hole");
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
    state.ellipseFit = null;
  } else if (kind === "hole") {
    state.holeBoundaryPoints = [...points, ...finalPoints.map((point) => ({x_px: point.x_px, y_px: point.y_px}))];
    state.holeSnapPreviews = [];
    state.holeEditRevision += 1;
    state.holeEllipseFit = null; state.holeStability = null; state.holeMidpoints = null; state.holeLeaveOneOut = null; state.holePairRecommendations = null; state.holeFitState = "not_fitted";
    invalidateDerived();
  }
  updateControls();
  render();
}

function redoCalibration() {
  if (state.calibrationPoints.length === 0) return;
  if (window.confirm("Bạn có muốn thực hiện lại phần hiệu chuẩn không? Các điểm tạm thời và elip đã khớp sẽ bị hủy.")) {
    clearTransientPoints();
    updateControls();
  }
}

async function restoreAnnotationGeometry(annotation, requestToken) {
  if (!isCurrentSourceRequest(requestToken)) return;
  state.calibrationPoints = annotation.calibration_points;
  state.holeBoundaryPoints = annotation.hole_boundary_points;
  state.targetEditRevision += 1; state.holeEditRevision += 1;
  annotationPass.value = annotation.annotation_pass;
  labelerId.value = annotation.labeler_id;
  targetLabelQuality.value = annotation.target_label_quality;
  holeLabelQuality.value = annotation.hole_label_quality;
  state.savedAnnotation = annotation.annotation_id;
  await Promise.all([determineTargetCenter(), determineHoleCenter(), fitEllipse(), fitHoleEllipse()]);
  if (!isCurrentSourceRequest(requestToken)) return;
  saveStatus.textContent = `Đã mở annotation: ${annotation.annotation_id}`;
  updateControls(); render();
}

async function reloadSavedAnnotation(annotationId) {
  const requestToken = state.sourceRequestToken;
  const response = await fetch(`/api/annotations/${encodeURIComponent(annotationId)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail?.status || "annotation_not_found");
  if (requestToken && !isCurrentSourceRequest(requestToken)) return;
  sourceIdInput.value = payload.annotation.source_id;
  await loadSource(payload.annotation);
}

async function loadSource(restoredAnnotation = null) {
  const sourceId = restoredAnnotation?.source_id || sourceIdInput.value.trim();
  if (!sourceId) {
    identityStatus.textContent = "Nhập mã ảnh";
    return;
  }

  if ((state.calibrationPoints.length > 0 || state.holeBoundaryPoints.length > 0) && sourceId !== state.sourceId
    && !window.confirm("Bạn có muốn chuyển sang ảnh khác? Các thao tác chưa lưu trên ảnh hiện tại sẽ bị hủy.")) return;
  const requestToken = sourceSessions.begin(sourceId);
  state.sourceRequestToken = requestToken;
  resetImage("Đang kiểm tra trạng thái xác minh ảnh…");
  try {
    const response = await fetch(`/api/sources/${encodeURIComponent(sourceId)}`);
    const payload = await response.json();
    if (!isCurrentSourceRequest(requestToken)) return;
    if (!response.ok) throw new Error(payload.detail?.status || "source_not_found");

    sourceIdStatus.textContent = payload.source.source_id;
    identityStatus.textContent = displayStatus(payload.identity.status);
    if (payload.identity.status !== "verified") {
      resetImage(`Không thể mở ảnh: ${displayStatus(payload.identity.status)}`);
      return;
    }

    const verifiedImage = new Image();
    verifiedImage.onload = async () => {
      if (!isCurrentSourceRequest(requestToken)) return;
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
      if (restoredAnnotation) await restoreAnnotationGeometry(restoredAnnotation, requestToken);
    };
    verifiedImage.onerror = () => {
      if (!isCurrentSourceRequest(requestToken)) return;
      identityStatus.textContent = displayStatus("verified_image_load_failed");
      resetImage("Không thể giải mã ảnh đã xác minh");
    };
    verifiedImage.src = `/api/sources/${encodeURIComponent(sourceId)}/image`;
  } catch (error) {
    if (!isCurrentSourceRequest(requestToken)) return;
    identityStatus.textContent = displayStatus(error.message);
    resetImage("Không thể mở ảnh");
  }
}

loadSourceButton.addEventListener("click", () => { loadSource(); });
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
  state.targetEditRevision += 1;
  invalidateFit();
  updateControls();
  render();
});
controls.clear.addEventListener("click", () => {
  if (state.calibrationPoints.length > 0 && window.confirm("Bạn có muốn bỏ các điểm hiệu chuẩn hiện tại không?")) clearTransientPoints();
});
controls.fitEllipse.addEventListener("click", () => { fitEllipse().catch(() => {}); });
controls.acceptTargetGhosts.addEventListener("click", () => acceptGhosts("target"));
controls.redo.addEventListener("click", redoCalibration);
controls.holeBoundary.addEventListener("click", () => {
  state.mode = state.mode === "hole_boundary" ? "none" : "hole_boundary";
  updateControls();
});
controls.undoHole.addEventListener("click", () => {
  state.holeBoundaryPoints.pop(); state.holeEditRevision += 1; state.holeEllipseFit = null; state.holeFitState = "not_fitted"; state.holeCenter = null; invalidateDerived();
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
controls.derive.addEventListener("click", () => { deriveScore().catch(() => {}); });
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
    ? directionalMessageAt(state.pointerImage) || `X ${state.pointerImage.x.toFixed(2)} px · Y ${state.pointerImage.y.toFixed(2)} px`
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
      calibrationStatus.textContent = "Đã đủ 8 điểm hiệu chuẩn";
      return;
    }
    const cardinalRoles = ["12h", "3h", "6h", "9h"];
    const semantic_role = cardinalRoles[state.calibrationPoints.length];
    state.calibrationPoints.push({ x_px: imagePoint.x, y_px: imagePoint.y, ...(semantic_role ? { semantic_role } : {}) });
    invalidateFit();
    state.targetEditRevision += 1;
    if (state.calibrationPoints.length === 4) { updateSnapPreviews("target"); determineTargetCenter(); }
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
});
