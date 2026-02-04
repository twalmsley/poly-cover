/**
 * Shared types for polygon/rectangle geometry and app state.
 */

export interface Point {
  x: number;
  y: number;
}

/** Polygon: array of points (closed ring). */
export type Polygon = Point[];

/** Rectangle: x, y, w, h (or width/height for compatibility). */
export interface Rectangle {
  x: number;
  y: number;
  w: number;
  h: number;
  width?: number;
  height?: number;
}

/** Region with optional holes (exterior + holes). */
export interface Region {
  exterior: Point[];
  holes?: Point[][];
}

/** World-space axis-aligned bounding box. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box as { x, y, w, h }. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Undo/redo entry kinds. */
export type UndoEntry =
  | { type: 'add_point'; point: Point }
  | { type: 'close_polygon' }
  | { type: 'delete_polygon'; index: number; points: Point[] };

/** App state shape. */
export interface AppState {
  polygons: Polygon[];
  currentPolygon: Polygon | null;
  rectangles: Rectangle[];
  remaining: Polygon[];
  coveringIteration: number;
  drawMode: boolean;
  editMode: boolean;
  coveringRunning: boolean;
  coveringPaused: boolean;
  spaceDown: boolean;
  selectedPolygonIndex: number | null;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
}

/** Import result: optional polygons and/or rectangles. */
export interface ImportResult {
  polygons?: Polygon[];
  rectangles?: Rectangle[];
}

/** Covering generator yield value. */
export interface CoveringStep {
  rectangles: Rectangle[];
  remaining: Polygon[];
  iteration: number;
}

/** Covering shape strategy: squares (k×k only) or rectangles (any w×h merge). */
export type CoveringShape = 'squares' | 'rectangles';

/** Preset: id, name, polygons. */
export interface Preset {
  id: string;
  name: string;
  polygons: Polygon[];
}
