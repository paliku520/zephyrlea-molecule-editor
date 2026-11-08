# Zephyrlea · Molecule Editor

A dark, canvas-first molecule editor shell built with **React 19 + Tailwind CSS 4** and **Kekule.js 1.0.4**.

This is the first delivery: the full editor layout, a live Kekule composer, working drawing tools, SMILES import/export, Clean Up and a fully local 3D preview.

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
- **Header**: a slim band pinned to the very top holds the product name `ZephyrLea's Molecular Editor`, an **About** button right next to it, and a **GitHub** button on the right that opens the `paliku520/zephyrlea-molecule-editor` repository in a new tab. It stays at the top whatever the toolbar position (top / bottom) is set to.
- **About dialog**: the About button opens a modal with the pitch, the core tech stack, the MIT license and the author. **View full license** renders the bundled `LICENSE` text inside the dialog, so the license can be read right in the web page without leaving the app; `Esc`, the backdrop and the Close button dismiss it, and the footer links to the GitHub repository.
- Tool switching through Kekule's interaction-controller API (`MolBondIaController`, `MolRingIaController`, `MolNodeChargeIaController`, `SelectIaController`, …).
- Single / double / triple / solid wedge / hashed wedge / dative / wavy bonds, positive/negative charges (drawn as circled +/− badges), element stamps, R-group and ring templates.
- Element tools both insert and replace: after picking an element, clicking empty canvas inserts a new atom, while clicking an existing atom **replaces its element in place** (bonds and neighbours untouched, undoable).
- SMILES export through `Kekule.IO.saveFormatData(model, 'smi')`, stored in React state and copied to the clipboard.
- **Molecule analysis (RDKit)**: every structure on the canvas is analysed automatically with RDKit (the `@rdkit/rdkit` WebAssembly build) — **Hill formula** (implicit hydrogens and net charge included), molecular weight, exact mass, heavy / total atom counts, bond count, ring count, rotatable bonds, H-bond donors / acceptors, TPSA and cLogP, plus RDKit's canonical SMILES (one click copies it). Results live in the **Molecule analysis** panel on the right, one card per structure; clicking a card header collapses it to a single line with just the formula and mass, and the panel scrolls when several structures are drawn.
- **Structure validation (RDKit)**: the same pass also checks valences, shown in the **Structure check** block of the panel (the whole panel collapses to a narrow rail). A valence problem (e.g. a five-valent carbon) lists a Chinese explanation plus RDKit's raw message, draws a red ring around the offending atom on the canvas and disables **Clean Up structure** and **View in 3D** until the structure is fixed; other chemistry notes are listed separately and never disable the buttons.
- **3D view**: **View in 3D** opens a modal that builds a 3D conformer on the fly from the canvas SMILES with a local WASM engine (`sci-form-wasm`, fixed seed so a structure always yields the same conformer) and renders it with 3Dmol.js — double and triple bonds get two / three parallel cylinders and aromatic rings get the solid line plus a dashed big-π line inside the ring. All structures on the canvas are embedded separately and merged side by side into one model, so a multi-structure drawing is fully visible (the header shows "N structures · M atoms · K bonds"). A single toolbar docked at the bottom of the window holds the **model style** switch (ball-and-stick / space-filling / stick / wireframe), the **drag mode** (rotate structures / move camera), **reset view** and **maximize**; it is **centred** by default and can be moved left or right in the settings. While maximized, `Esc` restores the window first and a second press closes the dialog. The style can also be changed from the settings modal and the two stay in sync. The background follows the theme (dark `#171717` / light `#ffffff`), drag rotates and the wheel zooms, and the corner carries the note "当前 3D 构象由本地算法生成，仅供参考" (the conformer is locally generated and indicative only). Closing the dialog destroys the viewer, so reopening never stacks canvases or leaks GPU memory. It stays shut when the canvas is empty or the structure has a valence error. No PubChem or other network call is involved — the whole computation runs in the browser.
- SMILES import with high-quality 2D coordinates — generated there and then, not on every later action (OpenChemLib is lazy-loaded as a helper because Kekule 1.0.4 ships a SMILES writer but no SMILES reader/layout engine).
- **Clean Up view** (wand icon): the scattered structures are **moved** into tidy rows (top-to-bottom, left-to-right, rows balanced and vertically centred, even spacing) and the whole block is then zoomed to fill about 70–80% of the canvas and centred. It only translates whole structures — it **never recomputes an atom coordinate** and never loads OpenChemLib; three structures take about 130 ms, and a "正在整理视图…" progress toast is shown while it runs.
- **Clean Up structure** (grid icon): OpenChemLib regenerates each structure's 2D coordinates (normalising bond lengths and angles, falling back to a pure-JS layout) — it does **not** pack structures and does **not** touch the camera; arranging and fitting stay with **Clean Up view**. It is disabled while a valence error is reported; **Clean Up view** still works. The first call downloads the OpenChemLib chunk, with a "正在整理结构…" progress toast.
- Open `.mol`, `.sdf`, `.cml`, `.rxn`, `.kcj`, `.json` and `.smi` files.
- Undo / redo, zoom, reset zoom, clear, keyboard shortcuts.
- Canvas zoom is clamped to 20%–800% (Kekule itself has no bounds): once a limit is reached further clicks change nothing and the matching zoom button in the top bar becomes disabled. Buttons, wheel and gestures all share the same clamp, and Reset Zoom and Clean Up pick their ratio inside that range — the 800% ceiling is what lets a small molecule fill the canvas, the 20% floor is what keeps a hundred-atom structure inside it.
- A practically endless canvas: the drawing surface is far larger than the viewport, and panning near its border silently moves the whole drawing back to the middle, so you can keep panning in any direction while nothing is ever drawn outside the canvas.
- **Board persistence**: structures, their relative placement, the zoom level and the pan position are auto-saved to `localStorage` (`zephyrlea.board`) and restored verbatim on reload, down to the same zoom and viewport position. **Clear** also drops the stored drawing, so it does not come back after a refresh.
- One theme color: `--color-accent` (`#89B5FA` in the dark theme) in `src/index.css` drives the export button, input focus ring, toast icons and the R-group button.
- The **Settings** button opens a modal whose five rows stay one line each: the **dark / light** theme switch, a **toolbar position** choice (bottom / top, default **bottom**), the **3D model style** (ball-and-stick / space-filling / stick / wireframe, default **ball-and-stick**), the **3D toolbar position** (left / centre / right, default **centre**) and a **hide carbon/hydrogen atoms** toggle. Each row keeps a single short caption and moves the longer explanation into a hover tooltip; both 3D settings are rows of icon buttons whose names appear on hover. The theme covers the whole shell, the Kekule canvas (atom/bond colours and the element palette) and the Kekule popups; hiding carbon/hydrogen draws a skeletal structure (carbons unlabelled, hydrogens only where needed), while turning it off labels every carbon and hydrogen count. Settings persist in `localStorage`.
- The chrome is **docked at the bottom by default**: the canvas sits flush with the top of the window, and below it come the element strip (C / H / N / O…, its menu opens upwards), the drawing tool rail (one horizontal strip that wraps on narrow windows) and the action bar (SMILES / Clean Up view / Clean Up structure / zoom / export / settings) — a much shorter pointer trip on tall screens. Choosing "top" restores the classic top bar + left rail layout. The floating selection bar and toasts keep clear of the docked chrome.
- Dark Kekule render theme (light atoms and bonds) and smoothed rendering with antialias + 2× oversampling.
- The atom label box that opens on a double click is re-skinned for the dark shell (element chips, dropdown arrow, scrollbar). It only offers atoms (elements and the R group) — the built-in `Ph` / `NO2` substituent templates are gone, because keeping those abbreviation structures in sync with the rest of the editor is not worth the maintenance; draw the structure instead. **R groups are editable the same way**: double-clicking an `R` on the canvas opens the label box, so `R`, `R1`, `R2` … can be typed to rename it (it stays an R group, still written as `*` in SMILES), while typing an element symbol replaces the R with that atom in place. The double click no longer leaves the floating action bar in front of the popup.
- **Periodic table**: the "元素周期表…" item at the bottom of the element strip's "其他" menu and the "…" button of the label box dropdown open the same hand-drawn table, replacing Kekule's native dialog that ignored the app theme. All 118 elements use the standard long form, every cell is the same size with its symbol centred and the atomic number in the corner, the f-block placeholders (`57-71`, `89-103`) sit in line with the rest of their row, colours match the canvas labels, the current element is highlighted, and the dialog stacks above Kekule's popups so the atom label box never covers it. Picking from the strip only switches the element tool, picking from the label box replaces that atom on the spot. `Esc`, the backdrop and the cancel button close it, and it follows both themes.
- That double-click popup is limited to the **Select / Lasso** tools. With a tool that acts on every click (charge, element, bond, eraser), clicking the same atom twice quickly just repeats the action — e.g. two taps give a `2+` atom — instead of opening the picker.
- Element-coloured atom labels: N blue, O red, S yellow, P orange, halogens green/violet, sharing one palette with the element strip; the carbon skeleton stays neutral and hover/selection markers use the theme accent.
- Charged atoms (ions) render as "element symbol + superscript charge" (`C⁺`, `CH₃⁺`, `NH₂⁺`, `O⁻`) instead of a charge mark floating next to the atom: the charge/radical is folded into the atom label, the label always stays horizontal, and carbons that are normally left unlabelled show their symbol once they carry a charge.
- Bond stroke width and multiple-bond spacing scale with the bond length, so lines stay visible when zoomed in.
- Double bonds are styled per context: inside a ring the second line is drawn on the ring side and shortened to 72%, so it never merges with the neighbouring bond or overshoots a vertex; outside rings the original look is kept, with two equal-length parallel lines spanning both atoms.
- Select and Lasso are two distinct tools: **Select** marquees with a rectangle (a plain click picks a single atom or bond, Shift appends), **Lasso** draws a free-hand polygon. Both share `SelectIaController` and only differ in `SelectMode` (`RECT` / `POLYGON`).
- A floating action bar appears above the selection with the object count plus rotate −15° / +15°, flip horizontally, flip vertically and delete.
- The selection box deliberately **cannot be stretched or scaled from its handles** (that would distort bond lengths and angles): only dragging to move and the rotation region outside the box stay active, and pinch-scaling of a selection is disabled too. Use the top-bar zoom buttons to change the view scale.

## Project layout

```text
public/vendor/kekule/       Vendored Kekule.js 1.0.4 dist bundle + theme CSS (MIT)
src/components/             React shell: top bar, tool rail, element strip, editor
src/components/AppHeader.tsx  Header: title, About entry and GitHub link
src/components/AboutModal.tsx About dialog: pitch, tech stack, full MIT license, author (`LICENSE?raw` inlined)
src/components/icons/       Custom SVG chemistry icons
src/lib/editorBridge.ts     Kekule composer lifecycle, tools, SMILES I/O, fit-to-view
src/lib/editorBoard.ts      Surface sizing, endless panning (content re-anchor) and zoom re-centering
src/lib/kekuleSpace.ts      Kekule space helpers (molecules, bounding box, scroller, scale)
src/lib/kekuleBondStyle.ts  Render patch: bond stroke width, double-bond spacing/side
src/lib/kekuleElectronLabel.ts  Render patch: fold charges/radicals into atom labels
src/lib/kekuleNodeSetter.ts  R-group double-click label editing, atoms-only picker and the periodic-table takeover
src/lib/periodicTable.ts    Element symbols and the standard long-form layout (118 elements)
src/components/PeriodicTableModal.tsx  Hand-drawn periodic table dialog shared by the strip and the label box
src/lib/elementColors.ts    Dark and light element palettes (shell + canvas)
src/lib/settings.ts         Settings model, localStorage persistence, theme application
src/lib/site.ts             Shared repository link (header + about dialog)
src/lib/boardPersistence.ts Board auto-save / restore (molblocks, atom coords, zoom and viewport)
src/lib/rdkit.ts  RDKit WASM loader, formula / descriptor analysis, chemistry-problem detection, dev self-test
src/lib/structureValidation.ts  Analysis + validation model, valence classification, Chinese copy
src/lib/conformer3d.ts      sci-form-wasm loader, 3D conformer generation, molblock serialization
src/components/SettingsModal.tsx  Settings modal (theme switch, 3D model style, hide C/H atoms)
src/components/Model3DSwitch.tsx  Icon-only 3D style picker for the settings modal
src/components/Viewer3DToolbar.tsx  Docked 3D toolbar (model style + drag mode + reset view + maximize)
src/components/ui/IconRadioGroup.tsx  Icon radio group and its bordered frame shared by both 3D settings
src/components/Viewer3DModal.tsx  3D view modal (3Dmol.js ball-and-stick / space-filling / stick / wireframe)
src/components/AnalysisPanel.tsx  Right-hand "Molecule analysis" panel (collapsible cards + structure check)
src/components/ValidationOverlay.tsx  Red-ring overlay marking problem atoms
src/lib/moleculeLayout.ts   Pure-JS fallback layout for coordinate-less structures
src/index.css               Tailwind entry + Kekule dark-shell overrides
```

## Kekule notes

- Kekule is loaded from a locally vendored copy of the official npm `dist` bundle (`kekule.min.js` 1.0.4), not a live CDN, so the editor works offline and the version is pinned.
- The Kekule 1.0.4 editor renders through its **Canvas2D** bridge by default (it can also use Raphael/SVG, but that is not the default editor path). To keep lines smooth we enable the renderer's `antialias` flag and a 2× `overSamplingRatio`, and set `bondLineWidth` to 1.5.
- Native Kekule chrome is removed in two layers: empty tool button arrays on the composer, and CSS that hides the top/left/bottom regions and advanced panel.
- Both themes key off `<html data-theme="dark|light">`, which redefines a set of `--shell-*` CSS variables. `src/index.css` maps them to Tailwind colors with `@theme inline` (`bg-panel`, `text-ink`, `border-line`, …), so switching the theme needs no component changes. `index.html` reads the stored setting before first paint so there is no flash.
- When the theme changes, `editorBridge.applySettings()` rewrites Kekule's render configs (atom/bond/glyph colors, element palette, selection markers) and repaints; carbon/hydrogen visibility is driven by `defMoleculeDisplayType` (`SKELETAL` / `CONDENSED`) and `defHydrogenDisplayLevel` (`DEFAULT` / `ALL`).
- Kekule's `BaseEditorIaController` answers a double click under *any* tool and opens the inline atom/label setter. That handler is overridden so only `SelectIaController` (Select / Lasso) gets through; with other tools the double click stays with the tool itself (e.g. two quick taps adding two charges).
- Kekule's built-in CPK palette assumes white paper (black carbon, navy nitrogen), so it is replaced with a dark-canvas palette (see `src/lib/elementColors.ts`). Kekule also centres a label's full line box on the atom, which lifts capital glyphs off the vertex, so text is drawn 0.15em lower (`src/lib/kekuleLabelStyle.ts`).
- Kekule draws formal charges/radicals as separate `ChemMarker` objects parked in the "emptiest" direction around an atom, and leaves unlabelled carbons without a symbol — a cation ends up as a lone floating "+". `src/lib/kekuleElectronLabel.ts` disables that auto-marker creation, folds the state into the atom label as a superscript (hydrogens first, so `CH₃⁺` rather than `C⁺H₃`), forces the label to be drawn and laid out horizontally for charged atoms, and suppresses markers that are already represented by the label.
- On startup and after clearing, the viewport is centered on the drawing surface, and the surface is grown to cover the viewport so panning works in every direction instead of being stuck at an edge. Window resizes keep the current scroll position.
- An R group is a `Kekule.SubGroup` in Kekule (`RGroup` is only an alias), which caused two problems: no setter is registered for it, so double-clicking did nothing, and a `SubGroup` that is *expanded* has no atoms to draw and disappears completely. `src/lib/kekuleNodeSetter.ts` registers the atom setter for sub groups and rewrites the entered label (`R`, `R1` …) back into `abbr`, so an R group can be renamed on double click or replaced by an element in place; `expandCollapsedGroups()` in `editorBridge.ts` only expands sub groups that actually contain atoms, keeping R groups collapsed so their label is drawn. The predefined substituent templates (`Ph`, `NO2` …) are no longer offered in the picker.
- The "…" (more) button of the double-click panel used to open Kekule's own periodic table window, which ignored the app's dark / light theme. `installPeriodicTablePicker()` overrides `StructureNodeSelectPanel._openPeriodicTableDialog` so plain element picks are handled by the React table (`PeriodicTableModal`); the choice still goes through Kekule's `doValueChanged()`, so it reaches `applySetter` exactly like the native flow and in-place replacement plus undo keep working. Only the variable-atom lists (`isVarList` / `isVarNotList`), which need multi-select, keep the native window. React receives the request through `EditorBridgeCallbacks.onRequestElementPick` and the native dialog is used as a fallback when nothing is listening.
- Endless canvas: the surface spans 4× the viewport (minimum 2600, capped at 4608 rendered px per side so the three canvas layers stay within a sane memory budget). When the view gets close to a border, the whole drawing is moved back to the middle of the surface with the scroll compensated, so the picture does not change but panning can continue in any direction. The structure always stays inside the canvas: new room is added first, and once the memory cap is reached panning simply stops in that direction.
- Zooming (buttons, double click or gestures) re-anchors the drawing in the middle of the surface with the same scroll compensation, so panning stays available at every zoom level, and the surface is re-sized for the new zoom instead of growing without bound.
- The zoom bounds live in `src/lib/editorBoard.ts` (`MIN_ZOOM` / `MAX_ZOOM`) and are enforced by wrapping `editor.zoomTo`, so buttons, wheel, gestures, double click and programmatic fits (Clean Up / Reset Zoom) all share one limit.
- The composer's `change` events drive the React empty-canvas hint; no DOM outside the host is managed by Kekule.

## Board persistence notes

- The drawing is stored under the `zephyrlea.board` key in `localStorage` (`src/lib/boardPersistence.ts`), kept apart from the settings key (`zephyrlea.settings`). It is written when the content changes, when the zoom changes, when the page is hidden (`pagehide` / `visibilitychange`) or when the editor is torn down; edits are debounced by 600 ms so drawing a bond does not serialize the document on every stroke.
- Each structure is saved as a **V2000 molfile** (`Kekule.IO.saveFormatData(mol, 'mol')`) together with the **absolute coordinate of every atom**: a molfile only keeps atom positions relative to each other, while the editor moves whole fragments around (changing the fragment's own coordinate), so both are needed to keep the structures' relative placement. On restore, `K.IO.loadFormatData` parses the molfile, the fragment offset is reset to zero, the saved coordinates are written back, and the fragments are appended to the chemical space.
- The view is stored as the **viewport centre relative to the centre of the drawing bounds**, not as an absolute coordinate: layout passes shift the drawing around (re-centring, surface growth), which invalidates absolute coordinates while a relative offset survives. Restoring applies the zoom first, then positions the view from the current bounds, and repeats that at 140 / 400 / 800 ms because Kekule resets the scroll asynchronously after layout work.
- Loading a structure makes Kekule auto-scale the surface to that structure's bond length (`objScreenLengthRatio` = `defAutoScaleRefLength` / `defBondLength`). Restoring the fragments alone falls back to the default scale, which renders the drawing ~1.9× larger than before the refresh, so both numbers are stored and put back before the surface size is recomputed.
- Restore runs after the first layout pass (`composer.resized()`): append the fragments, restore the scale and zoom, then position the viewport. Without a stored snapshot the editor keeps its original "centre the empty surface" behaviour.

## RDKit analysis and validation notes

- The engine is `@rdkit/rdkit` (the RDKit MinimalLib WebAssembly build, 7.4 MB). The `.wasm` is imported as `import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url'` so Vite fingerprints and serves it, and `locateFile` points RDKit at that URL — dev and production builds both work offline.
- The formula comes from `mol.get_json()`: that JSON only emits fields that differ from the defaults (`z: 6` / `impHs: 0` / `chg: 0`), so element symbols plus implicit hydrogens are tallied and joined in **Hill order** (C first, then H, then the rest alphabetically; everything alphabetical when there is no carbon) into strings like `C9H8O4`. Formal charges are summed separately and shown as a badge.
- Every other number comes from `mol.get_descriptors()` (`amw`, `exactmw`, `NumHeavyAtoms`, `NumAtoms`, `NumRings`, `NumAromaticRings`, `NumRotatableBonds`, `NumHBD`, `NumHBA`, `tpsa`, `CrippenClogP`); this build has no dedicated formula API.
- Analysis and validation share one `inspectStructure()` call: valence problems are found on the `sanitize: false` object, then a second, sanitized object provides the formula and descriptors — a structure that cannot be sanitized has no reliable formula, so its card reads "结构 N 无法解析". Both loads share the same promise queue.
- A card's collapsed state is held by the panel itself (keyed by structure index), so it survives editing the drawing and even collapsing the whole panel to its narrow rail and reopening it; clearing the canvas resets it.
- The panel is height-clamped to the canvas row (a `min-h-0` chain plus an internal scroller), so however many structures are drawn the panel scrolls internally and never pushes the element strip / tool rail / action bar out of the window.
- Structures are loaded with `RDKit.get_mol(smiles, JSON.stringify({ sanitize: false }))`: with sanitizing enabled RDKit simply rejects an invalid structure and returns `null`, leaving nothing to inspect. If the SMILES cannot be parsed the molblock is tried next.
- The types in `@rdkit/rdkit` 2026.9.2 (`dist/RDKit_minimal.d.ts`) and the wasm bindings expose **no** `detect_chemistry_problems` (the method is absent from the `Mol` prototype and the symbol does not exist in the wasm). The check therefore captures RDKit's sanitizer output with `RDKit.set_log_capture('rdApp.error')` — the very same exception text (`Explicit valence for atom # 0 C, 5, is greater than permitted`) — and classifies it as `AtomValenceException`. If a future release exposes the dedicated method, `mol.detect_chemistry_problems()` is used first.
- Problem atoms are located through the structure's **molblock** (`Kekule.IO.saveFormatData(mol, 'mol')`): Kekule writes atoms in canvas-node order, so RDKit's atom index maps straight onto a Kekule node. SMILES is written in traversal order, so its indices do not match the node order and cannot be used for highlighting.
- Every check calls `mol.delete()` in a `finally` block (including the temporary object used to trigger sanitization) to keep the WASM heap clean; checks run one at a time through a promise queue so the shared log capture cannot interleave.
- Validation runs one frame after the editor's change event plus a 220 ms debounce; `editorBridge`'s `onContentChange` carries an increasing `revision`, which is what re-triggers RDKit.
- The red rings are a `pointer-events-none` SVG layer that re-reads `editor.objCoordToScreen()` every frame, so they follow zooming, panning, Clean Up and atom dragging; the radius is derived from the neighbouring bond length.
- In development the browser console exposes `__zephyrleaDetectChemistryProblems({ smiles, molfile })` and `__zephyrleaRunDetectionSelfTest()` (which prints the result for `C` and `C(C)(C)(C)(C)(C)`).

## 3D view notes

- Conformers are computed in the browser by `sci-form-wasm` with no external service: `await init()` boots the WASM module, then `JSON.parse(embed(smiles, 42))` returns `{ num_atoms, coords, elements, bonds }`, where `elements` holds atomic numbers, `coords` a flat `x,y,z` sequence and `bonds` triplets of `[from, to, "SINGLE" | "DOUBLE" | "TRIPLE" | "AROMATIC"]`.
- The result is turned into a **V2000 molblock** (bond orders preserved) and handed to `viewer.addModel(molblock, 'sdf')`. A plain XYZ block only carries coordinates, so 3Dmol would have to guess every bond and draw them all as single sticks; the molblock lets 3Dmol draw double and triple bonds itself as parallel cylinders, and aromatic bonds as the classic solid line plus a dashed big-π line inside the ring (`aromaticStyle: 'dashed'`, the default).
- Styling comes from `MODEL_STYLE_SPECS`, with four presets: **ball-and-stick** (`stick` + `sphere: { scale: 0.3 }`, the default), **space-filling** (`sphere: { scale: 1 }` only, filling the van der Waals radii), **stick** (`stick` only) and **wireframe** (0.05-radius hairline sticks). Ball-and-stick and stick use a 0.15 radius — thinner than 3Dmol's 0.25 default, so single bonds read lightly — with `doubleBondScaling: 0.55` / `tripleBondScaling: 0.45` raised so the two / three cylinders of double and triple bonds stay clearly visible at that radius. The wireframe does not use 3Dmol's `line` style because WebGL caps `lineWidth` at 1px in mainstream browsers, which nearly vanishes on a dark canvas.
- Switching the style only calls `viewer.setStyle()` and re-fits the view; the model is not rebuilt, so the rotation the user set is preserved. The re-fit (`zoomTo()`, pulled back another 25% for space-filling) keeps the bigger spheres inside the frame. The style lives in `settings.model3DStyle` (`localStorage`), and the settings modal and the docked 3D toolbar share the same `Model3DSwitch` option list, so both stay in sync.
- `embed()` handles **one** structure per call: given `c1ccccc1.C1CCCC1` it only returns the coordinates of the latter. Multiple structures are therefore split on `.`, embedded one by one and merged — each fragment is laid out along x by its bounding box (4 Å apart, centred on y/z), the group is centred on the origin, bond indexes are offset per fragment, and a single molblock goes to 3Dmol, so a multi-structure canvas shows every structure in 3D.
- The docked toolbar keeps the model style, drag mode, reset view and maximize inside one pill (`pointer-events-none` wrapper for positioning, inner element restores interaction). Its alignment comes from `settings.viewer3DToolbarAlign` — `justify-start` / `justify-center` / `justify-end`, centre by default. The "locally generated" note moved to the top-left of the canvas so it never collides with a left-aligned toolbar.
- **Drag mode** is a pair of exclusive icon buttons: `rotate` (default, 3Dmol's own drag rotation) and `move camera`. The latter puts a transparent layer over the canvas to take the pointer events (so 3Dmol does not rotate as well) and calls `viewer.translate(dx, -dy)` — that moves the camera's `lookingAt` while the structures stay put, which is what panning the camera means. 3Dmol's `translate` is measured from the canvas centre with its y axis pointing up, hence the negation so the drag follows the hand.
- Wheel zoom is handled for both drag modes by one native `wheel` listener on the container (capture phase + `stopPropagation`, so 3Dmol's own wheel zoom cannot stack on top). It is **anchored on the pointer**: `viewer.zoom(factor)` first, then the camera is moved by `-(factor-1)·pointerOffset`, which keeps the atom under the cursor under the cursor — so the wheel zooms both in and out, around the place being looked at instead of only towards the middle of the view.
- Reset view is not a 3Dmol API: it zeroes the `setView()` pan, sets the rotation quaternion to identity (`[0,0,0,z,0,0,0,1]`), points the camera's `lookingAt` back at the origin (`setView()` cannot undo a "move camera" drag) and re-runs `zoomTo()` for the current style, so the result matches the frame shown when the dialog first opened.
- Maximize only swaps the dialog container size (`h-full w-full max-w-none` with `p-2` on the wrapper); a `ResizeObserver` calls `viewer.resize()`, so the model is not rebuilt. `Esc` restores the window while maximized and only the next press closes the dialog. The background follows the theme via `setBackgroundColor()`.
- `sci-form-wasm` only exports `.`, `./alpha` and `./beta`, so its wasm binary cannot be imported through a subpath. `vite.config.ts` aliases `sci-form-wasm/wasm` to the real `sci_form_wasm_bg.wasm`, and the code reads `import wasmUrl from 'sci-form-wasm/wasm?url'` and passes it explicitly to `init({ module_or_path })`, which behaves the same in dev and in the production build.
- `embed()` is a synchronous WASM call that blocks the main thread, so the code yields a frame (`requestAnimationFrame`) first and the modal can paint its "正在计算 3D 构象…" state.
- 3Dmol (~570 KB) is loaded with a dynamic `import('3dmol')` so it stays out of the initial bundle; it is a webpack UMD bundle, so the import tolerates both the `default` and namespace interop shapes.
- Closing the dialog (or changing the structure / retrying) runs `viewer.clear()`, removes the canvas and drops the viewer reference, so repeated open/close cycles never accumulate canvases or WebGL contexts.
- `smiles`, `theme` and `modelStyle` are handled differently on purpose: a new `smiles` rebuilds the model, a theme change only calls `setBackgroundColor()`, and a style change only calls `setStyle()`, so neither switching themes nor switching display styles throws away the orientation the user rotated to.

## Keyboard shortcuts

- `Ctrl/⌘ + Z` — undo
- `Ctrl/⌘ + Shift + Z` — redo
- `Enter` — load the SMILES in the top bar

## License

Released under the [MIT License](LICENSE).

Copyright (c) 2026 paliku520 (云野风云ZephyrLea.)
