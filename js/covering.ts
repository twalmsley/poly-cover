/**
 * Rectangle covering: grid fill with smallest squares, then merge k×k blocks
 * (k = 2..maxK) into single squares. Prefers larger k to minimise square count.
 */

import * as martinez from 'martinez-polygon-clipping';
import { rectInsideRegion, bbox, circleInsideRegion } from './drawing.js';
import type { Point, Polygon, Rectangle, Region, CoveringStep, CoveringShape, Circle } from './types.js';

const DEFAULT_MAX_K = 8;

interface Square {
  x: number;
  y: number;
  size: number;
}

function squareKey(s: Square): string {
  return `${s.x},${s.y},${s.size}`;
}

/** Convert list of squares to rectangle list for drawing: { x, y, w, h }. */
function squaresToRects(squares: Square[]): Rectangle[] {
  return squares.map(s => ({ x: s.x, y: s.y, w: s.size, h: s.size }));
}

/**
 * Fill region with a grid of minSize x minSize squares (only those fully inside the region).
 */
function fillGrid(region: Polygon | Region, minSize: number): Square[] {
  const bb = bbox(region);
  const squares: Square[] = [];
  for (let i = 0; i * minSize < bb.w; i++) {
    for (let j = 0; j * minSize < bb.h; j++) {
      const x = bb.x + i * minSize;
      const y = bb.y + j * minSize;
      if (rectInsideRegion(x, y, minSize, minSize, region)) {
        squares.push({ x, y, size: minSize });
      }
    }
  }
  return squares;
}

/** Normalize rect to { x, y, w, h }. */
function rectWh(r: Rectangle): { x: number; y: number; w: number; h: number } {
  return {
    x: r.x,
    y: r.y,
    w: r.w ?? r.width ?? 0,
    h: r.h ?? r.height ?? 0,
  };
}

/** Two rectangles that share an edge and can be merged into one. */
interface AdjacentMergePair {
  i: number;
  j: number;
  merged: Rectangle;
}

/**
 * Find two adjacent rectangles that can be merged (same width stacked vertically, or same height side by side).
 * Merged rect must be fully inside one of the regions.
 */
function findAdjacentMergeablePair(rects: Rectangle[], regions: Region[]): AdjacentMergePair | null {
  const n = rects.length;
  for (let i = 0; i < n; i++) {
    const a = rectWh(rects[i]);
    for (let j = i + 1; j < n; j++) {
      const b = rectWh(rects[j]);
      let merged: Rectangle | null = null;
      // Side by side: same y, same height, share vertical edge
      if (a.y === b.y && a.h === b.h) {
        if (a.x + a.w === b.x) merged = { x: a.x, y: a.y, w: a.w + b.w, h: a.h };
        else if (b.x + b.w === a.x) merged = { x: b.x, y: b.y, w: a.w + b.w, h: a.h };
      }
      // Stacked: same x, same width, share horizontal edge
      if (!merged && a.x === b.x && a.w === b.w) {
        if (a.y + a.h === b.y) merged = { x: a.x, y: a.y, w: a.w, h: a.h + b.h };
        else if (b.y + b.h === a.y) merged = { x: b.x, y: b.y, w: a.w, h: a.h + b.h };
      }
      if (merged && regions.some((reg) => rectInsideRegion(merged!.x, merged!.y, merged!.w, merged!.h, reg))) {
        return { i, j, merged };
      }
    }
  }
  return null;
}

function replacePairWithMerged(rects: Rectangle[], i: number, j: number, merged: Rectangle): Rectangle[] {
  const out = rects.filter((_, idx) => idx !== i && idx !== j);
  out.push(merged);
  return out;
}

/**
 * Run squares covering only: grid fill + k×k merge. Yields steps for animation.
 */
function* runCoveringSquares(
  regions: Region[],
  minSize: number,
  capK: number,
  capMinK: number
): Generator<CoveringStep> {
  let squares: Square[] = [];
  for (const reg of regions) {
    squares = squares.concat(fillGrid(reg, minSize));
  }

  let iteration = 0;
  yield { rectangles: squaresToRects(squares), remaining: [], iteration };

  const squareSet = new Set(squares.map(squareKey));
  const mergedKeys = new Set<string>();

  while (true) {
    let merge: MergeResult | null = null;
    if (squares.length > 0) {
      const last = squares[squares.length - 1];
      for (const k of kHalvingRange(capK, capMinK)) {
        if (hasBlock(squareSet, last.x, last.y, last.size, k)) {
          merge = { x: last.x, y: last.y, size: last.size, k };
          break;
        }
      }
    }
    if (!merge) {
      const excludeKeys = new Set(mergedKeys);
      if (squares.length > 0) excludeKeys.add(squareKey(squares[squares.length - 1]));
      merge = findMerge(squareSet, squares, capK, capMinK, excludeKeys);
    }
    if (!merge) break;

    const { x, y, size, k } = merge;
    const newSize = size * k;
    const toRemove: Square[] = [];
    for (let di = 0; di < k; di++) {
      for (let dj = 0; dj < k; dj++) {
        toRemove.push({ x: x + di * size, y: y + dj * size, size });
      }
    }
    for (const s of toRemove) {
      const key = squareKey(s);
      squareSet.delete(key);
      mergedKeys.add(key);
    }
    squareSet.add(squareKey({ x, y, size: newSize }));

    squares = squares.filter((s) => squareSet.has(squareKey(s)));
    squares.push({ x, y, size: newSize });

    iteration++;
    yield { rectangles: squaresToRects(squares), remaining: [], iteration };
  }

  yield { rectangles: squaresToRects(squares), remaining: [], iteration };
}

/**
 * Run rectangle covering: first run the squares algorithm, then merge adjacent squares/rects into larger rectangles.
 */
function* runCoveringRectangles(
  regions: Region[],
  minSize: number,
  maxK: number,
  minK: number
): Generator<CoveringStep> {
  const capK = Math.max(2, Math.min(1024, Math.floor(maxK)));
  const capMinK = Math.max(2, Math.min(capK, Math.floor(minK)));

  let lastStep: CoveringStep = { rectangles: [], remaining: [], iteration: 0 };
  for (const step of runCoveringSquares(regions, minSize, capK, capMinK)) {
    yield step;
    lastStep = step;
  }

  let rects = [...lastStep.rectangles];
  let iteration = lastStep.iteration;

  while (true) {
    const pair = findAdjacentMergeablePair(rects, regions);
    if (!pair) break;
    rects = replacePairWithMerged(rects, pair.i, pair.j, pair.merged);
    iteration++;
    yield { rectangles: rects, remaining: [], iteration };
  }

  yield { rectangles: rects, remaining: [], iteration };
}

/** Yields diameters from maxK down to minK by halving (maxK, maxK/2, maxK/4, ...). */
function* diameterHalvingRange(maxK: number, minK: number): Generator<number> {
  let d = Math.floor(maxK);
  const min = Math.max(2, Math.floor(minK));
  const seen = new Set<number>();
  while (d >= min) {
    if (!seen.has(d)) {
      seen.add(d);
      yield d;
    }
    const next = Math.floor(d / 2);
    if (next >= d) break;
    d = next;
  }
}

function circleOverlapsExisting(cx: number, cy: number, r: number, circles: Circle[]): boolean {
  for (const c of circles) {
    const dist = Math.hypot(cx - c.cx, cy - c.cy);
    if (dist < r + c.r) return true;
  }
  return false;
}

/**
 * Run circle covering: place circles of diameter maxK, then fill gaps with maxK/2, maxK/4, ... down to minK.
 * Circles are placed on a grid (step = diameter) so same-size circles don't overlap; new circles must not overlap any existing.
 */
function* runCoveringCircles(regions: Region[], _minSize: number, maxK: number, minK: number): Generator<CoveringStep> {
  const circles: Circle[] = [];
  const capK = Math.max(2, Math.min(1024, Math.floor(maxK)));
  const capMinK = Math.max(2, Math.min(capK, Math.floor(minK)));
  let iteration = 0;

  yield { rectangles: [], circles: [], remaining: [], iteration };

  for (const diameter of diameterHalvingRange(capK, capMinK)) {
    const r = diameter / 2;
    let added = 0;
    for (const reg of regions) {
      const bb = bbox(reg);
      for (let i = 0; ; i++) {
        const cx = bb.x + r + i * diameter;
        if (cx - r > bb.x + bb.w) break;
        for (let j = 0; ; j++) {
          const cy = bb.y + r + j * diameter;
          if (cy - r > bb.y + bb.h) break;
          if (!circleInsideRegion(cx, cy, r, reg)) continue;
          if (circleOverlapsExisting(cx, cy, r, circles)) continue;
          circles.push({ cx, cy, r });
          added++;
        }
      }
    }
    if (added > 0) {
      iteration++;
      yield { rectangles: [], circles: [...circles], remaining: [], iteration };
    }
  }

  yield { rectangles: [], circles, remaining: [], iteration };
}

/**
 * Check if all k×k squares exist with top-left at (x, y) and given size.
 */
function hasBlock(squareSet: Set<string>, x: number, y: number, size: number, k: number): boolean {
  for (let di = 0; di < k; di++) {
    for (let dj = 0; dj < k; dj++) {
      if (!squareSet.has(squareKey({ x: x + di * size, y: y + dj * size, size }))) {
        return false;
      }
    }
  }
  return true;
}

interface MergeResult {
  x: number;
  y: number;
  size: number;
  k: number;
}

/**
 * Find one k×k block to merge (largest k first, then by size). Returns { x, y, size, k } or null.
 */
function findMerge(
  squareSet: Set<string>,
  squareList: Square[],
  maxK: number,
  minK: number,
  excludeKeys: Set<string> | null
): MergeResult | null {
  const bySize = new Map<number, Square[]>();
  for (const s of squareList) {
    if (excludeKeys && excludeKeys.has(squareKey(s))) continue;
    if (!bySize.has(s.size)) bySize.set(s.size, []);
    bySize.get(s.size)!.push(s);
  }
  const sizes = [...bySize.keys()].sort((a, b) => a - b);
  for (const k of kHalvingRange(maxK, minK)) {
    for (const size of sizes) {
      for (const s of bySize.get(size)!) {
        const { x, y } = s;
        if (hasBlock(squareSet, x, y, size, k)) {
          return { x, y, size, k };
        }
      }
    }
  }
  return null;
}

/** Yields k values by halving from maxK down to minK (e.g. 1024, 512, 256, ..., 2). */
function* kHalvingRange(maxK: number, minK: number): Generator<number> {
  let k = Math.floor(maxK);
  const min = Math.max(2, Math.floor(minK));
  const seen = new Set<number>();
  while (k >= min) {
    if (!seen.has(k)) {
      seen.add(k);
      yield k;
    }
    const next = Math.floor(k / 2);
    if (next >= k) break;
    k = next;
  }
}

export interface RunCoveringOptions {
  minSize?: number;
  maxK?: number;
  minK?: number;
  /** Shape strategy: 'squares' (k×k merge only) or 'rectangles' (any w×h merge). Default 'squares'. */
  shape?: CoveringShape;
}

/**
 * Run grid-fill + merge covering: yields { rectangles, remaining, iteration } for animation.
 * When shape is 'rectangles', merges any w×h blocks; when 'squares', merges only k×k blocks.
 */
export function* runCovering(polygons: Polygon[], options: RunCoveringOptions = {}): Generator<CoveringStep> {
  const { minSize = 8, maxK = DEFAULT_MAX_K, minK = 2, shape = 'squares' } = options;
  const capK = Math.max(2, Math.min(1024, Math.floor(maxK)));
  const capMinK = Math.max(2, Math.min(capK, Math.floor(minK)));
  const regions = unionPolygons(polygons);
  if (!regions || regions.length === 0) {
    yield { rectangles: [], remaining: [], iteration: 0 };
    return;
  }

  if (shape === 'rectangles') {
    yield* runCoveringRectangles(regions, minSize, capK, capMinK);
    return;
  }
  if (shape === 'circles') {
    yield* runCoveringCircles(regions, minSize, capK, capMinK);
    return;
  }

  yield* runCoveringSquares(regions, minSize, capK, capMinK);
}

/** Polygon as array of {x,y} -> GeoJSON polygon coords (closed ring). */
function toMartinezPolygon(points: Point[]): number[][][] {
  const ring = points.map(p => [p.x, p.y]);
  if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return [ring];
}

/** Region { exterior, holes } -> GeoJSON polygon [ exteriorRing, ...holeRings ]. */
function toMartinezRegion(region: Region): number[][][] {
  const exterior = (region.exterior || []).map(p => [p.x, p.y]);
  if (exterior.length > 0 && (exterior[0][0] !== exterior[exterior.length - 1][0] || exterior[0][1] !== exterior[exterior.length - 1][1])) {
    exterior.push([exterior[0][0], exterior[0][1]]);
  }
  const rings: number[][][] = [exterior];
  const holes = region.holes || [];
  for (const hole of holes) {
    const h = hole.map(p => [p.x, p.y]);
    if (h.length > 0 && (h[0][0] !== h[h.length - 1][0] || h[0][1] !== h[h.length - 1][1])) h.push([h[0][0], h[0][1]]);
    rings.push(h);
  }
  return rings;
}

function ringToPoints(ring: number[][]): Point[] {
  if (!ring || ring.length === 0) return [];
  const pts = ring.map(([x, y]) => ({ x, y }));
  if (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop();
  return pts.length >= 3 ? pts : [];
}

function signedArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
}

/** Union multiple polygons (array of point arrays) -> array of regions for covering. */
export function unionPolygons(polygonList: Polygon[]): Region[] {
  if (!polygonList || polygonList.length === 0) return [];
  if (polygonList.length === 1) return [{ exterior: polygonList[0], holes: [] }];
  type Ring = number[][];
  type GeoPolygon = Ring[];
  type GeoMultiPolygon = GeoPolygon[];
  let acc: GeoPolygon | GeoMultiPolygon = toMartinezPolygon(polygonList[0]);
  for (let i = 1; i < polygonList.length; i++) {
    const next = toMartinezPolygon(polygonList[i]);
    const result = martinez.union(acc, next);
    if (!result) return [];
    acc = result as GeoPolygon | GeoMultiPolygon;
  }
  // MultiPolygon: array of polygons, each polygon is array of rings
  const isMultiPolygon = acc.length > 1 && (acc as GeoMultiPolygon).every((poly) => poly.length === 1);
  if (isMultiPolygon) {
    return (acc as GeoMultiPolygon).map((poly) => ({
      exterior: ringToPoints(poly[0]),
      holes: poly.slice(1).map(ringToPoints).filter(p => p.length > 0),
    }));
  }
  // Single polygon: array of rings (exterior + holes)
  const rings = (acc as GeoPolygon).map(ring => ringToPoints(ring)).filter(p => p.length >= 3);
  if (rings.length === 0) return [];
  const byArea = rings.map(r => ({ r, a: Math.abs(signedArea(r)) }));
  byArea.sort((a, b) => b.a - a.a);
  return [{ exterior: byArea[0].r, holes: byArea.slice(1).map(x => x.r) }];
}

/** Area of one region: exterior ring area minus hole areas. */
function regionArea(region: Region): number {
  if (!region) return 0;
  const exterior = region.exterior || [];
  const holes = region.holes || [];
  let a = Math.abs(signedArea(exterior));
  for (const h of holes) {
    a -= Math.abs(signedArea(h));
  }
  return Math.max(0, a);
}

/**
 * Total area of the union of the given polygons (world square units).
 */
export function getUnionArea(polygonList: Polygon[]): number {
  const regions = unionPolygons(polygonList);
  if (!regions || regions.length === 0) return 0;
  return regions.reduce((sum, reg) => sum + regionArea(reg), 0);
}
