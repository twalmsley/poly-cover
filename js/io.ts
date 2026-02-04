/**
 * Export/import helpers for polygons and rectangles.
 * Polygons: array of point arrays [[{x,y}, ...], ...].
 * Rectangles: array of { x, y, w, h }.
 */

import type { Point, Polygon, Rectangle, AppState, ImportResult } from './types.js';

/** Format version for tagged export; import accepts this or legacy untagged shapes. */
export const EXPORT_FORMAT_VERSION = 1;

export function exportPolygonsJSON(polygons: Polygon[], currentPolygon: Point[] | null = null): string {
  const toExport = polygons ? [...polygons] : [];
  if (currentPolygon && currentPolygon.length >= 3) {
    toExport.push(currentPolygon.map((p) => ({ x: p.x, y: p.y })));
  }
  return JSON.stringify({ type: 'polygons', version: EXPORT_FORMAT_VERSION, data: toExport }, null, 2);
}

export function exportRectanglesJSON(rectangles: Rectangle[]): string {
  if (!rectangles) return JSON.stringify({ type: 'rectangles', version: EXPORT_FORMAT_VERSION, data: [] }, null, 2);
  return JSON.stringify({ type: 'rectangles', version: EXPORT_FORMAT_VERSION, data: rectangles }, null, 2);
}

export function exportRectanglesAsCode(rectangles: Rectangle[]): string {
  if (!rectangles || rectangles.length === 0) {
    return JSON.stringify({ type: 'rectangles', version: EXPORT_FORMAT_VERSION, data: [] }, null, 2);
  }
  return JSON.stringify({ type: 'rectangles', version: EXPORT_FORMAT_VERSION, data: rectangles }, null, 2);
}

interface RectsBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsBBox(rectangles: Rectangle[]): RectsBBox {
  if (!rectangles || rectangles.length === 0) {
    return { x: 0, y: 0, w: 100, h: 100 };
  }
  let minX = rectangles[0].x, minY = rectangles[0].y;
  let maxX = rectangles[0].x + (rectangles[0].w ?? rectangles[0].width ?? 0);
  let maxY = rectangles[0].y + (rectangles[0].h ?? rectangles[0].height ?? 0);
  for (const r of rectangles) {
    const w = r.w ?? r.width ?? 0;
    const h = r.h ?? r.height ?? 0;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + w);
    maxY = Math.max(maxY, r.y + h);
  }
  const pad = Math.max((maxX - minX), (maxY - minY)) * 0.05 || 10;
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + 2 * pad,
    h: maxY - minY + 2 * pad,
  };
}

export function exportRectanglesSVG(rectangles: Rectangle[]): string {
  if (!rectangles || rectangles.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
  }
  const bb = rectsBBox(rectangles);
  const rects = rectangles
    .map((r) => {
      const w = r.w ?? r.width ?? 0;
      const h = r.h ?? r.height ?? 0;
      return `<rect x="${r.x}" y="${r.y}" width="${w}" height="${h}" fill="none" stroke="#4ecdc4" stroke-width="1"/>`;
    })
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}">\n  ${rects}\n</svg>`;
}

export function exportAllJSON(state: AppState): string {
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

function validatePolygons(data: unknown): Polygon[] {
  if (!Array.isArray(data)) throw new Error('Polygons must be an array');
  const out: Polygon[] = [];
  for (const ring of data) {
    if (!Array.isArray(ring)) throw new Error('Each polygon must be an array of points');
    const points: Point[] = [];
    for (const p of ring) {
      if (p == null || typeof p !== 'object' || typeof (p as Point).x !== 'number' || typeof (p as Point).y !== 'number') {
        throw new Error('Each point must be { x, y } with numbers');
      }
      points.push({ x: (p as Point).x, y: (p as Point).y });
    }
    if (points.length >= 3) out.push(points);
  }
  return out;
}

function validateRectangles(data: unknown): Rectangle[] {
  if (!Array.isArray(data)) throw new Error('Rectangles must be an array');
  const out: Rectangle[] = [];
  for (const r of data) {
    if (r == null || typeof r !== 'object' ||
        typeof (r as Rectangle).x !== 'number' || typeof (r as Rectangle).y !== 'number' ||
        typeof (r as Rectangle).w !== 'number' || typeof (r as Rectangle).h !== 'number') {
      throw new Error('Each rectangle must be { x, y, w, h } with numbers');
    }
    const rect = r as Rectangle;
    out.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
  }
  return out;
}

export function importFromJSON(jsonString: string): ImportResult {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    throw new Error('Empty or invalid input');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)));
  }

  if (parsed && typeof parsed === 'object' && typeof (parsed as { type?: string }).type === 'string') {
    const tagged = parsed as { type: string; data?: unknown; polygons?: unknown; rectangles?: unknown };
    switch (tagged.type) {
      case 'polygons':
        return { polygons: validatePolygons(tagged.data != null ? tagged.data : []) };
      case 'rectangles':
        return { rectangles: validateRectangles(tagged.data != null ? tagged.data : []) };
      case 'session':
        return {
          polygons: validatePolygons(tagged.polygons != null ? tagged.polygons : []),
          rectangles: validateRectangles(tagged.rectangles != null ? tagged.rectangles : []),
        };
      default:
        throw new Error('Unknown export type: ' + tagged.type);
    }
  }

  if (Array.isArray(parsed)) {
    return { polygons: validatePolygons(parsed) };
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { polygons?: unknown; rectangles?: unknown };
    if (Array.isArray(obj.polygons)) {
      return {
        polygons: validatePolygons(obj.polygons),
        rectangles: Array.isArray(obj.rectangles) ? validateRectangles(obj.rectangles) : [],
      };
    }
    if (Array.isArray(obj.rectangles) && !Array.isArray(obj.polygons)) {
      return { rectangles: validateRectangles(obj.rectangles) };
    }
  }
  throw new Error('Expected tagged JSON (type: "polygons"|"rectangles"|"session") or legacy array / { polygons } / { rectangles }');
}

/** @deprecated Use importFromJSON. Parse JSON and return { polygons } only (legacy). */
export function importPolygonsFromJSON(jsonString: string): { polygons: Polygon[] } {
  const result = importFromJSON(jsonString);
  if (result.rectangles != null && result.polygons == null) {
    throw new Error('This file contains rectangles only. Use Import to load it.');
  }
  return { polygons: result.polygons || [] };
}
