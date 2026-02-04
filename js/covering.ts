/**
 * Rectangle covering: grid fill with smallest squares, then merge k×k blocks
 * (k = 2..maxK) into single squares. Prefers larger k to minimise square count.
 */

import * as martinez from 'martinez-polygon-clipping';
import { rectInsideRegion, bbox } from './drawing.js';
import type { Point, Polygon, Rectangle, Region, CoveringStep, CoveringShape } from './types.js';

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

/** Cell in grid: top-left (x, y) with fixed minSize. */
function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Fill region with grid cells (minSize×minSize); returns list of { x, y } for each cell fully inside.
 */
function fillGridCells(region: Polygon | Region, minSize: number): { x: number; y: number }[] {
  const bb = bbox(region);
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i * minSize < bb.w; i++) {
    for (let j = 0; j * minSize < bb.h; j++) {
      const x = bb.x + i * minSize;
      const y = bb.y + j * minSize;
      if (rectInsideRegion(x, y, minSize, minSize, region)) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

/** Check if a cols×rows block of cells exists with top-left (x, y) and given minSize. */
function hasRectBlock(
  cellSet: Set<string>,
  x: number,
  y: number,
  minSize: number,
  cols: number,
  rows: number
): boolean {
  for (let di = 0; di < cols; di++) {
    for (let dj = 0; dj < rows; dj++) {
      if (!cellSet.has(cellKey(x + di * minSize, y + dj * minSize))) return false;
    }
  }
  return true;
}

/** (cols, rows) pairs in descending order of area for rectangle merge (includes 1×k and k×1). */
function* rectMergeSizes(maxK: number, minK: number): Generator<[number, number]> {
  const pairs: [number, number][] = [];
  for (let cols = 1; cols <= maxK; cols++) {
    for (let rows = 1; rows <= maxK; rows++) {
      if (cols * rows < 2) continue; // need at least 2 cells to merge
      if (cols < minK && rows < minK) continue;
      pairs.push([cols, rows]);
    }
  }
  pairs.sort((a, b) => b[0] * b[1] - a[0] * a[1]);
  for (const p of pairs) yield p;
}

interface RectMergeResult {
  x: number;
  y: number;
  w: number;
  h: number;
  keysToRemove: string[];
}

/**
 * Find one rectangular block to merge: try (cols, rows) by descending area; return block and keys to remove, or null.
 */
function findRectMerge(
  cellSet: Set<string>,
  cells: { x: number; y: number }[],
  minSize: number,
  maxK: number,
  minK: number,
  regions: Region[],
  excludeKeys: Set<string> | null
): RectMergeResult | null {
  for (const [cols, rows] of rectMergeSizes(maxK, minK)) {
    const w = cols * minSize;
    const h = rows * minSize;
    for (const c of cells) {
      const { x, y } = c;
      if (excludeKeys && excludeKeys.has(cellKey(x, y))) continue;
      if (!hasRectBlock(cellSet, x, y, minSize, cols, rows)) continue;
      const keysToRemove: string[] = [];
      for (let di = 0; di < cols; di++) {
        for (let dj = 0; dj < rows; dj++) {
          keysToRemove.push(cellKey(x + di * minSize, y + dj * minSize));
        }
      }
      const insideSomeRegion = regions.some((reg) => rectInsideRegion(x, y, w, h, reg));
      if (insideSomeRegion) {
        return { x, y, w, h, keysToRemove };
      }
    }
  }
  return null;
}

/**
 * Run rectangle covering: grid fill then merge rectangular blocks (any w×h up to maxK×maxK).
 */
function* runCoveringRectangles(
  regions: Region[],
  minSize: number,
  maxK: number,
  minK: number
): Generator<CoveringStep> {
  let cells: { x: number; y: number }[] = [];
  for (const reg of regions) {
    cells = cells.concat(fillGridCells(reg, minSize));
  }
  const cellSet = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const merged: Rectangle[] = [];
  const capK = Math.max(2, Math.min(1024, Math.floor(maxK)));
  const capMinK = Math.max(2, Math.min(capK, Math.floor(minK)));
  let iteration = 0;

  function toRectangles(): Rectangle[] {
    const remaining = cells.map((c) => ({ x: c.x, y: c.y, w: minSize, h: minSize }));
    return [...merged, ...remaining];
  }

  yield { rectangles: toRectangles(), remaining: [], iteration };

  while (true) {
    const merge = findRectMerge(cellSet, cells, minSize, capK, capMinK, regions, null);
    if (!merge) break;
    const { x, y, w, h, keysToRemove } = merge;
    for (const key of keysToRemove) cellSet.delete(key);
    merged.push({ x, y, w, h });
    cells = cells.filter((c) => cellSet.has(cellKey(c.x, c.y)));
    iteration++;
    yield { rectangles: toRectangles(), remaining: [], iteration };
  }

  yield { rectangles: toRectangles(), remaining: [], iteration };
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

    squares = squares.filter(s => squareSet.has(squareKey(s)));
    squares.push({ x, y, size: newSize });

    iteration++;
    yield { rectangles: squaresToRects(squares), remaining: [], iteration };
  }

  yield { rectangles: squaresToRects(squares), remaining: [], iteration };
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
