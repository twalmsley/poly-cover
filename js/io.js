/**
 * Export/import helpers for polygons and rectangles.
 * Polygons: array of point arrays [[{x,y}, ...], ...].
 * Rectangles: array of { x, y, w, h }.
 */

/** Format version for tagged export; import accepts this or legacy untagged shapes. */
export const EXPORT_FORMAT_VERSION = 1;

/**
 * @param {Array<Array<{x: number, y: number}>>} polygons
 * @param {Array<{x: number, y: number}>|null} [currentPolygon]
 * @returns {string} JSON string with type: 'polygons'
 */
export function exportPolygonsJSON(polygons, currentPolygon = null) {
  const toExport = polygons ? [...polygons] : [];
  if (currentPolygon && currentPolygon.length >= 3) {
    toExport.push(currentPolygon.map((p) => ({ x: p.x, y: p.y })));
  }
  return JSON.stringify({ type: 'polygons', version: EXPORT_FORMAT_VERSION, data: toExport }, null, 2);
}

/**
 * @param {Array<{x: number, y: number, w: number, h: number}>} rectangles
 * @returns {string} JSON string with type: 'rectangles'
 */
export function exportRectanglesJSON(rectangles) {
  if (!rectangles) return JSON.stringify({ type: 'rectangles', version: EXPORT_FORMAT_VERSION, data: [] }, null, 2);
  return JSON.stringify({ type: 'rectangles', version: EXPORT_FORMAT_VERSION, data: rectangles }, null, 2);
}

/**
 * @param {Array<{x: number, y: number, w: number, h: number}>} rectangles
 * @returns {string} JSON string with type: 'rectangles' (copyable and importable)
 */
export function exportRectanglesAsCode(rectangles) {
  if (!rectangles || rectangles.length === 0) {
    return JSON.stringify({ type: 'rectangles', version: EXPORT_FORMAT_VERSION, data: [] }, null, 2);
  }
  return JSON.stringify({ type: 'rectangles', version: EXPORT_FORMAT_VERSION, data: rectangles }, null, 2);
}

/**
 * Compute bounding box of rectangles for viewBox.
 * @param {Array<{x: number, y: number, w: number, h: number}>} rectangles
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
function rectsBBox(rectangles) {
  if (!rectangles || rectangles.length === 0) {
    return { x: 0, y: 0, w: 100, h: 100 };
  }
  let minX = rectangles[0].x, minY = rectangles[0].y;
  let maxX = rectangles[0].x + rectangles[0].w, maxY = rectangles[0].y + rectangles[0].h;
  for (const r of rectangles) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const pad = Math.max((maxX - minX), (maxY - minY)) * 0.05 || 10;
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + 2 * pad,
    h: maxY - minY + 2 * pad,
  };
}

/**
 * @param {Array<{x: number, y: number, w: number, h: number}>} rectangles
 * @returns {string} SVG string with viewBox and <rect> elements
 */
export function exportRectanglesSVG(rectangles) {
  if (!rectangles || rectangles.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
  }
  const bb = rectsBBox(rectangles);
  const rects = rectangles
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="#4ecdc4" stroke-width="1"/>`)
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}">\n  ${rects}\n</svg>`;
}

/**
 * Export full session: { type: 'session', polygons, rectangles }.
 * @param {{ polygons: Array, rectangles: Array, currentPolygon?: Array|null }} state
 * @returns {string} JSON string
 */
export function exportAllJSON(state) {
  const polygons = state.polygons ? [...state.polygons] : [];
  if (state.currentPolygon && state.currentPolygon.length >= 3) {
    polygons.push(state.currentPolygon.map((p) => ({ x: p.x, y: p.y })));
  }
  return JSON.stringify(
    {
      type: 'session',
      version: EXPORT_FORMAT_VERSION,
      polygons,
      rectangles: state.rectangles || [],
    },
    null,
    2
  );
}

/**
 * Validate that a value is an array of point arrays (each point has x, y).
 * @param {unknown} data
 * @returns {Array<Array<{x: number, y: number}>>}
 */
function validatePolygons(data) {
  if (!Array.isArray(data)) throw new Error('Polygons must be an array');
  const out = [];
  for (const ring of data) {
    if (!Array.isArray(ring)) throw new Error('Each polygon must be an array of points');
    const points = [];
    for (const p of ring) {
      if (p == null || typeof p !== 'object' || typeof p.x !== 'number' || typeof p.y !== 'number') {
        throw new Error('Each point must be { x, y } with numbers');
      }
      points.push({ x: p.x, y: p.y });
    }
    if (points.length >= 3) out.push(points);
  }
  return out;
}

/**
 * Validate that a value is an array of rectangles { x, y, w, h }.
 * @param {unknown} data
 * @returns {Array<{x: number, y: number, w: number, h: number}>}
 */
function validateRectangles(data) {
  if (!Array.isArray(data)) throw new Error('Rectangles must be an array');
  const out = [];
  for (const r of data) {
    if (r == null || typeof r !== 'object' ||
        typeof r.x !== 'number' || typeof r.y !== 'number' ||
        typeof r.w !== 'number' || typeof r.h !== 'number') {
      throw new Error('Each rectangle must be { x, y, w, h } with numbers');
    }
    out.push({ x: r.x, y: r.y, w: r.w, h: r.h });
  }
  return out;
}

/**
 * Parse JSON and return { polygons?, rectangles? } based on tagged type or legacy shape.
 * Tagged: { type: 'polygons', data } | { type: 'rectangles', data } | { type: 'session', polygons, rectangles }
 * Legacy: array → polygons; { polygons } → polygons; { rectangles } only → rectangles.
 * @param {string} jsonString
 * @returns {{ polygons?: Array<Array<{x: number, y: number}>>, rectangles?: Array<{x: number, y: number, w: number, h: number}> }}
 * @throws {Error} on invalid JSON or structure
 */
export function importFromJSON(jsonString) {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    throw new Error('Empty or invalid input');
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)));
  }

  if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
    switch (parsed.type) {
      case 'polygons':
        return { polygons: validatePolygons(parsed.data != null ? parsed.data : []) };
      case 'rectangles':
        return { rectangles: validateRectangles(parsed.data != null ? parsed.data : []) };
      case 'session':
        return {
          polygons: validatePolygons(parsed.polygons != null ? parsed.polygons : []),
          rectangles: validateRectangles(parsed.rectangles != null ? parsed.rectangles : []),
        };
      default:
        throw new Error('Unknown export type: ' + parsed.type);
    }
  }

  // Legacy: untagged
  if (Array.isArray(parsed)) {
    return { polygons: validatePolygons(parsed) };
  }
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.polygons)) {
      return {
        polygons: validatePolygons(parsed.polygons),
        rectangles: Array.isArray(parsed.rectangles) ? validateRectangles(parsed.rectangles) : [],
      };
    }
    if (Array.isArray(parsed.rectangles) && !Array.isArray(parsed.polygons)) {
      return { rectangles: validateRectangles(parsed.rectangles) };
    }
  }
  throw new Error('Expected tagged JSON (type: "polygons"|"rectangles"|"session") or legacy array / { polygons } / { rectangles }');
}

/**
 * @deprecated Use importFromJSON. Parse JSON and return { polygons } only (legacy).
 */
export function importPolygonsFromJSON(jsonString) {
  const result = importFromJSON(jsonString);
  if (result.rectangles != null && result.polygons == null) {
    throw new Error('This file contains rectangles only. Use Import to load it.');
  }
  return { polygons: result.polygons || [] };
}
