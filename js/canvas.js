/**
 * Canvas: pan/zoom transform and draw helpers.
 * All drawing uses world coordinates; we apply scale and translation.
 */

export function makeCanvasState(canvas) {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let lastX = 0;
  let lastY = 0;
  let panning = false;
  let dpr = 1;

  const ctx = canvas.getContext('2d');

  function applyTransform() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
  }

  /** Screen (client) coords to world coords. Uses logical (CSS) pixel space. */
  function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const lx = sx - rect.left;
    const ly = sy - rect.top;
    return { x: (lx - tx) / scale, y: (ly - ty) / scale };
  }

  function handleWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = (mx - tx) / scale;
    const worldY = (my - ty) / scale;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(20, scale * factor));
    tx = mx - worldX * newScale;
    ty = my - worldY * newScale;
    scale = newScale;
    return true;
  }

  function handlePointerDown(sx, sy) {
    lastX = sx;
    lastY = sy;
    panning = true;
  }

  function handlePointerMove(sx, sy) {
    if (!panning) return;
    tx += sx - lastX;
    ty += sy - lastY;
    lastX = sx;
    lastY = sy;
  }

  function handlePointerUp() {
    panning = false;
  }

  function resize() {
    const wrap = canvas.parentElement;
    dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  return {
    get ctx() { return ctx; },
    get scale() { return scale; },
    get tx() { return tx; },
    get ty() { return ty; },
    applyTransform,
    screenToWorld,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resize,
  };
}

/** Draw a polygon (array of {x,y}). */
export function drawPolygon(ctx, points, options = {}) {
  if (!points || points.length < 2) return;
  const { fill = null, stroke = '#e94560', lineWidth = 2 } = options;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** Draw a rectangle {x, y, width, height} or {x, y, w, h}. */
export function drawRect(ctx, r, options = {}) {
  const x = r.x ?? 0;
  const y = r.y ?? 0;
  const w = r.width ?? r.w ?? 0;
  const h = r.height ?? r.h ?? 0;
  const { fill = 'rgba(78, 205, 196, 0.35)', stroke = '#4ecdc4', lineWidth = 1.5 } = options;
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, w, h);
}

/** Draw remaining region (list of polygons) with dim style. */
export function drawRemaining(ctx, polygons, options = {}) {
  const { fill = 'rgba(255, 200, 100, 0.15)', stroke = 'rgba(255, 200, 100, 0.5)', lineWidth = 1 } = options;
  for (const points of polygons) {
    drawPolygon(ctx, points, { fill, stroke, lineWidth });
  }
}
