# Poly — Polygon to Rectangles

A web app that draws polygons and covers their interior with a minimal set of axis-aligned squares. You draw one or more polygons, then run a covering algorithm that fills them with a grid of small squares and merges adjacent blocks into larger squares to reduce the total count.

![[polygon-cover.png]]

## What it does

- **Draw polygons** — Add vertices by clicking; close a polygon by clicking near the first point or double-clicking.
- **Union** — Multiple polygons are combined (union) before covering, so overlapping or separate shapes become one region (with holes if needed).
- **Covering** — The app fills the region with a grid of squares (smallest side = *min square size*), then repeatedly merges adjacent *k×k* blocks into single larger squares (up to *max merge*). Larger *k* gives fewer, bigger squares but more work per step.
- **Animation** — The covering runs in steps so you see the grid appear and then blocks merge.

## Run it

**Prerequisites:** Node.js and npm.

```bash
npm install
npm run dev
```

Open the URL shown (usually `http://localhost:5173`) in a browser.

**Production build:**

```bash
npm run build
npm run preview
```

## How to use

| Control | Action |
|--------|--------|
| **Draw** | Toggle draw mode. When on (button highlighted), clicks on the canvas add vertices to the current polygon. |
| **Close polygon** | Close the current polygon (or click near the first vertex / double-click in draw mode). |
| **New polygon** | Finish the current polygon and start a new one (current is kept if it has at least 3 points). |
| **Run covering** | Run the covering algorithm on all closed polygons (and the current one if it has ≥3 points). |
| **Min square size** | Smallest grid cell side (1–200). Smaller = finer grid, more squares before merging. |
| **Max merge (k×k)** | Largest merge block size (2–50). Larger = fewer, bigger squares; more merge steps. |
| **Squares** | Shows the current number of covering rectangles. |
| **Clear all** | Remove all polygons and covering results. |

**Viewport:**

- **Zoom** — Mouse wheel (centered on cursor).
- **Pan** — Hold **Space** and drag.

## Tech

- **Vite** — Dev server and build.
- **martinez-polygon-clipping** — Polygon union for combining multiple shapes and handling holes.
- **Canvas 2D** — Drawing and pan/zoom in world coordinates.
