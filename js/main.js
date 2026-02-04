/**
 * App state, event handlers, and animation loop.
 */

import { makeCanvasState, drawPolygon, drawRect, drawRemaining } from './canvas.js';
import { runCovering } from './covering.js';
import { hitTestPolygonEdge, pointInPolygon } from './drawing.js';
import {
  exportPolygonsJSON,
  exportRectanglesJSON,
  exportRectanglesAsCode,
  exportRectanglesSVG,
  exportAllJSON,
  importFromJSON,
} from './io.js';

const canvas = document.getElementById('c');
const wrap = document.getElementById('canvas-wrap');
const btnDraw = document.getElementById('btn-draw');
const btnClose = document.getElementById('btn-close');
const btnNew = document.getElementById('btn-new');
const btnRun = document.getElementById('btn-run');
const btnClear = document.getElementById('btn-clear');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const inputMinSize = document.getElementById('min-size');
const inputMaxK = document.getElementById('max-k');
const inputMinK = document.getElementById('min-k');
const squareCountEl = document.getElementById('square-count');

const canvasState = makeCanvasState(canvas);

const state = {
  polygons: [],
  currentPolygon: null,
  rectangles: [],
  remaining: [],
  coveringIteration: 0,
  drawMode: false,
  editMode: false,
  coveringRunning: false,
  spaceDown: false,
  selectedPolygonIndex: null,
  undoStack: [],
  redoStack: [],
};

const CLOSE_HIT_THRESHOLD = 12;

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    return Promise.resolve();
  } finally {
    document.body.removeChild(ta);
  }
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function applyImport(result) {
  if (result.polygons != null) {
    state.polygons = result.polygons;
    state.currentPolygon = null;
    state.editMode = false;
    state.selectedPolygonIndex = null;
    state.undoStack = [];
    state.redoStack = [];
  }
  if (result.rectangles != null) {
    state.rectangles = result.rectangles;
    state.remaining = [];
    state.coveringIteration = state.rectangles.length > 0 ? 1 : 0;
  }
  if (result.polygons == null && result.rectangles == null) {
    state.polygons = [];
    state.currentPolygon = null;
    state.rectangles = [];
    state.remaining = [];
    state.coveringIteration = 0;
    state.undoStack = [];
    state.redoStack = [];
  }
  draw();
  updateUndoRedoButtons();
  updateDeleteEditButtons();
  const np = result.polygons?.length ?? 0;
  const nr = result.rectangles?.length ?? 0;
  const parts = [];
  if (np > 0) parts.push(`${np} polygon${np === 1 ? '' : 's'}`);
  if (nr > 0) parts.push(`${nr} rectangle${nr === 1 ? '' : 's'}`);
  showToast(parts.length ? `Imported ${parts.join(', ')}` : 'Imported (empty)');
}

function updateSquareCount() {
  if (squareCountEl) {
    const sq = state.rectangles.length > 0 ? `Squares: ${state.rectangles.length}` : 'Squares: —';
    const iter = state.coveringRunning || state.rectangles.length > 0
      ? `Iterations: ${state.coveringIteration}`
      : 'Iterations: —';
    squareCountEl.textContent = `${sq}  ·  ${iter}`;
  }
}

function draw() {
  updateSquareCount();
  const ctx = canvasState.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.save();
  canvasState.applyTransform();
  ctx.fillStyle = '#0f0f1a';
  ctx.fillRect(-1e5, -1e5, 2e5, 2e5);

  if (state.remaining.length > 0) {
    drawRemaining(ctx, state.remaining);
  }

  for (const rect of state.rectangles) {
    drawRect(ctx, rect);
  }

  for (let i = 0; i < state.polygons.length; i++) {
    const points = state.polygons[i];
    const selected = i === state.selectedPolygonIndex;
    drawPolygon(ctx, points, {
      fill: selected ? 'rgba(78, 205, 196, 0.15)' : 'rgba(233, 69, 96, 0.08)',
      stroke: selected ? '#4ecdc4' : '#e94560',
      lineWidth: selected ? 3 : 2,
    });
  }

  if (state.currentPolygon && state.currentPolygon.length > 0) {
    drawPolygon(ctx, state.currentPolygon, { fill: null, stroke: '#e94560', lineWidth: 2 });
    const p = state.currentPolygon[state.currentPolygon.length - 1];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#e94560';
    ctx.fill();
  }

  ctx.restore();
}

function screenToWorld(clientX, clientY) {
  return canvasState.screenToWorld(clientX, clientY);
}

function addPoint(wx, wy) {
  if (!state.currentPolygon) state.currentPolygon = [];
  state.currentPolygon.push({ x: wx, y: wy });
  state.undoStack.push({ type: 'add_point', point: { x: wx, y: wy } });
  state.redoStack = [];
  draw();
  updateUndoRedoButtons();
}

function closePolygon() {
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    if (state.editMode) {
      state.polygons.push([...state.currentPolygon]);
      state.currentPolygon = null;
      state.editMode = false;
    } else {
      state.undoStack.push({ type: 'close_polygon' });
      state.redoStack = [];
      state.polygons.push([...state.currentPolygon]);
      state.currentPolygon = null;
    }
    draw();
    updateUndoRedoButtons();
    updateDeleteEditButtons();
  }
}

function newPolygon() {
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    state.polygons.push([...state.currentPolygon]);
  }
  state.currentPolygon = [];
  state.editMode = false;
  state.selectedPolygonIndex = null;
  state.undoStack = [];
  state.redoStack = [];
  draw();
  updateUndoRedoButtons();
  updateDeleteEditButtons();
}

function clearAll() {
  state.polygons = [];
  state.currentPolygon = null;
  state.editMode = false;
  state.selectedPolygonIndex = null;
  state.rectangles = [];
  state.remaining = [];
  state.coveringIteration = 0;
  state.coveringRunning = false;
  state.undoStack = [];
  state.redoStack = [];
  draw();
  updateUndoRedoButtons();
  updateDeleteEditButtons();
}

function deleteSelectedPolygon() {
  if (state.coveringRunning || state.selectedPolygonIndex == null) return;
  const index = state.selectedPolygonIndex;
  const points = state.polygons[index];
  state.undoStack.push({ type: 'delete_polygon', index, points: [...points] });
  state.redoStack = [];
  state.polygons.splice(index, 1);
  state.selectedPolygonIndex = null;
  draw();
  updateUndoRedoButtons();
  updateDeleteEditButtons();
}

function startEditPolygon() {
  if (state.coveringRunning || state.selectedPolygonIndex == null) return;
  const index = state.selectedPolygonIndex;
  state.currentPolygon = [...state.polygons[index].map((p) => ({ x: p.x, y: p.y }))];
  state.polygons.splice(index, 1);
  state.selectedPolygonIndex = null;
  state.editMode = true;
  state.drawMode = true;
  if (btnDraw) btnDraw.classList.add('active');
  draw();
  updateDeleteEditButtons();
}

function updateUndoRedoButtons() {
  if (btnUndo) btnUndo.disabled = state.undoStack.length === 0 || state.coveringRunning;
  if (btnRedo) btnRedo.disabled = state.redoStack.length === 0 || state.coveringRunning;
}

function updateDeleteEditButtons() {
  const btnDelete = document.getElementById('btn-delete');
  const btnEdit = document.getElementById('btn-edit');
  const disabled = state.coveringRunning || state.selectedPolygonIndex == null;
  if (btnDelete) btnDelete.disabled = disabled;
  if (btnEdit) btnEdit.disabled = disabled;
}

function undo() {
  if (state.undoStack.length === 0 || state.coveringRunning) return;
  const entry = state.undoStack.pop();
  state.redoStack.push(entry);
  if (entry.type === 'add_point') {
    if (state.currentPolygon && state.currentPolygon.length > 0) {
      state.currentPolygon.pop();
      if (state.currentPolygon.length === 0) state.currentPolygon = [];
    }
  } else if (entry.type === 'close_polygon') {
    if (state.polygons.length > 0) {
      state.currentPolygon = [...state.polygons.pop()];
    }
  } else if (entry.type === 'delete_polygon') {
    state.polygons.splice(entry.index, 0, entry.points);
    state.selectedPolygonIndex = entry.index;
  }
  draw();
  updateUndoRedoButtons();
  updateDeleteEditButtons();
}

function redo() {
  if (state.redoStack.length === 0 || state.coveringRunning) return;
  const entry = state.redoStack.pop();
  state.undoStack.push(entry);
  if (entry.type === 'add_point') {
    if (!state.currentPolygon) state.currentPolygon = [];
    state.currentPolygon.push(entry.point);
  } else if (entry.type === 'close_polygon') {
    if (state.currentPolygon && state.currentPolygon.length >= 3) {
      state.polygons.push([...state.currentPolygon]);
      state.currentPolygon = null;
    }
  } else if (entry.type === 'delete_polygon') {
    state.polygons.splice(entry.index, 1);
    state.selectedPolygonIndex = null;
  }
  draw();
  updateUndoRedoButtons();
  updateDeleteEditButtons();
}

function startCovering() {
  let closed = state.polygons.length > 0 ? [...state.polygons] : [];
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    closed = closed.concat([[...state.currentPolygon]]);
  }
  if (closed.length === 0) return;

  state.coveringRunning = true;
  state.rectangles = [];
  state.remaining = [];
  state.coveringIteration = 0;

  const minSize = Math.max(1, Math.min(500, parseInt(inputMinSize.value, 10) || 8));
  const maxK = inputMaxK ? Math.max(2, Math.min(1024, parseInt(inputMaxK.value, 10) || 8)) : 8;
  const minK = inputMinK ? Math.max(2, Math.min(1024, parseInt(inputMinK.value, 10) || 2)) : 2;

  const gen = runCovering(closed, { minSize, maxK, minK });
  const delay = 80;

  function step() {
    const { value, done } = gen.next();
    if (done || !state.coveringRunning) {
      state.coveringRunning = false;
      draw();
      updateDeleteEditButtons();
      return;
    }
    state.rectangles = value.rectangles;
    state.remaining = value.remaining;
    state.coveringIteration = value.iteration ?? state.coveringIteration;
    draw();
    setTimeout(step, delay);
  }
  step();
}

wrap.addEventListener('wheel', (e) => {
  if (canvasState.handleWheel(e)) e.preventDefault();
}, { passive: false });

function hitTestPolygons(wx, wy) {
  for (let i = state.polygons.length - 1; i >= 0; i--) {
    if (pointInPolygon(wx, wy, state.polygons[i])) return i;
  }
  return null;
}

wrap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const wx = screenToWorld(e.clientX, e.clientY);
  if (state.spaceDown) {
    canvasState.handlePointerDown(e.clientX, e.clientY);
    return;
  }
  if (state.drawMode && !state.coveringRunning) {
    if (state.currentPolygon && state.currentPolygon.length >= 2 && hitTestPolygonEdge(wx.x, wx.y, state.currentPolygon, CLOSE_HIT_THRESHOLD / canvasState.scale)) {
      closePolygon();
    } else {
      addPoint(wx.x, wx.y);
    }
    return;
  }
  if (!state.coveringRunning) {
    state.selectedPolygonIndex = hitTestPolygons(wx.x, wx.y);
    updateDeleteEditButtons();
    draw();
    return;
  }
  canvasState.handlePointerDown(e.clientX, e.clientY);
});

wrap.addEventListener('mousemove', (e) => {
  if (state.spaceDown) {
    canvasState.handlePointerMove(e.clientX, e.clientY);
    draw();
    return;
  }
  canvasState.handlePointerMove(e.clientX, e.clientY);
  draw();
});

wrap.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  canvasState.handlePointerUp();
});

wrap.addEventListener('mouseleave', () => {
  canvasState.handlePointerUp();
});

wrap.addEventListener('dblclick', (e) => {
  if (e.button !== 0) return;
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    e.preventDefault();
    closePolygon();
    return;
  }
  if (state.selectedPolygonIndex != null && !state.coveringRunning) {
    e.preventDefault();
    startEditPolygon();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    state.spaceDown = true;
    wrap.classList.add('pan');
    return;
  }
  if ((e.code === 'Delete' || e.code === 'Backspace') && !state.coveringRunning && state.selectedPolygonIndex != null) {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') {
      e.preventDefault();
      deleteSelectedPolygon();
    }
  }
  if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !state.coveringRunning) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    state.spaceDown = false;
    wrap.classList.remove('pan');
    canvasState.handlePointerUp();
  }
});

btnDraw.addEventListener('click', () => {
  state.drawMode = !state.drawMode;
  btnDraw.classList.toggle('active', state.drawMode);
  updateUndoRedoButtons();
});

btnClose.addEventListener('click', closePolygon);
btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);
btnNew.addEventListener('click', newPolygon);
const btnDelete = document.getElementById('btn-delete');
const btnEdit = document.getElementById('btn-edit');
if (btnDelete) btnDelete.addEventListener('click', deleteSelectedPolygon);
if (btnEdit) btnEdit.addEventListener('click', startEditPolygon);

btnRun.addEventListener('click', () => {
  if (state.coveringRunning) return;
  startCovering();
});

btnClear.addEventListener('click', clearAll);

// Export dropdown
const exportDropdown = document.getElementById('export-dropdown');
const btnExport = document.getElementById('btn-export');
if (btnExport && exportDropdown) {
  btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => exportDropdown?.classList.remove('open'));
}
function doExport(getContent, filename, mimeType, description) {
  const content = getContent();
  copyToClipboard(content).then(
    () => showToast(description ? `Copied ${description}` : 'Copied to clipboard'),
    () => {
      downloadFile(filename, content, mimeType);
      showToast('Downloaded ' + filename);
    }
  );
  if (exportDropdown) exportDropdown.classList.remove('open');
}

document.getElementById('export-polygons-json')?.addEventListener('click', () => {
  doExport(
    () => exportPolygonsJSON(state.polygons, state.currentPolygon),
    'polygons.json',
    'application/json',
    'polygons (JSON)'
  );
});
document.getElementById('export-rectangles-json')?.addEventListener('click', () => {
  doExport(
    () => exportRectanglesJSON(state.rectangles),
    'rectangles.json',
    'application/json',
    'rectangles (JSON)'
  );
});
document.getElementById('export-rectangles-code')?.addEventListener('click', () => {
  doExport(
    () => exportRectanglesAsCode(state.rectangles),
    'rectangles.json',
    'application/json',
    'rectangles (code)'
  );
});
document.getElementById('export-rectangles-svg')?.addEventListener('click', () => {
  const svg = exportRectanglesSVG(state.rectangles);
  downloadFile('rectangles.svg', svg, 'image/svg+xml');
  showToast('Downloaded rectangles.svg');
  if (exportDropdown) exportDropdown.classList.remove('open');
});
document.getElementById('export-all-json')?.addEventListener('click', () => {
  doExport(
    () => exportAllJSON(state),
    'session.json',
    'application/json',
    'session (polygons + rectangles)'
  );
});

// Import
const importFileInput = document.getElementById('import-file');
document.getElementById('btn-import')?.addEventListener('click', () => importFileInput?.click());
importFileInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const result = importFromJSON(reader.result);
      applyImport(result);
    } catch (err) {
      showToast('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

document.getElementById('btn-import-paste')?.addEventListener('click', async () => {
  try {
    const text = navigator.clipboard?.readText ? await navigator.clipboard.readText() : '';
    if (!text.trim()) {
      showToast('Clipboard empty or paste not allowed');
      return;
    }
    const result = importFromJSON(text);
    applyImport(result);
  } catch (err) {
    showToast('Import failed: ' + (err instanceof Error ? err.message : String(err)));
  }
});

window.addEventListener('resize', () => {
  canvasState.resize();
  draw();
});

canvasState.resize();
draw();
updateUndoRedoButtons();
updateDeleteEditButtons();
