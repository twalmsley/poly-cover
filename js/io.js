/**
 * Export/import helpers for polygons and rectangles.
 * Polygons: array of point arrays [[{x,y}, ...], ...].
 * Rectangles: array of { x, y, w, h }.
 */

/**
 * @param {Array<Array<{x: number, y: number}>>} polygons
 * @param {Array<{x: number, y: number}>|null} [currentPolygon]
 * @returns {string} JSON string
 */
export function exportPolygonsJSON(polygons, currentPolygon = null) {
  const toExport = polygons ? [...polygons] : [];
  if (currentPolygon && currentPolygon.length >= 3) {
    toExport.push(currentPolygon.map((p) => ({ x: p.x, y: p.y })));
  }
  return JSON.stringify(toExport, null, 2);
}

/**
 * @param {Array<{x: number, y: number, w: number, h: number}>} rectangles
 * @returns {string} JSON string
 */
export function exportRectanglesJSON(rectangles) {
  if (!rectangles) return '[]';
  return JSON.stringify(rectangles, null, 2);
}

/**
 * @param {Array<{x: number, y: number, w: number, h: number}>} rectangles
 * @returns {string} JS array literal (copyable code)
 */
export function exportRectanglesAsCode(rectangles) {
  if (!rectangles || rectangles.length === 0) return '[]';
  return JSON.stringify(rectangles, null, 2);
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
 * Export full session: { polygons, rectangles }.
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
 * Parse JSON and return { polygons }. Accepts:
 * - Array of point arrays: [[{x,y}, ...], ...]
 * - Object with polygons property: { polygons: [...] }
 * @param {string} jsonString
 * @returns {{ polygons: Array<Array<{x: number, y: number}>> }}
 * @throws {Error} on invalid JSON or structure
 */
export function importPolygonsFromJSON(jsonString) {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    throw new Error('Empty or invalid input');
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)));
  }
  if (Array.isArray(parsed)) {
    return { polygons: validatePolygons(parsed) };
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.polygons)) {
    return { polygons: validatePolygons(parsed.polygons) };
  }
  throw new Error('Expected an array of polygons or an object with "polygons" array');
}
