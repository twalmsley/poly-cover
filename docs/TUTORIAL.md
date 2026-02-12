# Poly Tutorial

This tutorial walks you through **Poly** from first run to exporting results. You’ll draw polygons, run the covering algorithm, tune parameters, and use samples and export.

---

## Table of contents

1. [Prerequisites and running the app](#1-prerequisites-and-running-the-app)
2. [Your first polygon](#2-your-first-polygon)
3. [Multiple polygons and union](#3-multiple-polygons-and-union)
4. [Covering parameters](#4-covering-parameters)
5. [Editing and refining](#5-editing-and-refining)
6. [Export and import](#6-export-and-import)
7. [Samples and viewport](#7-samples-and-viewport)
8. [Tips and shortcuts](#8-tips-and-shortcuts)

---

## 1. Prerequisites and running the app

**You need:** Node.js and npm.

```bash
npm install
npm run dev
```

Open the URL in your browser (usually `http://localhost:5173`).

You’ll see:

- **Header** — Toolbar with Draw, Close, Undo, Redo, New polygon, Delete, Edit, Run, Export, Samples, Import, Paste, Reset zoom, Clear, Help.
- **Canvas** — Main drawing area (zoom with mouse wheel, pan with **Space** + drag).
- **Footer** — Covering options (shape, min cell size, snap, max k, min k, speed, instant run) and live stats.

---

## 2. Your first polygon

### Step 1: Enter draw mode

- Click the **Draw** button in the toolbar (or press **D**).
- The button stays highlighted; the canvas is ready for new vertices.

### Step 2: Add vertices

- Click on the canvas to place the first point.
- Click again for the second, third, and so on.
- You need at least **3 points** to form a polygon.

### Step 3: Close the polygon

You can close in any of these ways:

- Click the **Close** button.
- Click **near the first vertex** (within the snap distance).
- **Double-click** to close at the last clicked position.

The polygon is now closed and can be selected, edited, or used for covering.

### Step 4: Run the covering

- Click **Run** (or press **R**).
- The algorithm fills the polygon with a grid, then merges adjacent blocks into larger squares (or rectangles/circles, depending on **Covering shape** in the footer).
- Watch the animation; use **R** again to **Pause** or **Resume**.
- When finished, the footer shows **Shapes**, **Iterations**, **Polygon area**, **Covered area**, and **Efficiency**.

**Try it:** Draw a simple triangle or rectangle, close it, then press **R** to see the covering in action.

---

## 3. Multiple polygons and union

You can draw several polygons. Before covering, Poly **unions** them into one region (overlapping areas are merged; separate shapes become one region, with holes where they don’t overlap).

### Adding another polygon

1. With at least one closed polygon already on the canvas, click **New polygon** (or **N**).
2. The current polygon is kept; you start a new one.
3. Click to add vertices, then close as before (Close button, click near first point, or double-click).
4. Repeat for more polygons if you like.

### Running covering on all polygons

- Click **Run** (or **R**). The covering runs on the **union** of all closed polygons (and the current open polygon if it has ≥3 points).
- The result is one set of shapes covering the combined region.

**Try it:** Load **Samples → L-shape**, then run covering. Or draw two overlapping rectangles, then run to see the union and merged covering.

---

## 4. Covering parameters

These are in the **footer**. They control how fine the grid is and how aggressively blocks are merged.

| Parameter | What it does |
|-----------|----------------|
| **Covering shape** | **Squares** — axis-aligned squares only. **Rectangles** — axis-aligned rectangles (allows different width/height). **Circles** — circles (different packing). |
| **Min cell size** | Side length of the smallest grid cell (1–200). Smaller = finer grid, more cells before merging, potentially more final shapes. |
| **Snap to grid** | When drawing, new vertices snap to a grid whose step equals min cell size. Helps align with the covering grid. |
| **Max k** | Largest merge block size (e.g. 128 means try merging 128×128 cells). Larger max k → fewer, bigger blocks but more work per step. |
| **Min k** | Smallest k used when halving (e.g. 2). Merge tries k = max k, max k/2, … down to min k. |
| **Speed** | Animation step delay: **Slow**, **Normal**, or **Fast**. |
| **Run without animation** | Run covering to completion without stepping; button shows “Computing…” until done. |

**Practical tips:**

- Start with **Min cell size** 4–8 and **Max k** 128; adjust min size smaller for more detail.
- Enable **Snap to grid** if you want vertices aligned to the covering grid.
- Use **Run without animation** for large or complex shapes when you only care about the result.

---

## 5. Editing and refining

### Selecting a polygon

- **Exit draw mode** (click Draw again or press **D** so it’s not highlighted).
- Click on a **closed polygon** to select it (it highlights).

### Editing vertices

- With a polygon selected, click **Edit** (or double-click the polygon).
- Vertices become visible; you can drag them to move.
- Click **Close** (or click near first vertex / double-click) when done to close again.

### Deleting

- Select a polygon, then click **Delete** or press **Delete** / **Backspace**.

### Undo / Redo

- **Ctrl+Z** (⌘+Z on Mac) — Undo last vertex or close.
- **Ctrl+Shift+Z** (⌘+Shift+Z on Mac) — Redo.

While drawing, **Backspace** removes the last vertex.

---

## 6. Export and import

### Export (dropdown in toolbar)

- **Copy** or **download** in several formats:
  - **Polygons (JSON)** — Polygon data only.
  - **Rectangles (JSON)** — Covering result (squares/rectangles/circles) as JSON.
  - **Rectangles (code)** — Result as code (e.g. for use in a program).
  - **Rectangles (SVG)** — Result as an SVG file.
  - **Export all (JSON)** — Polygons and covering result together.

Run covering first if you want the export to include the current covering result.

### Import and paste

- **Import** — Choose a JSON file (e.g. a previously exported “Polygons” or “Export all” file).
- **Paste** — Paste JSON from the clipboard. Useful to duplicate or share polygons.

---

## 7. Samples and viewport

### Samples

- Use the **Samples** dropdown to load built-in shapes (e.g. Rectangle, L-shape, Star).
- This replaces the current canvas; use **Clear all** first if you want to start clean, or just pick a sample to explore.

### Viewport

- **Zoom** — Mouse wheel (zooms toward the cursor).
- **Pan** — Hold **Space** and drag.
- **Fit view** — **Home** or the **Reset zoom** button fits the content to about 90% of the visible canvas.

---

## 8. Tips and shortcuts

- **D** — Toggle draw mode.  
- **R** — Run covering / Pause / Resume.  
- **N** — New polygon (after current has ≥3 points).  
- **Escape** — Cancel drawing or close.  
- **Backspace** (while drawing) — Remove last vertex.  
- **Delete** / **Backspace** (with polygon selected) — Delete polygon.  
- **Ctrl+Z** / **Ctrl+Shift+Z** — Undo / Redo.  
- **Space** — Pan.  
- **Home** — Fit view.

For the full list, click the **?** (Help) button in the toolbar.

---

## Next steps

- Try different **Covering shape** (Squares, Rectangles, Circles) on the same polygon to compare results.
- Load a **Sample**, run covering, then **Export → Rectangles (code)** or **SVG** to use the output elsewhere.
- Draw a complex multi-part shape, use **Snap to grid** and **Min cell size** to match your target grid, then run and export.

For a quick reference of the UI and options, see the main [README](../README.md).
