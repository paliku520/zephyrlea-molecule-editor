# Zephyrlea · Molecule Editor

A dark, canvas-first molecule editor shell built with **React 19 + Tailwind CSS 4** and **Kekule.js 1.0.4**.

This is the first delivery: the full editor layout, a live Kekule composer, working drawing tools, SMILES import/export and Clean Up. The 3D preview is intentionally a placeholder for the next stage.

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## What works

- Full-bleed Kekule `Composer` mounted from React with all native Kekule toolbars hidden.
- Custom React/Tailwind top bar, element strip and vertical tool rail.
- Tool switching through Kekule's interaction-controller API (`MolBondIaController`, `MolRingIaController`, `MolNodeChargeIaController`, `SelectIaController`, …).
- Single / double / triple / solid wedge / hashed wedge / dative / wavy bonds, positive/negative charges (drawn as circled +/− badges), element stamps, R-group and ring templates.
- Element tools both insert and replace: after picking an element, clicking empty canvas inserts a new atom, while clicking an existing atom **replaces its element in place** (bonds and neighbours untouched, undoable).
- SMILES export through `Kekule.IO.saveFormatData(model, 'smi')`, stored in React state and copied to the clipboard.
- SMILES import with high-quality 2D coordinates, plus **Clean Up** (OpenChemLib is lazy-loaded as a helper because Kekule 1.0.4 ships a SMILES writer but no SMILES reader/layout engine).
- Clean Up re-lays out coordinates and **moves** the scattered structures to the middle of the screen: they are packed into tidy rows (top-to-bottom, left-to-right, rows balanced and vertically centred, even spacing) around the current viewport centre. The zoom level is kept; it only shrinks when the packed block cannot fit. A single structure that is already on screen is never moved, only its bond geometry is fixed.
- Open `.mol`, `.sdf`, `.cml`, `.rxn`, `.kcj`, `.json` and `.smi` files.
- Undo / redo, zoom, reset zoom, clear, keyboard shortcuts.
- A practically endless canvas: the drawing surface is far larger than the viewport, and panning near its border silently moves the whole drawing back to the middle, so you can keep panning in any direction while nothing is ever drawn outside the canvas.
- One theme color: `--color-accent` (`#89B5FA`) in `src/index.css` drives the export button, input focus ring, toast icons and the R-group button.
- Dark Kekule render theme (light atoms and bonds) and smoothed rendering with antialias + 2× oversampling.
- The element / group picker and label box that open when you double-click an atom are re-skinned for the dark shell (tabs, element chips, dropdown arrow, scrollbar). The predefined substituents in the group tab also get Chinese names (`Me 甲基`, `Ph 苯基`, `OTs 对甲苯磺酰氧基`, …) and Chinese tooltips; picking one expands it into the real structure instead of leaving a `Ph` / `NO2` abbreviation, so its atoms stay editable. The double click no longer leaves the floating action bar in front of the popup.
- Element-coloured atom labels: N blue, O red, S yellow, P orange, halogens green/violet, sharing one palette with the element strip; the carbon skeleton stays neutral and hover/selection markers use the theme accent.
- Bond stroke width and multiple-bond spacing scale with the bond length, so lines stay visible when zoomed in.
- Double bonds are styled per context: inside a ring the second line is drawn on the ring side and shortened to 72%, so it never merges with the neighbouring bond or overshoots a vertex; outside rings the original look is kept, with two equal-length parallel lines spanning both atoms.
- Select and Lasso are two distinct tools: **Select** marquees with a rectangle (a plain click picks a single atom or bond, Shift appends), **Lasso** draws a free-hand polygon. Both share `SelectIaController` and only differ in `SelectMode` (`RECT` / `POLYGON`).
- A floating action bar appears above the selection with the object count plus rotate −15° / +15°, flip horizontally, flip vertically and delete.
- The selection box deliberately **cannot be stretched or scaled from its handles** (that would distort bond lengths and angles): only dragging to move and the rotation region outside the box stay active, and pinch-scaling of a selection is disabled too. Use the top-bar zoom buttons to change the view scale.

## Project layout

```text
public/vendor/kekule/       Vendored Kekule.js 1.0.4 dist bundle + theme CSS (MIT)
src/components/             React shell: top bar, tool rail, element strip, editor
src/components/icons/       Custom SVG chemistry icons
src/lib/editorBridge.ts     Kekule composer lifecycle, tools, SMILES I/O, fit-to-view
src/lib/editorBoard.ts      Surface sizing, endless panning (content re-anchor) and zoom re-centering
src/lib/kekuleSpace.ts      Kekule space helpers (molecules, bounding box, scroller, scale)
src/lib/kekuleBondStyle.ts  Render patch: bond stroke width, double-bond spacing/side
src/lib/moleculeLayout.ts   Pure-JS fallback layout for coordinate-less structures
src/index.css               Tailwind entry + Kekule dark-shell overrides
```

## Kekule notes

- Kekule is loaded from a locally vendored copy of the official npm `dist` bundle (`kekule.min.js` 1.0.4), not a live CDN, so the editor works offline and the version is pinned.
- The Kekule 1.0.4 editor renders through its **Canvas2D** bridge by default (it can also use Raphael/SVG, but that is not the default editor path). To keep lines smooth we enable the renderer's `antialias` flag and a 2× `overSamplingRatio`, and set `bondLineWidth` to 1.5.
- Native Kekule chrome is removed in two layers: empty tool button arrays on the composer, and CSS that hides the top/left/bottom regions and advanced panel.
- Kekule's built-in CPK palette assumes white paper (black carbon, navy nitrogen), so it is replaced with a dark-canvas palette (see `src/lib/elementColors.ts`). Kekule also centres a label's full line box on the atom, which lifts capital glyphs off the vertex, so text is drawn 0.15em lower (`src/lib/kekuleLabelStyle.ts`).
- On startup and after clearing, the viewport is centered on the drawing surface, and the surface is grown to cover the viewport so panning works in every direction instead of being stuck at an edge. Window resizes keep the current scroll position.
- Endless canvas: the surface spans 4× the viewport (minimum 2600, capped at 4608 rendered px per side so the three canvas layers stay within a sane memory budget). When the view gets close to a border, the whole drawing is moved back to the middle of the surface with the scroll compensated, so the picture does not change but panning can continue in any direction. The structure always stays inside the canvas: new room is added first, and once the memory cap is reached panning simply stops in that direction.
- Zooming (buttons, double click or gestures) re-anchors the drawing in the middle of the surface with the same scroll compensation, so panning stays available at every zoom level, and the surface is re-sized for the new zoom instead of growing without bound.
- The composer's `change` events drive the React empty-canvas hint; no DOM outside the host is managed by Kekule.

## Keyboard shortcuts

- `Ctrl/⌘ + Z` — undo
- `Ctrl/⌘ + Shift + Z` — redo
- `Enter` — load the SMILES in the top bar
