/**
 * Canvas: pan/zoom transform and draw helpers.
 * All drawing uses world coordinates; we apply scale and translation.
 */

import type { Point, Polygon, Rectangle, Bounds } from './types.js';

export interface DrawPolygonOptions {
  fill?: string | null;
  stroke?: string;
  lineWidth?: number;
}

export interface DrawRectOptions {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
}

export interface DrawRemainingOptions {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
}

export interface Viewport {
  width: number;
  height: number;
  centerX?: number;
  centerY?: number;
}

export interface CanvasState {
  readonly ctx: CanvasRenderingContext2D;
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
  applyTransform(): void;
  screenToWorld(sx: number, sy: number): Point;
  handleWheel(e: WheelEvent): boolean;
  handlePointerDown(sx: number, sy: number): void;
  handlePointerMove(sx: number, sy: number): void;
  handlePointerUp(): void;
  resize(): void;
  resetZoom(bounds: Bounds | null, viewport?: Viewport): void;
}

export function makeCanvasState(canvas: HTMLCanvasElement): CanvasState {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let lastX = 0;
  let lastY = 0;
  let panning = false;
  let dpr = 1;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');
  const ctx2d: CanvasRenderingContext2D = ctx;

  function applyTransform(): void {
    ctx2d.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
  }

  /** Screen (client) coords to world coords. Uses logical (CSS) pixel space. */
  function screenToWorld(sx: number, sy: number): Point {
    const rect = canvas.getBoundingClientRect();
    const lx = sx - rect.left;
    const ly = sy - rect.top;
    return { x: (lx - tx) / scale, y: (ly - ty) / scale };
  }

  function handleWheel(e: WheelEvent): boolean {
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

  function handlePointerDown(sx: number, sy: number): void {
    lastX = sx;
    lastY = sy;
    panning = true;
  }

  function handlePointerMove(sx: number, sy: number): void {
    if (!panning) return;
    tx += sx - lastX;
    ty += sy - lastY;
    lastX = sx;
    lastY = sy;
  }

  function handlePointerUp(): void {
    panning = false;
  }

  function resize(): void {
    const wrap = canvas.parentElement;
    if (!wrap) return;
    dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  /**
   * Reset zoom and pan. If bounds is provided and has finite size, fit content in 90% of viewport (centered).
   * Otherwise reset to default view (scale 1, origin at center).
   */
  function resetZoom(bounds: Bounds | null, viewport?: Viewport): void {
    const wrap = canvas.parentElement;
    const w = viewport ? viewport.width : (wrap?.clientWidth ?? 0);
    const h = viewport ? viewport.height : (wrap?.clientHeight ?? 0);
    const cx = viewport && viewport.centerX != null ? viewport.centerX : w / 2;
    const cy = viewport && viewport.centerY != null ? viewport.centerY : h / 2;
    const minScale = 0.1;
    const maxScale = 20;

    if (
      bounds &&
      Number.isFinite(bounds.minX) &&
      Number.isFinite(bounds.minY) &&
      Number.isFinite(bounds.maxX) &&
      Number.isFinite(bounds.maxY)
    ) {
      const bw = bounds.maxX - bounds.minX;
      const bh = bounds.maxY - bounds.minY;
      if (bw > 0 && bh > 0) {
        const scaleX = (0.9 * w) / bw;
        const scaleY = (0.9 * h) / bh;
        scale = Math.max(minScale, Math.min(maxScale, Math.min(scaleX, scaleY)));
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        tx = cx - centerX * scale;
        ty = cy - centerY * scale;
        return;
      }
    }
    scale = 1;
    tx = cx;
    ty = cy;
  }

  return {
    get ctx() { return ctx2d; },
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
    resetZoom,
  };
}

/** Draw a polygon (array of {x,y}). */
export function drawPolygon(ctx: CanvasRenderingContext2D, points: Point[], options: DrawPolygonOptions = {}): void {
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
export function drawRect(ctx: CanvasRenderingContext2D, r: Rectangle, options: DrawRectOptions = {}): void {
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
export function drawRemaining(ctx: CanvasRenderingContext2D, polygons: Polygon[], options: DrawRemainingOptions = {}): void {
  const { fill = 'rgba(255, 200, 100, 0.15)', stroke = 'rgba(255, 200, 100, 0.5)', lineWidth = 1 } = options;
  for (const points of polygons) {
    drawPolygon(ctx, points, { fill, stroke, lineWidth });
  }
}
