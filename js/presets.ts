/**
 * Preset polygon shapes loadable via the Samples dropdown.
 * Each preset is { id, name, polygons } where polygons is Array<Array<{x,y}>>.
 * Coordinates are chosen to be visible at default view and work with min square size ~4.
 */

import type { Preset } from './types.js';

export const PRESETS: Preset[] = [
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
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < points * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (Math.PI * 2 * i) / (points * 2) - Math.PI / 2;
          pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        return pts;
      })(),
    ],
  },
  // --- Larger / more complex examples ---
  {
    id: 'hexagon',
    name: 'Hexagon',
    polygons: [
      (() => {
        const cx = 60;
        const cy = 55;
        const r = 50;
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i) / 6 - Math.PI / 6;
          pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        return pts;
      })(),
    ],
  },
  {
    id: 'octagon',
    name: 'Octagon',
    polygons: [
      (() => {
        const cx = 55;
        const cy = 55;
        const r = 48;
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8 - Math.PI / 8;
          pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        return pts;
      })(),
    ],
  },
  {
    id: 'cross',
    name: 'Cross',
    polygons: [
      [
        { x: 35, y: 0 },
        { x: 85, y: 0 },
        { x: 85, y: 35 },
        { x: 120, y: 35 },
        { x: 120, y: 85 },
        { x: 85, y: 85 },
        { x: 85, y: 120 },
        { x: 35, y: 120 },
        { x: 35, y: 85 },
        { x: 0, y: 85 },
        { x: 0, y: 35 },
        { x: 35, y: 35 },
      ],
    ],
  },
  {
    id: 'gear',
    name: 'Gear (12-tooth)',
    polygons: [
      (() => {
        const cx = 60;
        const cy = 60;
        const teeth = 12;
        const outerR = 52;
        const innerR = 42;
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < teeth * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (Math.PI * 2 * i) / (teeth * 2) - Math.PI / 2;
          pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        return pts;
      })(),
    ],
  },
  {
    id: 'house',
    name: 'House',
    polygons: [
      [
        { x: 20, y: 100 },
        { x: 60, y: 30 },
        { x: 100, y: 100 },
        { x: 95, y: 100 },
        { x: 95, y: 70 },
        { x: 25, y: 70 },
        { x: 25, y: 100 },
      ],
    ],
  },
  {
    id: 'arrow',
    name: 'Arrow',
    polygons: [
      [
        { x: 0, y: 45 },
        { x: 50, y: 45 },
        { x: 50, y: 20 },
        { x: 100, y: 55 },
        { x: 50, y: 90 },
        { x: 50, y: 65 },
      ],
    ],
  },
  {
    id: 'ushape',
    name: 'U-shape',
    polygons: [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 60, y: 80 },
        { x: 60, y: 35 },
        { x: 40, y: 35 },
        { x: 40, y: 80 },
        { x: 0, y: 80 },
      ],
    ],
  },
  {
    id: 'blob',
    name: 'Irregular blob',
    polygons: [
      [
        { x: 45, y: 5 },
        { x: 95, y: 25 },
        { x: 90, y: 55 },
        { x: 110, y: 85 },
        { x: 75, y: 95 },
        { x: 50, y: 75 },
        { x: 25, y: 90 },
        { x: 5, y: 60 },
        { x: 15, y: 35 },
        { x: 30, y: 20 },
      ],
    ],
  },
  {
    id: 'star8',
    name: '8-point star',
    polygons: [
      (() => {
        const cx = 55;
        const cy = 55;
        const outerR = 50;
        const innerR = 22;
        const points = 8;
        const pts: { x: number; y: number }[] = [];
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
