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
  draggingPoint: null,
  pointerImage: null,
  panning: false,
  lastPointer: null,
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
};

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
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

function fitImageToViewport() {
  if (!state.image) {
    draw();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const padding = 40;
  const scaleX = (rect.width - padding * 2) / state.image.width;
  const scaleY = (rect.height - padding * 2) / state.image.height;
  state.transform.scale = Math.min(scaleX, scaleY, 1);
  state.transform.offsetX = (rect.width - state.image.width * state.transform.scale) / 2;
  state.transform.offsetY = (rect.height - state.image.height * state.transform.scale) / 2;
  updateZoomInfo();
  draw();
}

function updateZoomInfo() {
  zoomInfoText.textContent = `Zoom: ${(state.transform.scale * 100).toFixed(0)}%`;
}

function zoomAtViewportCenter(factor) {
  if (!state.image) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const imageX = (centerX - state.transform.offsetX) / state.transform.scale;
  const imageY = (centerY - state.transform.offsetY) / state.transform.scale;
  const nextScale = Math.min(Math.max(state.transform.scale * factor, 0.08), 12);

  state.transform.scale = nextScale;
  state.transform.offsetX = centerX - imageX * state.transform.scale;
  state.transform.offsetY = centerY - imageY * state.transform.scale;
  updateZoomInfo();
  draw();
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
    instructionText.textContent = "Mode lihat aktif. Klik gambar tidak akan membuat titik baru.";
    draw();
    return;
  }

  instructionText.textContent = `Klik untuk menandai ${getEndpointMeta(toolId).label}.`;
  draw();
}

function imagePointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return {
    x: (x - state.transform.offsetX) / state.transform.scale,
    y: (y - state.transform.offsetY) / state.transform.scale,
  };
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

function getPointAtCanvasPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const mouse = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  const radius = 12;

  for (const pointKey of Object.keys(state.points)) {
    const point = state.points[pointKey];
    if (!point) {
      continue;
    }

    const canvasPoint = canvasPointFromImage(point);
    const distance = Math.hypot(mouse.x - canvasPoint.x, mouse.y - canvasPoint.y);
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
  if (!state.settings.showGuideLines) {
    return;
  }

  if (!point || !pairPoint) {
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
  if (!state.settings.showGuideLines) {
    return;
  }

  if (state.activeTool === "rulerEnd" && state.points.rulerStart && state.pointerImage && !state.points.rulerEnd) {
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

  if (state.activeTool !== "birdEnd" || !state.points.birdStart || !state.pointerImage || state.points.birdEnd) {
    return;
  }

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

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!state.image) {
    ctx.save();
    ctx.fillStyle = "rgba(46, 36, 25, 0.6)";
    ctx.font = "600 20px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Load image untuk mulai anotasi", rect.width / 2, rect.height / 2);
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

canvas.addEventListener("pointerdown", (event) => {
  if (!state.image) {
    return;
  }

  if (event.ctrlKey) {
    state.panning = true;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = "grabbing";
    return;
  }

  const hitPoint = getPointAtCanvasPosition(event);
  if (hitPoint) {
    state.draggingPoint = hitPoint;
    canvas.style.cursor = "grabbing";
    return;
  }

  if (event.button === 0 && state.activeTool) {
    setPoint(state.activeTool, imagePointFromEvent(event));
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.image) {
    return;
  }

  state.pointerImage = clampPoint(imagePointFromEvent(event));

  if (state.draggingPoint) {
    state.points[state.draggingPoint] = state.pointerImage;
    updateStatus();
    draw();
    return;
  }

  if (state.panning && state.lastPointer) {
    const deltaX = event.clientX - state.lastPointer.x;
    const deltaY = event.clientY - state.lastPointer.y;
  state.transform.offsetX += deltaX;
  state.transform.offsetY += deltaY;
  state.lastPointer = { x: event.clientX, y: event.clientY };
  updateZoomInfo();
  draw();
  return;
}

  const hitPoint = getPointAtCanvasPosition(event);
  state.hoveredPoint = hitPoint;
  canvas.style.cursor = hitPoint ? "grab" : "crosshair";
});

canvas.addEventListener("pointerup", () => {
  state.draggingPoint = null;
  state.panning = false;
  state.lastPointer = null;
  canvas.style.cursor = state.hoveredPoint ? "grab" : "crosshair";
});

canvas.addEventListener("pointerleave", () => {
  state.draggingPoint = null;
  state.pointerImage = null;
  state.panning = false;
  state.lastPointer = null;
  canvas.style.cursor = "crosshair";
});

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

fitViewButton.addEventListener("click", fitImageToViewport);
zoomInButton.addEventListener("click", () => zoomAtViewportCenter(1.15));
zoomOutButton.addEventListener("click", () => zoomAtViewportCenter(1 / 1.15));
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
updateZoomInfo();
loadImage("burung-h.jpeg");
