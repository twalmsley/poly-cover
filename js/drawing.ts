/**
 * Polygon drawing: add point, close polygon, hit-test.
 * Points are {x, y} in world coordinates.
 */

import type { Point, Polygon, Region, BBox } from './types.js';

/**
 * Check if point (px, py) is inside polygon (array of {x,y}).
 * Ray-casting.
 */
export function pointInPolygon(px: number, py: number, points: Point[]): boolean {
  if (!points || points.length < 3) return false;
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Region: either simple polygon (array of {x,y}) or { exterior, holes } where holes is array of point arrays.
 */
function pointInRegion(px: number, py: number, region: Polygon | Region): boolean {
  const exterior = Array.isArray(region) ? region : region.exterior;
  const holes = Array.isArray(region) ? [] : (region.holes || []);
  if (!pointInPolygon(px, py, exterior)) return false;
  for (const hole of holes) {
    if (pointInPolygon(px, py, hole)) return false;
  }
  return true;
}

/**
 * Check if a rectangle is fully inside the polygon (or region with holes).
 * All four corners must be inside and no edge of the rectangle may cross the boundary.
 */
export function rectInsidePolygon(x: number, y: number, w: number, h: number, points: Point[]): boolean {
  return rectInsideRegion(x, y, w, h, points);
}

export function rectInsideRegion(x: number, y: number, w: number, h: number, region: Polygon | Region): boolean {
  const exterior = Array.isArray(region) ? region : region.exterior;
  const holes = Array.isArray(region) ? [] : (region.holes || []);
  const corners: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  for (const c of corners) {
    if (!pointInPolygon(c.x, c.y, exterior)) return false;
    for (const hole of holes) {
      if (pointInPolygon(c.x, c.y, hole)) return false;
    }
  }
  const rectSegments: [number, number, number, number][] = [
    [x, y, x + w, y],
    [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h],
    [x, y + h, x, y],
  ];
  const allRings = [exterior, ...holes];
  for (const points of allRings) {
    for (let i = 0, n = points.length; i < n; i++) {
      const j = (i + 1) % n;
      const ax = points[i].x, ay = points[i].y;
      const bx = points[j].x, by = points[j].y;
      for (const [cx, cy, dx, dy] of rectSegments) {
        if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return false;
      }
    }
  }
  return true;
}

function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true;
  if (o2 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true;
  if (o3 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (o4 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true;
  return false;
}

function orient(ox: number, oy: number, px: number, py: number, qx: number, qy: number): -1 | 0 | 1 {
  const v = (py - oy) * (qx - px) - (px - ox) * (qy - py);
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}

function onSegment(ax: number, ay: number, bx: number, by: number, qx: number, qy: number): boolean {
  return Math.min(ax, bx) <= qx && qx <= Math.max(ax, bx) && Math.min(ay, by) <= qy && qy <= Math.max(ay, by);
}

/**
 * Bounding box of points or region (uses exterior only).
 */
export function bbox(pointsOrRegion: Point[] | Region): BBox {
  const points = Array.isArray(pointsOrRegion) ? pointsOrRegion : (pointsOrRegion?.exterior || []);
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = points[0].x, minY = points[0].y, maxX = minX, maxY = minY;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Distance from point (px, py) to segment (ax,ay)-(bx,by).
 */
export function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 <= 0 ? 0 : (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * abx, qy = ay + t * aby;
  return Math.hypot(px - qx, py - qy);
}

/**
 * Hit-test: is (wx, wy) near the polygon boundary (for closing)?
 * Returns true if within threshold of any edge.
 */
export function hitTestPolygonEdge(wx: number, wy: number, points: Point[], threshold: number): boolean {
  if (!points || points.length < 2) return false;
  for (let i = 0, n = points.length; i < n; i++) {
    const j = (i + 1) % n;
    const d = pointToSegmentDist(wx, wy, points[i].x, points[i].y, points[j].x, points[j].y);
    if (d <= threshold) return true;
  }
  return false;
}
