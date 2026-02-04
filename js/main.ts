/**
 * App state, event handlers, and animation loop.
 */

import { makeCanvasState, drawPolygon, drawRect, drawRemaining } from './canvas.js';
import { runCovering, getUnionArea } from './covering.js';
import { hitTestPolygonEdge, pointInPolygon } from './drawing.js';
import {
  exportPolygonsJSON,
  exportRectanglesJSON,
  exportRectanglesAsCode,
  exportRectanglesSVG,
  exportAllJSON,
  importFromJSON,
} from './io.js';
import { PRESETS } from './presets.js';
import type { AppState, Point, Polygon, Rectangle, Bounds, ImportResult } from './types.js';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const wrap = document.getElementById('canvas-wrap') as HTMLElement;
const btnDraw = document.getElementById('btn-draw') as HTMLButtonElement | null;
const btnClose = document.getElementById('btn-close') as HTMLButtonElement | null;
const btnNew = document.getElementById('btn-new') as HTMLButtonElement | null;
const btnRun = document.getElementById('btn-run') as HTMLButtonElement | null;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement | null;
const btnResetZoom = document.getElementById('btn-reset-zoom') as HTMLButtonElement | null;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement | null;
const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement | null;
const inputMinSize = document.getElementById('min-size') as HTMLInputElement | null;
const inputSnapToGrid = document.getElementById('snap-to-grid') as HTMLInputElement | null;
const inputMaxK = document.getElementById('max-k') as HTMLInputElement | null;
const inputMinK = document.getElementById('min-k') as HTMLInputElement | null;
const inputSpeedPreset = document.getElementById('speed-preset') as HTMLSelectElement | null;
const inputInstantRun = document.getElementById('instant-run') as HTMLInputElement | null;
const squareCountEl = document.getElementById('square-count') as HTMLElement | null;
const statsAreaEl = document.getElementById('stats-area') as HTMLElement | null;

const canvasState = makeCanvasState(canvas);

const state: AppState = {
  polygons: [],
  currentPolygon: null,
  rectangles: [],
  remaining: [],
  coveringIteration: 0,
  drawMode: false,
  editMode: false,
  coveringRunning: false,
  coveringPaused: false,
  spaceDown: false,
  selectedPolygonIndex: null,
  undoStack: [],
  redoStack: [],
};

let coveringTimeoutId: ReturnType<typeof setTimeout> | null = null;
let coveringRafId: number | null = null;
let coveringStep: (() => void) | null = null;

const SPEED_PRESET_MS: Record<string, number> = { slow: 200, normal: 80, fast: 20 };
const STEP_DELAY_MIN = 5;
const STEP_DELAY_MAX = 500;

function getStepDelayMs(): number {
  const preset = inputSpeedPreset?.value || 'normal';
  const ms = SPEED_PRESET_MS[preset] ?? 80;
  return Math.max(STEP_DELAY_MIN, Math.min(STEP_DELAY_MAX, ms));
}

const CLOSE_HIT_THRESHOLD = 12;

function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout((showToast as unknown as { _tid?: ReturnType<typeof setTimeout> })._tid);
  (showToast as unknown as { _tid?: ReturnType<typeof setTimeout> })._tid = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function copyToClipboard(text: string): Promise<void> {
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

function downloadFile(filename: string, content: string, mimeType?: string): void {
  const blob = new Blob([content], { type: mimeType || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function transformPresetToView(polygons: Polygon[], scaleFactor = 3): Polygon[] {
  if (!polygons?.length) return polygons;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of polygons) {
    for (const p of ring) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const bboxCx = (minX + maxX) / 2;
  const bboxCy = (minY + maxY) / 2;
  const rect = canvas.getBoundingClientRect();
  const viewCenter = canvasState.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return polygons.map((ring) =>
    ring.map((p) => ({
      x: (p.x - bboxCx) * scaleFactor + viewCenter.x,
      y: (p.y - bboxCy) * scaleFactor + viewCenter.y,
    }))
  );
}

function applyImport(result: ImportResult, toastMessage: string | null = null): void {
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
  if (toastMessage != null) {
    showToast(toastMessage);
  } else {
    const np = result.polygons?.length ?? 0;
    const nr = result.rectangles?.length ?? 0;
    const parts: string[] = [];
    if (np > 0) parts.push(`${np} polygon${np === 1 ? '' : 's'}`);
    if (nr > 0) parts.push(`${nr} rectangle${nr === 1 ? '' : 's'}`);
    showToast(parts.length ? `Imported ${parts.join(', ')}` : 'Imported (empty)');
  }
}

function getCoveredArea(rectangles: Rectangle[]): number {
  return (rectangles || []).reduce((sum, r) => sum + (r.w ?? r.width ?? 0) * (r.h ?? r.height ?? 0), 0);
}

function getPolygonListForArea(): Polygon[] {
  let closed = state.polygons.length > 0 ? [...state.polygons] : [];
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    closed = closed.concat([[...state.currentPolygon]]);
  }
  return closed;
}

function getWorldBounds(): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasAny = false;
  for (const points of state.polygons) {
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      hasAny = true;
    }
  }
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    for (const p of state.currentPolygon) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      hasAny = true;
    }
  }
  for (const r of state.rectangles) {
    const x = r.x ?? 0, y = r.y ?? 0;
    const w = r.w ?? r.width ?? 0, h = r.h ?? r.height ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    hasAny = true;
  }
  if (!hasAny) return null;
  return { minX, minY, maxX, maxY };
}

function updateSquareCount(): void {
  if (squareCountEl) {
    const sq = state.rectangles.length > 0 ? `Squares: ${state.rectangles.length}` : 'Squares: —';
    const iter = state.coveringRunning || state.rectangles.length > 0
      ? `Iterations: ${state.coveringIteration}`
      : 'Iterations: —';
    squareCountEl.textContent = `${sq}  ·  ${iter}`;
  }
}

function updateStats(): void {
  if (!statsAreaEl) return;
  const polygonList = getPolygonListForArea();
  const polygonArea = polygonList.length > 0 ? getUnionArea(polygonList) : null;
  const coveredArea = state.rectangles.length > 0 ? getCoveredArea(state.rectangles) : null;
  const n = state.rectangles.length;
  const efficiency = n > 0 && polygonArea != null ? polygonArea / n : null;

  const coveragePct =
    polygonArea != null && polygonArea > 0 && coveredArea != null
      ? (coveredArea / polygonArea) * 100
      : null;
  const coverageStr =
    coveragePct != null ? `${coveragePct.toFixed(1)}% coverage` : 'Coverage: —';

  const paStr = polygonArea != null ? polygonArea.toFixed(1) + ' units²' : '—';
  const caStr = coveredArea != null ? coveredArea.toFixed(1) + ' units²' : '—';
  const effStr = efficiency != null ? efficiency.toFixed(1) + ' units²/square' : '—';
  statsAreaEl.textContent = `Polygon area: ${paStr}  ·  Covered area: ${caStr}  ·  Efficiency: ${effStr}  ·  ${coverageStr}`;
}

function draw(): void {
  updateSquareCount();
  updateStats();
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

function screenToWorld(clientX: number, clientY: number): Point {
  return canvasState.screenToWorld(clientX, clientY);
}

function snapToGrid(x: number, y: number, gridSize: number): Point {
  const step = Math.max(1, gridSize);
  return {
    x: Math.round(x / step) * step,
    y: Math.round(y / step) * step,
  };
}

function addPoint(wx: number, wy: number): void {
  if (inputSnapToGrid?.checked) {
    const minSize = Math.max(1, Math.min(500, parseInt(inputMinSize?.value ?? '8', 10) || 8));
    const snapped = snapToGrid(wx, wy, minSize);
    wx = snapped.x;
    wy = snapped.y;
  }
  if (!state.currentPolygon) state.currentPolygon = [];
  state.currentPolygon.push({ x: wx, y: wy });
  state.undoStack.push({ type: 'add_point', point: { x: wx, y: wy } });
  state.redoStack = [];
  draw();
  updateUndoRedoButtons();
}

function closePolygon(): void {
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

function newPolygon(): void {
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

function clearAll(): void {
  if (coveringTimeoutId != null) {
    clearTimeout(coveringTimeoutId);
    coveringTimeoutId = null;
  }
  if (coveringRafId != null) {
    cancelAnimationFrame(coveringRafId);
    coveringRafId = null;
  }
  coveringStep = null;
  state.polygons = [];
  state.currentPolygon = null;
  state.editMode = false;
  state.selectedPolygonIndex = null;
  state.rectangles = [];
  state.remaining = [];
  state.coveringIteration = 0;
  state.coveringRunning = false;
  state.coveringPaused = false;
  state.undoStack = [];
  state.redoStack = [];
  draw();
  updateRunButton();
  updateUndoRedoButtons();
  updateDeleteEditButtons();
}

function deleteSelectedPolygon(): void {
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

function startEditPolygon(): void {
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

function updateUndoRedoButtons(): void {
  if (btnUndo) btnUndo.disabled = state.undoStack.length === 0 || state.coveringRunning;
  if (btnRedo) btnRedo.disabled = state.redoStack.length === 0 || state.coveringRunning;
}

function updateDeleteEditButtons(): void {
  const btnDelete = document.getElementById('btn-delete') as HTMLButtonElement | null;
  const btnEdit = document.getElementById('btn-edit') as HTMLButtonElement | null;
  const disabled = state.coveringRunning || state.selectedPolygonIndex == null;
  if (btnDelete) btnDelete.disabled = disabled;
  if (btnEdit) btnEdit.disabled = disabled;
}

function undo(): void {
  if (state.undoStack.length === 0 || state.coveringRunning) return;
  const entry = state.undoStack.pop()!;
  state.redoStack.push(entry);
  if (entry.type === 'add_point') {
    if (state.currentPolygon && state.currentPolygon.length > 0) {
      state.currentPolygon.pop();
      if ((state.currentPolygon?.length ?? 0) === 0) state.currentPolygon = [];
    }
  } else if (entry.type === 'close_polygon') {
    if (state.polygons.length > 0) {
      state.currentPolygon = [...state.polygons.pop()!];
    }
  } else if (entry.type === 'delete_polygon') {
    state.polygons.splice(entry.index, 0, entry.points);
    state.selectedPolygonIndex = entry.index;
  }
  draw();
  updateUndoRedoButtons();
  updateDeleteEditButtons();
}

function redo(): void {
  if (state.redoStack.length === 0 || state.coveringRunning) return;
  const entry = state.redoStack.pop()!;
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

const RUN_ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  computing: '<svg viewBox="0 0 24 24" class="spin"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>',
};

function updateRunButton(): void {
  if (!btnRun) return;
  const iconSlot = btnRun.querySelector('svg');
  const instant = inputInstantRun?.checked ?? false;
  if (!state.coveringRunning) {
    if (iconSlot) iconSlot.outerHTML = RUN_ICONS.play;
    btnRun.title = 'Run covering (R)';
    btnRun.setAttribute('aria-label', 'Run covering');
    btnRun.disabled = false;
  } else if (instant) {
    if (iconSlot) iconSlot.outerHTML = RUN_ICONS.computing;
    btnRun.title = 'Computing…';
    btnRun.setAttribute('aria-label', 'Computing');
    btnRun.disabled = true;
  } else if (state.coveringPaused) {
    if (iconSlot) iconSlot.outerHTML = RUN_ICONS.play;
    btnRun.title = 'Resume (R)';
    btnRun.setAttribute('aria-label', 'Resume covering');
    btnRun.disabled = false;
  } else {
    if (iconSlot) iconSlot.outerHTML = RUN_ICONS.pause;
    btnRun.title = 'Pause (R)';
    btnRun.setAttribute('aria-label', 'Pause covering');
    btnRun.disabled = false;
  }
}

const INSTANT_STEPS_PER_FRAME = 100;

function startCovering(): void {
  let closed = state.polygons.length > 0 ? [...state.polygons] : [];
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    closed = closed.concat([[...state.currentPolygon]]);
  }
  if (closed.length === 0) return;

  state.coveringRunning = true;
  state.coveringPaused = false;
  state.rectangles = [];
  state.remaining = [];
  state.coveringIteration = 0;
  coveringTimeoutId = null;
  coveringRafId = null;
  coveringStep = null;

  const minSize = Math.max(1, Math.min(500, parseInt(inputMinSize?.value ?? '8', 10) || 8));
  const maxK = inputMaxK ? Math.max(2, Math.min(1024, parseInt(inputMaxK.value, 10) || 8)) : 8;
  const minK = inputMinK ? Math.max(2, Math.min(1024, parseInt(inputMinK.value, 10) || 2)) : 2;

  const gen = runCovering(closed, { minSize, maxK, minK });
  const instant = inputInstantRun?.checked ?? false;
  const delay = getStepDelayMs();

  function finish(): void {
    state.coveringRunning = false;
    state.coveringPaused = false;
    coveringTimeoutId = null;
    coveringRafId = null;
    coveringStep = null;
    draw();
    updateRunButton();
    updateUndoRedoButtons();
    updateDeleteEditButtons();
  }

  if (instant) {
    function runInstant(): void {
      if (!state.coveringRunning) {
        finish();
        return;
      }
      for (let i = 0; i < INSTANT_STEPS_PER_FRAME; i++) {
        const { value, done } = gen.next();
        if (done || !state.coveringRunning) {
          if (!done) break;
          finish();
          return;
        }
        state.rectangles = value.rectangles;
        state.remaining = value.remaining;
        state.coveringIteration = value.iteration ?? state.coveringIteration;
      }
      coveringRafId = requestAnimationFrame(runInstant);
    }
    updateRunButton();
    coveringRafId = requestAnimationFrame(runInstant);
    return;
  }

  function step(): void {
    if (state.coveringPaused) return;
    const { value, done } = gen.next();
    if (done || !state.coveringRunning) {
      finish();
      return;
    }
    state.rectangles = value.rectangles;
    state.remaining = value.remaining;
    state.coveringIteration = value.iteration ?? state.coveringIteration;
    draw();
    if (!state.coveringPaused) {
      coveringTimeoutId = setTimeout(step, delay);
    }
  }
  coveringStep = step;
  updateRunButton();
  step();
}

function pauseCovering(): void {
  if (!state.coveringRunning || state.coveringPaused) return;
  if (inputInstantRun?.checked) return;
  if (coveringTimeoutId != null) {
    clearTimeout(coveringTimeoutId);
    coveringTimeoutId = null;
  }
  state.coveringPaused = true;
  updateRunButton();
}

function resumeCovering(): void {
  if (!state.coveringRunning || !state.coveringPaused) return;
  state.coveringPaused = false;
  updateRunButton();
  if (coveringStep) coveringStep();
}

wrap.addEventListener('wheel', (e: WheelEvent) => {
  if (canvasState.handleWheel(e)) e.preventDefault();
}, { passive: false });

function hitTestPolygons(wx: number, wy: number): number | null {
  for (let i = state.polygons.length - 1; i >= 0; i--) {
    if (pointInPolygon(wx, wy, state.polygons[i])) return i;
  }
  return null;
}

wrap.addEventListener('mousedown', (e: MouseEvent) => {
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

wrap.addEventListener('mousemove', (e: MouseEvent) => {
  if (state.spaceDown) {
    canvasState.handlePointerMove(e.clientX, e.clientY);
    draw();
    return;
  }
  canvasState.handlePointerMove(e.clientX, e.clientY);
  draw();
});

wrap.addEventListener('mouseup', (e: MouseEvent) => {
  if (e.button !== 0) return;
  canvasState.handlePointerUp();
});

wrap.addEventListener('mouseleave', () => {
  canvasState.handlePointerUp();
});

wrap.addEventListener('dblclick', (e: MouseEvent) => {
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

function isFocusInInput(): boolean {
  const tag = document.activeElement?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    state.spaceDown = true;
    wrap.classList.add('pan');
    return;
  }

  if (isFocusInInput()) {
    if (e.code === 'KeyD' || e.code === 'KeyR' || e.code === 'KeyN' || e.code === 'Escape') return;
    if (e.code === 'Backspace' || e.code === 'Delete') return;
    if (e.key === 'z' && (e.metaKey || e.ctrlKey)) return;
  }

  const helpPanel = document.getElementById('help-panel');
  const helpOpen = helpPanel?.classList?.contains('open');

  if (e.code === 'Escape') {
    if (helpOpen) {
      e.preventDefault();
      helpPanel!.classList.remove('open');
      return;
    }
    if (state.drawMode && (state.currentPolygon?.length ?? 0) > 0) {
      e.preventDefault();
      state.currentPolygon = [];
      state.drawMode = false;
      state.editMode = false;
      if (btnDraw) btnDraw.classList.remove('active');
      state.undoStack = [];
      state.redoStack = [];
      draw();
      updateUndoRedoButtons();
      updateDeleteEditButtons();
      return;
    }
    return;
  }

  if (e.code === 'KeyD') {
    e.preventDefault();
    state.drawMode = !state.drawMode;
    btnDraw?.classList.toggle('active', state.drawMode);
    updateUndoRedoButtons();
    return;
  }
  if (e.code === 'KeyR') {
    e.preventDefault();
    if (!state.coveringRunning) startCovering();
    else if (state.coveringPaused) resumeCovering();
    else pauseCovering();
    return;
  }
  if (e.code === 'KeyN') {
    e.preventDefault();
    newPolygon();
    return;
  }
  if (e.code === 'Home') {
    e.preventDefault();
    resetZoomView();
    return;
  }

  if ((e.code === 'Delete' || e.code === 'Backspace') && !state.coveringRunning) {
    const lastUndo = state.undoStack[state.undoStack.length - 1];
    if (
      state.drawMode &&
      (state.currentPolygon?.length ?? 0) > 0 &&
      lastUndo?.type === 'add_point'
    ) {
      e.preventDefault();
      undo();
      return;
    }
    if (state.selectedPolygonIndex != null) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        deleteSelectedPolygon();
      }
    }
    return;
  }

  if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !state.coveringRunning) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }
});

document.addEventListener('keyup', (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    state.spaceDown = false;
    wrap.classList.remove('pan');
    canvasState.handlePointerUp();
  }
});

btnDraw?.addEventListener('click', () => {
  state.drawMode = !state.drawMode;
  btnDraw.classList.toggle('active', state.drawMode);
  updateUndoRedoButtons();
});
btnClose?.addEventListener('click', closePolygon);
btnUndo?.addEventListener('click', undo);
btnRedo?.addEventListener('click', redo);
btnNew?.addEventListener('click', newPolygon);
const btnDelete = document.getElementById('btn-delete') as HTMLButtonElement | null;
const btnEdit = document.getElementById('btn-edit') as HTMLButtonElement | null;
btnDelete?.addEventListener('click', deleteSelectedPolygon);
btnEdit?.addEventListener('click', startEditPolygon);

btnRun?.addEventListener('click', () => {
  if (!state.coveringRunning) {
    startCovering();
  } else if (state.coveringPaused) {
    resumeCovering();
  } else {
    pauseCovering();
  }
});

btnClear?.addEventListener('click', clearAll);

function resetZoomView(): void {
  const bounds = getWorldBounds();
  const wrapEl = document.getElementById('canvas-wrap');
  let viewport: { width: number; height: number; centerX: number; centerY: number } | undefined;
  if (wrapEl) {
    const rect = wrapEl.getBoundingClientRect();
    viewport = {
      width: rect.width,
      height: rect.height,
      centerX: rect.width / 2,
      centerY: rect.height / 2,
    };
  }
  canvasState.resetZoom(bounds, viewport);
  draw();
}

btnResetZoom?.addEventListener('click', resetZoomView);

const exportDropdown = document.getElementById('export-dropdown');
const btnExport = document.getElementById('btn-export');
if (btnExport && exportDropdown) {
  btnExport.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => exportDropdown?.classList.remove('open'));
}

const samplesDropdown = document.getElementById('samples-dropdown');
const btnSamples = document.getElementById('btn-samples');
const samplesMenu = document.getElementById('samples-menu');
if (btnSamples && samplesDropdown && samplesMenu) {
  for (const preset of PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = preset.name;
    btn.dataset.presetId = preset.id;
    samplesMenu.appendChild(btn);
  }
  btnSamples.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    samplesDropdown.classList.toggle('open');
  });
  samplesMenu.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('button[data-preset-id]');
    if (!btn) return;
    const preset = PRESETS.find((p) => p.id === (btn as HTMLButtonElement).dataset.presetId);
    if (preset) {
      const polygons = transformPresetToView(preset.polygons);
      applyImport({ polygons, rectangles: [] }, `Loaded: ${preset.name}`);
      samplesDropdown.classList.remove('open');
    }
  });
  document.addEventListener('click', () => samplesDropdown?.classList.remove('open'));
}

const btnHelp = document.getElementById('btn-help');
const helpPanelEl = document.getElementById('help-panel');
if (btnHelp && helpPanelEl) {
  btnHelp.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    helpPanelEl.classList.toggle('open');
  });
  helpPanelEl.addEventListener('click', (e: Event) => e.stopPropagation());
  document.addEventListener('click', () => helpPanelEl?.classList.remove('open'));
}

function doExport(getContent: () => string, filename: string, mimeType: string, description: string): void {
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

const importFileInput = document.getElementById('import-file') as HTMLInputElement | null;
document.getElementById('btn-import')?.addEventListener('click', () => importFileInput?.click());
importFileInput?.addEventListener('change', (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const result = importFromJSON(reader.result as string);
      applyImport(result);
    } catch (err) {
      showToast('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    }
    target.value = '';
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

const COVERING_PREFS_KEY = 'poly-covering-prefs';
function loadCoveringPrefs(): void {
  try {
    const raw = localStorage.getItem(COVERING_PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw) as { speed?: string; instantRun?: boolean; snapToGrid?: boolean };
    if (inputSpeedPreset && prefs.speed && SPEED_PRESET_MS[prefs.speed] != null) {
      inputSpeedPreset.value = prefs.speed;
    }
    if (inputInstantRun && typeof prefs.instantRun === 'boolean') {
      inputInstantRun.checked = prefs.instantRun;
    }
    if (inputSnapToGrid && typeof prefs.snapToGrid === 'boolean') {
      inputSnapToGrid.checked = prefs.snapToGrid;
    }
  } catch {
    // ignore
  }
}
function saveCoveringPrefs(): void {
  try {
    const prefs = {
      speed: inputSpeedPreset?.value || 'normal',
      instantRun: inputInstantRun?.checked ?? false,
      snapToGrid: inputSnapToGrid?.checked ?? false,
    };
    localStorage.setItem(COVERING_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
loadCoveringPrefs();
inputSpeedPreset?.addEventListener('change', saveCoveringPrefs);
inputInstantRun?.addEventListener('change', saveCoveringPrefs);
inputSnapToGrid?.addEventListener('change', saveCoveringPrefs);

canvasState.resize();
draw();
updateUndoRedoButtons();
updateDeleteEditButtons();
