const canvas = document.getElementById("annotationCanvas");
const ctx = canvas.getContext("2d");

const imageLoader = document.getElementById("imageLoader");
const loadSampleButton = document.getElementById("loadSampleButton");
const referenceValueInput = document.getElementById("referenceValue");
const instructionText = document.getElementById("instructionText");
const statusText = document.getElementById("statusText");
const rulerDistanceText = document.getElementById("rulerDistanceText");
const birdDistanceText = document.getElementById("birdDistanceText");
const measurementText = document.getElementById("measurementText");
const zoomInfoText = document.getElementById("zoomInfoText");
const previewModeBadge = document.getElementById("previewModeBadge");
const zoomInButton = document.getElementById("zoomInButton");
const zoomOutButton = document.getElementById("zoomOutButton");
const fitViewButton = document.getElementById("fitViewButton");
const resetBirdButton = document.getElementById("resetBirdButton");
const resetRulerButton = document.getElementById("resetRulerButton");
const resetAllButton = document.getElementById("resetAllButton");
const noneToolButton = document.getElementById("tool-none");
const togglePointLabels = document.getElementById("togglePointLabels");
const toggleDistanceLabels = document.getElementById("toggleDistanceLabels");
const toggleGuideLines = document.getElementById("toggleGuideLines");

const MIN_SCALE = 0.08;
const MAX_SCALE = 12;
const DRAG_THRESHOLD = 6;
const PAN_MARGIN = 80;

const tools = [
  {
    id: "rulerStart",
    label: "titik 0 penggaris",
    button: document.getElementById("tool-ruler-start"),
  },
  {
    id: "rulerEnd",
    label: "titik akhir penggaris",
    button: document.getElementById("tool-ruler-end"),
  },
  {
    id: "birdStart",
    label: "awal panjang burung",
    button: document.getElementById("tool-bird-start"),
  },
  {
    id: "birdEnd",
    label: "akhir panjang burung",
    button: document.getElementById("tool-bird-end"),
  },
];

const state = {
  image: null,
  points: {
    rulerStart: null,
    rulerEnd: null,
    birdStart: null,
    birdEnd: null,
  },
  activeTool: "rulerStart",
  hoveredPoint: null,
  pointerImage: null,
  transform: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  },
  settings: {
    showPointLabels: true,
    showDistanceLabels: true,
    showGuideLines: true,
  },
  activePointers: new Map(),
  interaction: {
    kind: null,
    pointerId: null,
    pointKey: null,
    startClientX: 0,
    startClientY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    moved: false,
    startImagePoint: null,
    pinch: null,
  },
};

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  constrainTransform();
  updateZoomInfo();
  draw();
}

function loadImage(src) {
  const image = new Image();
  image.onload = () => {
    state.image = image;
    fitImageToViewport();
    updateStatus();
  };
  image.onerror = () => {
    state.image = null;
    updateStatus("Gagal memuat gambar");
    draw();
  };
  image.src = src;
}

function getViewportSize() {
  const rect = canvas.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function fitImageToViewport() {
  if (!state.image) {
    draw();
    return;
  }

  const viewport = getViewportSize();
  const padding = 40;
  const scaleX = (viewport.width - padding * 2) / state.image.width;
  const scaleY = (viewport.height - padding * 2) / state.image.height;
  state.transform.scale = clampScale(Math.min(scaleX, scaleY, 1));
  state.transform.offsetX = (viewport.width - state.image.width * state.transform.scale) / 2;
  state.transform.offsetY = (viewport.height - state.image.height * state.transform.scale) / 2;
  constrainTransform();
  updateZoomInfo();
  draw();
}

function clampScale(scale) {
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

function constrainTransform() {
  if (!state.image) {
    return;
  }

  const viewport = getViewportSize();
  const scaledWidth = state.image.width * state.transform.scale;
  const scaledHeight = state.image.height * state.transform.scale;

  if (scaledWidth <= viewport.width) {
    state.transform.offsetX = (viewport.width - scaledWidth) / 2;
  } else {
    const minX = viewport.width - scaledWidth - PAN_MARGIN;
    const maxX = PAN_MARGIN;
    state.transform.offsetX = Math.min(maxX, Math.max(minX, state.transform.offsetX));
  }

  if (scaledHeight <= viewport.height) {
    state.transform.offsetY = (viewport.height - scaledHeight) / 2;
  } else {
    const minY = viewport.height - scaledHeight - PAN_MARGIN;
    const maxY = PAN_MARGIN;
    state.transform.offsetY = Math.min(maxY, Math.max(minY, state.transform.offsetY));
  }
}

function updateZoomInfo() {
  zoomInfoText.textContent = `Zoom: ${(state.transform.scale * 100).toFixed(0)}%`;
}

function updatePreviewBadge() {
  if (state.activeTool === null) {
    previewModeBadge.textContent = "Mode lihat: drag untuk pan, scroll untuk zoom";
    return;
  }

  previewModeBadge.textContent = `${getEndpointMeta(state.activeTool).label}: klik untuk tandai, Ctrl + drag untuk pan`;
}

function getEndpointMeta(pointKey) {
  if (pointKey === "rulerStart") {
    return { label: "Titik 0", color: "#0f766e" };
  }
  if (pointKey === "rulerEnd") {
    return { label: "Titik 10", color: "#1d4ed8" };
  }
  if (pointKey === "birdStart") {
    return { label: "Awal burung", color: "#ea580c" };
  }
  if (pointKey === "birdEnd") {
    return { label: "Akhir burung", color: "#b42318" };
  }
  return { label: pointKey, color: "#2e2419" };
}

function setActiveTool(toolId) {
  state.activeTool = toolId;
  tools.forEach((tool) => {
    tool.button.classList.toggle("active", tool.id === toolId);
  });
  noneToolButton.classList.toggle("active", toolId === null);

  if (toolId === null) {
    instructionText.textContent = "Mode lihat aktif. Drag untuk pan, scroll atau pinch untuk zoom.";
  } else {
    instructionText.textContent = `Klik atau tap untuk menandai ${getEndpointMeta(toolId).label}.`;
  }

  updatePreviewBadge();
  updateCanvasCursor();
  draw();
}

function canvasPointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function imagePointFromClient(clientX, clientY) {
  const canvasPoint = canvasPointFromClient(clientX, clientY);
  return {
    x: (canvasPoint.x - state.transform.offsetX) / state.transform.scale,
    y: (canvasPoint.y - state.transform.offsetY) / state.transform.scale,
  };
}

function imagePointFromEvent(event) {
  return imagePointFromClient(event.clientX, event.clientY);
}

function canvasPointFromImage(point) {
  return {
    x: point.x * state.transform.scale + state.transform.offsetX,
    y: point.y * state.transform.scale + state.transform.offsetY,
  };
}

function clampPoint(point) {
  if (!state.image) {
    return point;
  }

  return {
    x: Math.min(Math.max(point.x, 0), state.image.width),
    y: Math.min(Math.max(point.y, 0), state.image.height),
  };
}

function getPointAtCanvasPosition(clientX, clientY) {
  const canvasPoint = canvasPointFromClient(clientX, clientY);
  const radius = 12;

  for (const pointKey of Object.keys(state.points)) {
    const point = state.points[pointKey];
    if (!point) {
      continue;
    }

    const pointCanvas = canvasPointFromImage(point);
    const distance = Math.hypot(canvasPoint.x - pointCanvas.x, canvasPoint.y - pointCanvas.y);
    if (distance <= radius) {
      return pointKey;
    }
  }

  return null;
}

function moveToNextTool(toolId) {
  const currentIndex = tools.findIndex((tool) => tool.id === toolId);
  if (currentIndex >= 0 && currentIndex < tools.length - 1) {
    setActiveTool(tools[currentIndex + 1].id);
  }
}

function setPoint(toolId, point) {
  state.points[toolId] = clampPoint(point);
  moveToNextTool(toolId);
  updateStatus();
  draw();
}

function distanceBetween(pointA, pointB) {
  if (!pointA || !pointB) {
    return null;
  }
  return Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
}

function getMeasurement() {
  const rulerDistance = distanceBetween(state.points.rulerStart, state.points.rulerEnd);
  const birdDistance = distanceBetween(state.points.birdStart, state.points.birdEnd);
  const referenceValue = Number(referenceValueInput.value);

  if (!rulerDistance || !birdDistance || !referenceValue || referenceValue <= 0) {
    return {
      rulerDistance,
      birdDistance,
      measurement: null,
    };
  }

  return {
    rulerDistance,
    birdDistance,
    measurement: (birdDistance / rulerDistance) * referenceValue,
  };
}

function updateStatus(customStatus) {
  const measurement = getMeasurement();
  const placed = Object.values(state.points).filter(Boolean).length;

  if (customStatus) {
    statusText.textContent = customStatus;
  } else if (!state.image) {
    statusText.textContent = "Menunggu gambar";
  } else if (measurement.measurement) {
    statusText.textContent = "Pengukuran siap";
  } else {
    statusText.textContent = `${placed}/4 titik sudah ditandai`;
  }

  rulerDistanceText.textContent = measurement.rulerDistance
    ? `${measurement.rulerDistance.toFixed(2)} px`
    : "-";
  birdDistanceText.textContent = measurement.birdDistance
    ? `${measurement.birdDistance.toFixed(2)} px`
    : "-";
  measurementText.textContent = measurement.measurement
    ? `${measurement.measurement.toFixed(2)} cm`
    : "-";
}

function drawLabel(pointKey, point) {
  if (!state.settings.showPointLabels) {
    return;
  }

  const meta = getEndpointMeta(pointKey);
  const canvasPoint = canvasPointFromImage(point);

  ctx.save();
  ctx.fillStyle = meta.color;
  ctx.beginPath();
  ctx.arc(canvasPoint.x, canvasPoint.y, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 250, 243, 0.95)";
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = 2;
  ctx.font = "12px Segoe UI";
  const labelWidth = ctx.measureText(meta.label).width + 18;
  const labelX = canvasPoint.x + 12;
  const labelY = canvasPoint.y - 28;
  ctx.beginPath();
  ctx.roundRect(labelX, labelY, labelWidth, 28, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#2e2419";
  ctx.fillText(meta.label, labelX + 9, labelY + 18);
  ctx.restore();
}

function drawSegment(startKey, endKey, color, label) {
  const start = state.points[startKey];
  const end = state.points[endKey];
  if (!start || !end) {
    return;
  }

  const pointA = canvasPointFromImage(start);
  const pointB = canvasPointFromImage(end);
  const midX = (pointA.x + pointB.x) / 2;
  const midY = (pointA.y + pointB.y) / 2;
  const distance = distanceBetween(start, end);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pointA.x, pointA.y);
  ctx.lineTo(pointB.x, pointB.y);
  ctx.stroke();

  if (state.settings.showDistanceLabels) {
    const text = `${label}: ${distance.toFixed(1)} px`;
    ctx.font = "bold 12px Segoe UI";
    const width = ctx.measureText(text).width + 20;
    ctx.fillStyle = "rgba(255, 250, 243, 0.94)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(midX - width / 2, midY - 16, width, 30, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2e2419";
    ctx.fillText(text, midX - width / 2 + 10, midY + 4);
  }
  ctx.restore();

  if (state.settings.showGuideLines) {
    drawPerpendicularCaps(start, end, color);
  }
}

function drawPerpendicularCaps(pointA, pointB, color) {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  const length = Math.hypot(dx, dy);
  if (!length) {
    return;
  }

  const unitPerpX = -dy / length;
  const unitPerpY = dx / length;
  const capLength = Math.max(20, Math.min(state.image.width * 0.12, length * 0.28));

  drawCap(pointA, unitPerpX, unitPerpY, capLength, color);
  drawCap(pointB, unitPerpX, unitPerpY, capLength, color);
}

function drawCap(centerPoint, unitPerpX, unitPerpY, capLength, color) {
  const half = capLength / 2;
  const fromPoint = {
    x: centerPoint.x - unitPerpX * half,
    y: centerPoint.y - unitPerpY * half,
  };
  const toPoint = {
    x: centerPoint.x + unitPerpX * half,
    y: centerPoint.y + unitPerpY * half,
  };
  const fromCanvas = canvasPointFromImage(fromPoint);
  const toCanvas = canvasPointFromImage(toPoint);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fromCanvas.x, fromCanvas.y);
  ctx.lineTo(toCanvas.x, toCanvas.y);
  ctx.stroke();
  ctx.restore();
}

function drawPerpendicularGuideFromPoints(point, pairPoint, color) {
  if (!state.settings.showGuideLines || !point || !pairPoint) {
    return;
  }

  const dx = pairPoint.x - point.x;
  const dy = pairPoint.y - point.y;
  const length = Math.hypot(dx, dy);
  if (!length) {
    return;
  }

  const unitPerpX = -dy / length;
  const unitPerpY = dx / length;
  const guideHalfLength = Math.max(state.image.width * 0.18, length * 0.55);
  const fromPoint = {
    x: point.x - unitPerpX * guideHalfLength,
    y: point.y - unitPerpY * guideHalfLength,
  };
  const toPoint = {
    x: point.x + unitPerpX * guideHalfLength,
    y: point.y + unitPerpY * guideHalfLength,
  };
  const fromCanvas = canvasPointFromImage(fromPoint);
  const toCanvas = canvasPointFromImage(toPoint);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.moveTo(fromCanvas.x, fromCanvas.y);
  ctx.lineTo(toCanvas.x, toCanvas.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawActiveGuide() {
  if (!state.settings.showGuideLines || !state.pointerImage) {
    return;
  }

  if (state.activeTool === "rulerEnd" && state.points.rulerStart && !state.points.rulerEnd) {
    drawPerpendicularGuideFromPoints(
      state.points.rulerStart,
      state.pointerImage,
      "rgba(15, 118, 110, 0.85)"
    );
    const startCanvas = canvasPointFromImage(state.points.rulerStart);
    ctx.save();
    ctx.fillStyle = "rgba(15, 118, 110, 0.9)";
    ctx.font = "bold 12px Segoe UI";
    ctx.fillText("Tempatkan titik akhir di sisi garis bantu ini", startCanvas.x + 12, startCanvas.y - 12);
    ctx.restore();
    return;
  }

  if (state.activeTool === "birdEnd" && state.points.birdStart && !state.points.birdEnd) {
    drawPerpendicularGuideFromPoints(
      state.points.birdStart,
      state.pointerImage,
      "rgba(234, 88, 12, 0.85)"
    );
    const startCanvas = canvasPointFromImage(state.points.birdStart);
    ctx.save();
    ctx.fillStyle = "rgba(234, 88, 12, 0.9)";
    ctx.font = "bold 12px Segoe UI";
    ctx.fillText("Tempatkan titik akhir di sisi garis bantu ini", startCanvas.x + 12, startCanvas.y - 12);
    ctx.restore();
  }
}

function draw() {
  const viewport = getViewportSize();
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  if (!state.image) {
    ctx.save();
    ctx.fillStyle = "rgba(46, 36, 25, 0.6)";
    ctx.font = "600 20px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Load image untuk mulai anotasi", viewport.width / 2, viewport.height / 2);
    ctx.restore();
    return;
  }

  ctx.drawImage(
    state.image,
    state.transform.offsetX,
    state.transform.offsetY,
    state.image.width * state.transform.scale,
    state.image.height * state.transform.scale
  );

  drawSegment("rulerStart", "rulerEnd", "#0f766e", "Ruler");
  drawSegment("birdStart", "birdEnd", "#ea580c", "Burung");
  drawActiveGuide();

  for (const [pointKey, point] of Object.entries(state.points)) {
    if (point) {
      drawLabel(pointKey, point);
    }
  }
}

function resetBird() {
  state.points.birdStart = null;
  state.points.birdEnd = null;
  setActiveTool("birdStart");
  updateStatus();
  draw();
}

function resetRuler() {
  state.points.rulerStart = null;
  state.points.rulerEnd = null;
  setActiveTool("rulerStart");
  updateStatus();
  draw();
}

function resetAll() {
  state.points = {
    rulerStart: null,
    rulerEnd: null,
    birdStart: null,
    birdEnd: null,
  };
  setActiveTool("rulerStart");
  updateStatus();
  draw();
}

function startPan(pointerId, clientX, clientY) {
  state.interaction.kind = "pan";
  state.interaction.pointerId = pointerId;
  state.interaction.startClientX = clientX;
  state.interaction.startClientY = clientY;
  state.interaction.startOffsetX = state.transform.offsetX;
  state.interaction.startOffsetY = state.transform.offsetY;
  state.interaction.moved = false;
  previewModeBadge.textContent = "Sedang pan...";
  updateCanvasCursor();
}

function startPointDrag(pointerId, pointKey) {
  state.interaction.kind = "drag-point";
  state.interaction.pointerId = pointerId;
  state.interaction.pointKey = pointKey;
  previewModeBadge.textContent = `${getEndpointMeta(pointKey).label}: drag untuk koreksi`;
  updateCanvasCursor();
}

function startPlacement(pointerId, clientX, clientY) {
  state.interaction.kind = "place-point";
  state.interaction.pointerId = pointerId;
  state.interaction.startClientX = clientX;
  state.interaction.startClientY = clientY;
  state.interaction.startImagePoint = clampPoint(imagePointFromClient(clientX, clientY));
  state.interaction.moved = false;
  previewModeBadge.textContent = `${getEndpointMeta(state.activeTool).label}: lepas untuk simpan titik`;
}

function startPinchGesture() {
  const touchPointers = [...state.activePointers.values()].filter((pointer) => pointer.pointerType === "touch");
  if (touchPointers.length < 2) {
    return;
  }

  const [first, second] = touchPointers;
  const midpointX = (first.clientX + second.clientX) / 2;
  const midpointY = (first.clientY + second.clientY) / 2;
  const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  const focusImage = clampPoint(imagePointFromClient(midpointX, midpointY));

  state.interaction.kind = "pinch";
  state.interaction.pointerId = null;
  state.interaction.pointKey = null;
  state.interaction.pinch = {
    startDistance: Math.max(distance, 1),
    startScale: state.transform.scale,
    focusImage,
  };
  previewModeBadge.textContent = "Pinch zoom aktif";
  updateCanvasCursor();
}

function clearInteraction() {
  state.interaction.kind = null;
  state.interaction.pointerId = null;
  state.interaction.pointKey = null;
  state.interaction.startClientX = 0;
  state.interaction.startClientY = 0;
  state.interaction.startOffsetX = 0;
  state.interaction.startOffsetY = 0;
  state.interaction.startImagePoint = null;
  state.interaction.moved = false;
  state.interaction.pinch = null;
  updatePreviewBadge();
  updateCanvasCursor();
}

function updateCanvasCursor() {
  if (state.interaction.kind === "pan" || state.interaction.kind === "drag-point" || state.interaction.kind === "pinch") {
    canvas.style.cursor = "grabbing";
    return;
  }

  if (state.activeTool === null) {
    canvas.style.cursor = "grab";
    return;
  }

  canvas.style.cursor = state.hoveredPoint ? "grab" : "crosshair";
}

function zoomAtCanvasPoint(factor, canvasX, canvasY) {
  if (!state.image) {
    return;
  }

  const imageX = (canvasX - state.transform.offsetX) / state.transform.scale;
  const imageY = (canvasY - state.transform.offsetY) / state.transform.scale;
  const nextScale = clampScale(state.transform.scale * factor);

  state.transform.scale = nextScale;
  state.transform.offsetX = canvasX - imageX * state.transform.scale;
  state.transform.offsetY = canvasY - imageY * state.transform.scale;
  constrainTransform();
  updateZoomInfo();
  draw();
}

function zoomAtViewportCenter(factor) {
  const viewport = getViewportSize();
  zoomAtCanvasPoint(factor, viewport.width / 2, viewport.height / 2);
}

function handlePointerDown(event) {
  if (!state.image) {
    return;
  }

  canvas.setPointerCapture(event.pointerId);
  state.activePointers.set(event.pointerId, {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientX: event.clientX,
    clientY: event.clientY,
  });

  state.pointerImage = clampPoint(imagePointFromEvent(event));
  state.hoveredPoint = getPointAtCanvasPosition(event.clientX, event.clientY);

  const touchPointers = [...state.activePointers.values()].filter((pointer) => pointer.pointerType === "touch");
  if (touchPointers.length >= 2) {
    startPinchGesture();
    draw();
    return;
  }

  const hitPoint = getPointAtCanvasPosition(event.clientX, event.clientY);
  if (hitPoint) {
    startPointDrag(event.pointerId, hitPoint);
    return;
  }

  const shouldPan = state.activeTool === null || event.ctrlKey;
  if (shouldPan) {
    startPan(event.pointerId, event.clientX, event.clientY);
    return;
  }

  if (event.button === 0 || event.pointerType === "touch") {
    startPlacement(event.pointerId, event.clientX, event.clientY);
  }
}

function handlePointerMove(event) {
  if (!state.image) {
    return;
  }

  const trackedPointer = state.activePointers.get(event.pointerId);
  if (trackedPointer) {
    trackedPointer.clientX = event.clientX;
    trackedPointer.clientY = event.clientY;
  }

  state.pointerImage = clampPoint(imagePointFromEvent(event));

  if (state.interaction.kind === "pinch") {
    const touchPointers = [...state.activePointers.values()].filter((pointer) => pointer.pointerType === "touch");
    if (touchPointers.length >= 2) {
      const [first, second] = touchPointers;
      const midpoint = {
        x: (first.clientX + second.clientX) / 2,
        y: (first.clientY + second.clientY) / 2,
      };
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      const nextScale = clampScale(
        state.interaction.pinch.startScale * (Math.max(distance, 1) / state.interaction.pinch.startDistance)
      );
      const canvasMidpoint = canvasPointFromClient(midpoint.x, midpoint.y);

      state.transform.scale = nextScale;
      state.transform.offsetX = canvasMidpoint.x - state.interaction.pinch.focusImage.x * state.transform.scale;
      state.transform.offsetY = canvasMidpoint.y - state.interaction.pinch.focusImage.y * state.transform.scale;
      constrainTransform();
      updateZoomInfo();
      draw();
    }
    return;
  }

  if (state.interaction.kind === "drag-point" && state.interaction.pointerId === event.pointerId) {
    state.points[state.interaction.pointKey] = state.pointerImage;
    updateStatus();
    draw();
    return;
  }

  if (state.interaction.kind === "pan" && state.interaction.pointerId === event.pointerId) {
    const deltaX = event.clientX - state.interaction.startClientX;
    const deltaY = event.clientY - state.interaction.startClientY;
    state.transform.offsetX = state.interaction.startOffsetX + deltaX;
    state.transform.offsetY = state.interaction.startOffsetY + deltaY;
    state.interaction.moved = Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD;
    constrainTransform();
    updateZoomInfo();
    draw();
    return;
  }

  if (state.interaction.kind === "place-point" && state.interaction.pointerId === event.pointerId) {
    const movedDistance = Math.hypot(
      event.clientX - state.interaction.startClientX,
      event.clientY - state.interaction.startClientY
    );
    state.interaction.moved = movedDistance > DRAG_THRESHOLD;
    if (state.interaction.moved) {
      previewModeBadge.textContent = "Gerakan terdeteksi: titik tidak akan dibuat sampai klik singkat";
    }
    draw();
    return;
  }

  state.hoveredPoint = getPointAtCanvasPosition(event.clientX, event.clientY);
  updateCanvasCursor();
  draw();
}

function handlePointerUp(event) {
  if (state.interaction.kind === "place-point" && state.interaction.pointerId === event.pointerId) {
    if (!state.interaction.moved && state.activeTool !== null) {
      setPoint(state.activeTool, state.interaction.startImagePoint);
    }
    clearInteraction();
  } else if (state.interaction.kind === "drag-point" && state.interaction.pointerId === event.pointerId) {
    updateStatus();
    clearInteraction();
    draw();
  } else if (state.interaction.kind === "pan" && state.interaction.pointerId === event.pointerId) {
    clearInteraction();
    draw();
  } else if (state.interaction.kind === "pinch") {
    clearInteraction();
    draw();
  }

  state.activePointers.delete(event.pointerId);

  const touchPointers = [...state.activePointers.values()].filter((pointer) => pointer.pointerType === "touch");
  if (touchPointers.length >= 2) {
    startPinchGesture();
  }

  state.hoveredPoint = null;
  updateCanvasCursor();
}

function handlePointerCancel(event) {
  state.activePointers.delete(event.pointerId);
  clearInteraction();
  updateCanvasCursor();
  draw();
}

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerCancel);
canvas.addEventListener("pointerleave", () => {
  state.pointerImage = null;
  if (!state.activePointers.size) {
    state.hoveredPoint = null;
  }
  updateCanvasCursor();
  draw();
});

canvas.addEventListener("wheel", (event) => {
  if (!state.image) {
    return;
  }

  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  const canvasPoint = canvasPointFromClient(event.clientX, event.clientY);
  zoomAtCanvasPoint(factor, canvasPoint.x, canvasPoint.y);
}, { passive: false });

imageLoader.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    resetAll();
    loadImage(reader.result);
  };
  reader.readAsDataURL(file);
});

loadSampleButton.addEventListener("click", () => {
  resetAll();
  loadImage("burung-h.jpeg");
});

referenceValueInput.addEventListener("input", () => {
  updateStatus();
  draw();
});

togglePointLabels.addEventListener("change", () => {
  state.settings.showPointLabels = togglePointLabels.checked;
  draw();
});

toggleDistanceLabels.addEventListener("change", () => {
  state.settings.showDistanceLabels = toggleDistanceLabels.checked;
  draw();
});

toggleGuideLines.addEventListener("change", () => {
  state.settings.showGuideLines = toggleGuideLines.checked;
  draw();
});

zoomInButton.addEventListener("click", () => zoomAtViewportCenter(1.15));
zoomOutButton.addEventListener("click", () => zoomAtViewportCenter(1 / 1.15));
fitViewButton.addEventListener("click", fitImageToViewport);
resetBirdButton.addEventListener("click", resetBird);
resetRulerButton.addEventListener("click", resetRuler);
resetAllButton.addEventListener("click", resetAll);

tools.forEach((tool) => {
  tool.button.addEventListener("click", () => setActiveTool(tool.id));
});
noneToolButton.addEventListener("click", () => setActiveTool(null));

window.addEventListener("resize", resizeCanvas);

setActiveTool("rulerStart");
resizeCanvas();
loadImage("burung-h.jpeg");
