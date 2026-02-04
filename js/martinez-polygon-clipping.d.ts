/** Minimal typings for martinez-polygon-clipping union usage. */
declare module 'martinez-polygon-clipping' {
  /** GeoJSON-style ring: array of [x, y] */
  type Ring = number[][];
  /** Polygon: array of rings (exterior + holes) */
  type Polygon = Ring[];
  /** MultiPolygon: array of polygons */
  type MultiPolygon = Polygon[];

  export function union(
    polygon1: Polygon | MultiPolygon,
    polygon2: Polygon | MultiPolygon
  ): Polygon | MultiPolygon | null;
}
