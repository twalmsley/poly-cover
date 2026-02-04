/**
 * Rectangle covering: grid fill with smallest squares, then merge k×k blocks
 * (k = 2..maxK) into single squares. Prefers larger k to minimise square count.
 */

import * as martinez from 'martinez-polygon-clipping';
import { rectInsideRegion, bbox } from './drawing.js';

const DEFAULT_MAX_K = 8;

function squareKey(s) {
  return `${s.x},${s.y},${s.size}`;
}

/** Convert list of squares to rectangle list for drawing: { x, y, w, h }. */
function squaresToRects(squares) {
  return squares.map(s => ({ x: s.x, y: s.y, w: s.size, h: s.size }));
}

/**
 * Fill region with a grid of minSize x minSize squares (only those fully inside the region).
 */
function fillGrid(region, minSize) {
  const bb = bbox(region);
  const squares = [];
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

/**
 * Check if all k×k squares exist with top-left at (x, y) and given size.
 */
function hasBlock(squareSet, x, y, size, k) {
  for (let di = 0; di < k; di++) {
    for (let dj = 0; dj < k; dj++) {
      if (!squareSet.has(squareKey({ x: x + di * size, y: y + dj * size, size }))) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Find one k×k block to merge (largest k first, then by size). Returns { x, y, size, k } or null.
 * Optional excludeKeys: set of square keys to skip (e.g. squares already considered).
 */
function findMerge(squareSet, squareList, maxK, minK, excludeKeys = null) {
  const bySize = new Map();
  for (const s of squareList) {
    if (excludeKeys && excludeKeys.has(squareKey(s))) continue;
    if (!bySize.has(s.size)) bySize.set(s.size, []);
    bySize.get(s.size).push(s);
  }
  const sizes = [...bySize.keys()].sort((a, b) => a - b);
  for (const k of kHalvingRange(maxK, minK)) {
    for (const size of sizes) {
      for (const s of bySize.get(size)) {
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
function* kHalvingRange(maxK, minK) {
  let k = Math.floor(maxK);
  const min = Math.max(2, Math.floor(minK));
  const seen = new Set();
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

/**
 * Run grid-fill + merge covering: yields { rectangles, remaining, iteration } for animation.
 * Options: minSize (smallest square side), maxK (max merge block, up to 1024), minK (min k, default 2).
 * k is tried by halving: maxK, maxK/2, maxK/4, ... down to minK.
 */
export function* runCovering(polygons, options = {}) {
  const { minSize = 8, maxK = DEFAULT_MAX_K, minK = 2 } = options;
  const capK = Math.max(2, Math.min(1024, Math.floor(maxK)));
  const capMinK = Math.max(2, Math.min(capK, Math.floor(minK)));
  const regions = unionPolygons(polygons);
  if (!regions || regions.length === 0) {
    yield { rectangles: [], remaining: [], iteration: 0 };
    return;
  }

  let squares = [];
  for (const reg of regions) {
    squares = squares.concat(fillGrid(reg, minSize));
  }

  let iteration = 0;
  yield { rectangles: squaresToRects(squares), remaining: [], iteration };

  const squareSet = new Set(squares.map(squareKey));
  /** Keys of squares that have been merged (removed); never consider again. */
  const mergedKeys = new Set();

  while (true) {
    let merge = null;
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
    const toRemove = [];
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
function toMartinezPolygon(points) {
  const ring = points.map(p => [p.x, p.y]);
  if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return [ring];
}

/** Region { exterior, holes } -> GeoJSON polygon [ exteriorRing, ...holeRings ]. */
function toMartinezRegion(region) {
  const exterior = (Array.isArray(region) ? region : region.exterior).map(p => [p.x, p.y]);
  if (exterior.length > 0 && (exterior[0][0] !== exterior[exterior.length - 1][0] || exterior[0][1] !== exterior[exterior.length - 1][1])) {
    exterior.push([exterior[0][0], exterior[0][1]]);
  }
  const rings = [exterior];
  const holes = Array.isArray(region) ? [] : (region.holes || []);
  for (const hole of holes) {
    const h = hole.map(p => [p.x, p.y]);
    if (h.length > 0 && (h[0][0] !== h[h.length - 1][0] || h[0][1] !== h[h.length - 1][1])) h.push([h[0][0], h[0][1]]);
    rings.push(h);
  }
  return rings;
}

/** Rectangle {x, y, w, h} -> GeoJSON polygon (closed ring). */
function rectToMartinez(r) {
  const { x, y, w, h } = r;
  return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
}

/** Martinez result (polygon or multipolygon) -> array of point arrays. */
function fromMartinez(geom) {
  if (!geom || geom.length === 0) return [];
  const out = [];
  for (const ring of geom) {
    if (!ring || ring.length === 0) continue;
    const points = ring.map(([x, y]) => ({ x, y }));
    if (points.length > 1 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y) {
      points.pop();
    }
    if (points.length >= 3) out.push(points);
  }
  return out;
}

/** Union multiple polygons (array of point arrays) -> array of regions for covering. */
export function unionPolygons(polygonList) {
  if (!polygonList || polygonList.length === 0) return [];
  if (polygonList.length === 1) return [polygonList[0]];
  let acc = toMartinezPolygon(polygonList[0]);
  for (let i = 1; i < polygonList.length; i++) {
    const next = toMartinezPolygon(polygonList[i]);
    acc = martinez.union(acc, next);
    if (!acc) return [];
  }
  const isMultiPolygon = acc.length > 1 && acc.every(poly => poly.length === 1);
  if (isMultiPolygon) {
    return acc.map(poly => ({ exterior: ringToPoints(poly[0]), holes: poly.slice(1).map(ringToPoints).filter(p => p.length > 0) }));
  }
  // Single polygon (possibly with holes): acc[0] is Polygon = Ring[]
  const polygon = acc[0];
  const rings = polygon.map(ring => ringToPoints(ring)).filter(p => p.length >= 3);
  if (rings.length === 0) return [];
  const byArea = rings.map(r => ({ r, a: Math.abs(signedArea(r)) }));
  byArea.sort((a, b) => b.a - a.a);
  return [{ exterior: byArea[0].r, holes: byArea.slice(1).map(x => x.r) }];
}

function ringToPoints(ring) {
  if (!ring || ring.length === 0) return [];
  const pts = ring.map(([x, y]) => ({ x, y }));
  if (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop();
  return pts.length >= 3 ? pts : [];
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
}

/** Area of one region: exterior ring area minus hole areas. Region may be { exterior, holes } or a single ring (points). */
function regionArea(region) {
  if (!region) return 0;
  const exterior = region.exterior != null ? region.exterior : region;
  const holes = Array.isArray(region) ? [] : (region.holes || []);
  let a = Math.abs(signedArea(exterior));
  for (const h of holes) {
    a -= Math.abs(signedArea(h));
  }
  return Math.max(0, a);
}

/**
 * Total area of the union of the given polygons (world square units).
 * Uses the same union + per-ring signed area as the covering. Returns 0 if no polygons.
 */
export function getUnionArea(polygonList) {
  const regions = unionPolygons(polygonList);
  if (!regions || regions.length === 0) return 0;
  return regions.reduce((sum, reg) => sum + regionArea(reg), 0);
}
