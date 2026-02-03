/**
 * App state, event handlers, and animation loop.
 */

import { makeCanvasState, drawPolygon, drawRect, drawRemaining } from './canvas.js';
import { runCovering, unionPolygons } from './covering.js';
import { hitTestPolygonEdge } from './drawing.js';

const canvas = document.getElementById('c');
const wrap = document.getElementById('canvas-wrap');
const btnDraw = document.getElementById('btn-draw');
const btnClose = document.getElementById('btn-close');
const btnNew = document.getElementById('btn-new');
const btnRun = document.getElementById('btn-run');
const btnClear = document.getElementById('btn-clear');
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
  coveringRunning: false,
  spaceDown: false,
};

const CLOSE_HIT_THRESHOLD = 12;

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

  for (const points of state.polygons) {
    drawPolygon(ctx, points, { fill: 'rgba(233, 69, 96, 0.08)', stroke: '#e94560', lineWidth: 2 });
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
  draw();
}

function closePolygon() {
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    state.polygons.push([...state.currentPolygon]);
    state.currentPolygon = null;
    draw();
  }
}

function newPolygon() {
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    state.polygons.push([...state.currentPolygon]);
  }
  state.currentPolygon = [];
  draw();
}

function clearAll() {
  state.polygons = [];
  state.currentPolygon = null;
  state.rectangles = [];
  state.remaining = [];
  state.coveringIteration = 0;
  state.coveringRunning = false;
  draw();
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

  const merged = unionPolygons(closed);
  if (merged.length === 0) {
    state.coveringRunning = false;
    draw();
    return;
  }

  const minSize = Math.max(1, Math.min(500, parseInt(inputMinSize.value, 10) || 8));
  const maxK = inputMaxK ? Math.max(2, Math.min(1024, parseInt(inputMaxK.value, 10) || 8)) : 8;
  const minK = inputMinK ? Math.max(2, Math.min(1024, parseInt(inputMinK.value, 10) || 2)) : 2;

  const gen = runCovering(merged, { minSize, maxK, minK });
  const delay = 80;

  function step() {
    const { value, done } = gen.next();
    if (done || !state.coveringRunning) {
      state.coveringRunning = false;
      draw();
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
  if (e.button === 0 && state.drawMode && state.currentPolygon && state.currentPolygon.length >= 3) {
    e.preventDefault();
    closePolygon();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    state.spaceDown = true;
    wrap.classList.add('pan');
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
});

btnClose.addEventListener('click', closePolygon);
btnNew.addEventListener('click', newPolygon);

btnRun.addEventListener('click', () => {
  if (state.coveringRunning) return;
  startCovering();
});

btnClear.addEventListener('click', clearAll);

window.addEventListener('resize', () => {
  canvasState.resize();
  draw();
});

canvasState.resize();
draw();
