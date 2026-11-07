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
- Single / double / triple / wedge / dative / wavy bonds, positive/negative charges, element stamps, R-group and ring templates.
- SMILES export through `Kekule.IO.saveFormatData(model, 'smi')`, stored in React state and copied to the clipboard.
- SMILES import with high-quality 2D coordinates, plus **Clean Up** (OpenChemLib is lazy-loaded as a helper because Kekule 1.0.4 ships a SMILES writer but no SMILES reader/layout engine).
- Open `.mol`, `.sdf`, `.cml`, `.rxn`, `.kcj`, `.json` and `.smi` files.
- Undo / redo, zoom, reset zoom, clear, keyboard shortcuts.
- Dark Kekule render theme (light atoms and bonds) and smoothed rendering with antialias + 2× oversampling.

## Project layout

```text
public/vendor/kekule/       Vendored Kekule.js 1.0.4 dist bundle + theme CSS (MIT)
src/components/             React shell: top bar, tool rail, element strip, editor
src/components/icons/       Custom SVG chemistry icons
src/lib/editorBridge.ts     Kekule composer lifecycle, tools, SMILES I/O, fit-to-view
src/lib/moleculeLayout.ts   Pure-JS fallback layout for coordinate-less structures
src/index.css               Tailwind entry + Kekule dark-shell overrides
```

## Kekule notes

- Kekule is loaded from a locally vendored copy of the official npm `dist` bundle (`kekule.min.js` 1.0.4), not a live CDN, so the editor works offline and the version is pinned.
- The Kekule 1.0.4 editor renders through its **Canvas2D** bridge by default (it can also use Raphael/SVG, but that is not the default editor path). To keep lines smooth we enable the renderer's `antialias` flag and a 2× `overSamplingRatio`, and set `bondLineWidth` to 1.5.
- Native Kekule chrome is removed in two layers: empty tool button arrays on the composer, and CSS that hides the top/left/bottom regions and advanced panel.
- The composer's `change` events drive the React empty-canvas hint; no DOM outside the host is managed by Kekule.

## Keyboard shortcuts

- `Ctrl/⌘ + Z` — undo
- `Ctrl/⌘ + Shift + Z` — redo
- `Enter` — load the SMILES in the top bar
