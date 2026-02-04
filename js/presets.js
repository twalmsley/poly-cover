/**
 * Preset polygon shapes loadable via the Samples dropdown.
 * Each preset is { id, name, polygons } where polygons is Array<Array<{x,y}>>.
 * Coordinates are chosen to be visible at default view and work with min square size ~4.
 */

/** @type {Array<{ id: string, name: string, polygons: Array<Array<{x: number, y: number}>> }>} */
export const PRESETS = [
  {
    id: 'rectangle',
    name: 'Rectangle',
    polygons: [
      [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 60 },
        { x: 0, y: 60 },
      ],
    ],
  },
  {
    id: 'lshape',
    name: 'L-shape',
    polygons: [
      [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 30 },
        { x: 40, y: 30 },
        { x: 40, y: 60 },
        { x: 0, y: 60 },
      ],
    ],
  },
  {
    id: 'star',
    name: 'Star',
    polygons: [
      (() => {
        const cx = 50;
        const cy = 50;
        const outerR = 45;
        const innerR = 18;
        const points = 5;
        const pts = [];
        for (let i = 0; i < points * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (Math.PI * 2 * i) / (points * 2) - Math.PI / 2;
          pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        return pts;
      })(),
    ],
  },
];
