/**
 * Rectangle covering: grid fill with smallest squares, then recursively merge
 * 4 adjacent squares (2x2) into one larger square until no merges possible.
 */

import * as martinez from 'martinez-polygon-clipping';
import { rectInsideRegion, bbox } from './drawing.js';

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
 * Find one 2x2 block of same-size squares that can be merged. Returns { x, y, size } of top-left, or null.
 */
function findMerge(squareSet, squareList) {
  const bySize = new Map();
  for (const s of squareList) {
    if (!bySize.has(s.size)) bySize.set(s.size, []);
    bySize.get(s.size).push(s);
  }
  const sizes = [...bySize.keys()].sort((a, b) => a - b);
  for (const size of sizes) {
    for (const s of bySize.get(size)) {
      const { x, y } = s;
      const k1 = squareKey({ x: x + size, y, size });
      const k2 = squareKey({ x, y: y + size, size });
      const k3 = squareKey({ x: x + size, y: y + size, size });
      if (squareSet.has(k1) && squareSet.has(k2) && squareSet.has(k3)) {
        return { x, y, size };
      }
    }
  }
  return null;
}

/**
 * Run grid-fill + merge covering: yields { rectangles, remaining } for animation.
 * Options: minSize (smallest square side). Merges until no 2x2 blocks remain.
 */
export function* runCovering(polygons, options = {}) {
  const { minSize = 8 } = options;
  const regions = unionPolygons(polygons);
  if (!regions || regions.length === 0) {
    yield { rectangles: [], remaining: [] };
    return;
  }

  let squares = [];
  for (const reg of regions) {
    squares = squares.concat(fillGrid(reg, minSize));
  }

  yield { rectangles: squaresToRects(squares), remaining: [] };

  const squareSet = new Set(squares.map(squareKey));

  while (true) {
    const merge = findMerge(squareSet, squares);
    if (!merge) break;

    const { x, y, size } = merge;
    const newSize = size * 2;
    const toRemove = [
      { x, y, size },
      { x: x + size, y, size },
      { x, y: y + size, size },
      { x: x + size, y: y + size, size },
    ];
    for (const s of toRemove) {
      squareSet.delete(squareKey(s));
    }
    squareSet.add(squareKey({ x, y, size: newSize }));

    squares = squares.filter(s => squareSet.has(squareKey(s)));
    squares.push({ x, y, size: newSize });

    yield { rectangles: squaresToRects(squares), remaining: [] };
  }

  yield { rectangles: squaresToRects(squares), remaining: [] };
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
  const rings = acc.map(ring => ringToPoints(ring)).filter(p => p.length >= 3);
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
