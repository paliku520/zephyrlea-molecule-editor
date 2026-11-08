import type { EditorBoard } from './editorBoard';
import { createEditorBoard, MAX_ZOOM, MIN_ZOOM } from './editorBoard';
import {
  installBoardPersistence,
  type BoardPersistence,
} from './boardPersistence';
import { ATOMIC_NUMBER_LIMIT, getDefaultElementColor, getElementColors } from './elementColors';
import type { KekuleNamespace } from './kekule';
import { installBondLineStyle } from './kekuleBondStyle';
import { installElectronStateLabels } from './kekuleElectronLabel';
import { installLabelBaseline } from './kekuleLabelStyle';
import { installAtomOnlyNodePicker, installNodeSetter, installPeriodicTablePicker } from './kekuleNodeSetter';
import { getEditorScroller, getMolecules, getObjScreenScale, getUnionBox } from './kekuleSpace';
import { layoutMolecule } from './moleculeLayout';
import {
  EmptyStructureError,
  exportMoleculeImage,
  type MoleculeImage,
  type MoleculeImageFormat,
} from './moleculeExport';
import { DEFAULT_SETTINGS, type AppSettings, type ThemeMode } from './settings';
import type { ValidationTarget } from './structureValidation';

export type ToolId =
  | 'select'
  | 'pan'
  | 'erase'
  | 'lasso'
  | 'chargePlus'
  | 'chargeMinus'
  | 'single'
  | 'double'
  | 'triple'
  | 'wedgeUp'
  | 'wedgeDown'
  | 'dative'
  | 'wavy'
  | 'ring3'
  | 'ring4'
  | 'ring5'
  | 'ring6'
  | 'ring7'
  | 'ring8'
  | 'benzene'
  | `element:${string}`;

export interface EditorBridgeCallbacks {
  /** `revision` grows with every edit so subscribers can re-run expensive checks. */
  onContentChange?: (hasContent: boolean, revision: number) => void;
  onSelectionChange?: (selection: SelectionSnapshot | null) => void;
  onZoomChange?: (zoom: number) => void;
  /**
   * Show the app's periodic table for the atom label box. `apply` writes the
   * chosen element back into the editor; return false to keep Kekule's dialog.
   */
  onRequestElementPick?: (
    apply: (symbol: string) => void,
    currentSymbol: string | null,
  ) => boolean;
}

/** Circle drawn around an atom by the validation overlay (viewport pixels). */
export interface AtomScreenRing {
  x: number;
  y: number;
  radius: number;
}

/** Selection state used by the floating transform bar. */
export interface SelectionSnapshot {
  /** Total number of selected objects (atoms + bonds). */
  count: number;
  atomCount: number;
  bondCount: number;
  /** Selection bounds in viewport pixels. */
  box: { left: number; top: number; width: number; height: number };
  /** False when the selection holds fewer than two atoms and cannot be transformed. */
  transformable: boolean;
}

export interface MoleculeEditorBridge {
  readonly composer: any;
  readonly editor: any;
  setTool(tool: ToolId): boolean;
  hasContent(): boolean;
  exportSmiles(): string;
  /** Render every structure on the board into a PNG or SVG file. */
  exportImage(format: MoleculeImageFormat): Promise<MoleculeImage | null>;
  /** Every molecule with a molblock whose atom order matches its Kekule nodes. */
  collectValidationTargets(): ValidationTarget[];
  /** Circle around one atom, in viewport pixels. */
  getAtomScreenRing(atom: any): AtomScreenRing | null;
  importSmiles(smiles: string): Promise<boolean>;
  /** Pack the structures into tidy rows and fit the view. Keeps every coordinate. */
  cleanUp(): number;
  /** Normalise the structures: regenerate their 2D coordinates, nothing else. */
  relayout(): Promise<number>;
  clear(): void;
  undo(): void;
  redo(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  loadFile(file: File): Promise<boolean>;
  handleResize(): void;
  readSelection(): SelectionSnapshot | null;
  rotateSelection(angle: number): boolean;
  mirrorSelection(axis: 'horizontal' | 'vertical'): boolean;
  deleteSelection(): boolean;
  applySettings(settings: AppSettings): void;
  destroy(): void;
}

export const ATOM_COLOR = '#e9e9eb';
export const BOND_COLOR = '#e9e9eb';

interface ThemeRenderColors {
  atom: string;
  bond: string;
  glyphStroke: string;
  glyphFill: string;
}

function getThemeRenderColors(theme: ThemeMode): ThemeRenderColors {
  return theme === 'light'
    ? { atom: '#1b1b1f', bond: '#1b1b1f', glyphStroke: '#5b5b63', glyphFill: '#9a9aa2' }
    : { atom: ATOM_COLOR, bond: BOND_COLOR, glyphStroke: '#b9b9bd', glyphFill: '#8d8d92' };
}

const ELEMENT_TOOL_CONTROLLER_ID = 'RepositoryStructureFragmentIaController';

const elementRepositoryItems = new Map<string, any>();
let openChemLibPromise: Promise<typeof import('openchemlib')> | null = null;

function loadOpenChemLib() {
  openChemLibPromise ??= import('openchemlib');
  return openChemLibPromise;
}

interface FitToViewOptions {
  /** Let the view zoom in when the drawing is smaller than the viewport. */
  allowZoomIn?: boolean;
  /** Only touch the view when part of the drawing is outside the viewport. */
  onlyWhenClipped?: boolean;
  /** Lower zoom bound, so even widely scattered fragments can be gathered. */
  minZoom?: number;
  /** Upper zoom bound; defaults to 2.6 (or the current zoom when zooming in is off). */
  maxZoom?: number;
  /**
   * Fraction of the viewport the drawing should fill. When set, the fit zooms
   * both in and out so every drawing ends up at the same relative size.
   */
  coverage?: number;
}

/**
 * Share of the viewport the drawing fills after Clean Up, on its limiting axis.
 * Slightly below the 75% target because the geometric box ignores the pixels the
 * atom labels add around it, so the rendered drawing ends up a bit larger.
 */
const VIEW_FIT_COVERAGE = 0.72;
/** Pixels kept free around the drawing by the plain "reset zoom" fit. */
const VIEW_FIT_PADDING = 120;

/** True when any part of the drawing sits outside the visible viewport. */
function isContentClipped(K: KekuleNamespace, composer: any, editor: any) {
  const box = getUnionBox(K, getMolecules(K, composer));
  const visible = editor?.getVisibleClientScreenBox?.();
  if (!box || !visible) return false;

  const cornerA = editor.objCoordToScreen?.({ x: box.x1, y: box.y1 });
  const cornerB = editor.objCoordToScreen?.({ x: box.x2, y: box.y2 });
  if (!cornerA || !cornerB) return false;

  const left = Math.min(cornerA.x, cornerB.x);
  const right = Math.max(cornerA.x, cornerB.x);
  const top = Math.min(cornerA.y, cornerB.y);
  const bottom = Math.max(cornerA.y, cornerB.y);

  return left < visible.x1 || right > visible.x2 || top < visible.y1 || bottom > visible.y2;
}

function fitToView(
  K: KekuleNamespace,
  composer: any,
  board: EditorBoard,
  options: FitToViewOptions = {},
) {
  const editor = composer.getEditor?.();
  const molecules = getMolecules(K, composer);
  if (!editor || molecules.length === 0) return false;

  const box = getUnionBox(K, molecules);
  const visible = editor.getVisibleClientScreenBox?.();
  if (!box || !visible) return false;

  const origin = editor.objCoordToScreen?.({ x: 0, y: 0 });
  const unit = editor.objCoordToScreen?.({ x: 1, y: 0 });
  if (!origin || !unit) return false;

  const screenScale = Math.abs(unit.x - origin.x);
  const contentWidth = Math.abs(box.x2 - box.x1) * screenScale;
  const contentHeight = Math.abs(box.y2 - box.y1) * screenScale;
  if (screenScale <= 0 || contentWidth < 1 || contentHeight < 1) return false;

  if (options.onlyWhenClipped && !isContentClipped(K, composer, editor)) return false;

  const coverage = options.coverage;
  const factor =
    coverage === undefined
      ? Math.min(
          (visible.width - VIEW_FIT_PADDING) / contentWidth,
          (visible.height - VIEW_FIT_PADDING) / contentHeight,
        )
      : Math.min(
          (visible.width * coverage) / contentWidth,
          (visible.height * coverage) / contentHeight,
        );
  const currentZoom = editor.getCurrZoom?.() ?? 1;
  const maxZoom = options.maxZoom ?? (options.allowZoomIn === false ? currentZoom : 2.6);
  const minZoom = options.minZoom ?? 0.45;
  const targetZoom = Math.max(minZoom, Math.min(currentZoom * factor, maxZoom));

  if (Math.abs(targetZoom - currentZoom) > 1e-3) {
    editor.zoomTo?.(targetZoom);
  }
  // The fit is about to place the drawing by hand, so drop the restores that
  // the zoom queued for the previous view.
  board.clearPendingRestores();
  board.rebalance({ preserveViewCenter: false });

  // Kekule finishes its own layout (and may reset the scroll) right after a
  // zoom or a document load, so center the content a few times. Zooming changes
  // the size of the drawing surface in chemical units, so keep the drawing in
  // the middle of it as well; otherwise it ends up pinned against a border with
  // no room left to pan into.
  const centerOnMolecules = () => {
    centerContentInSpace(K, composer);
    editor.scrollClientToObject?.(molecules, { scrollToCenter: true, coverMostObjs: true });
  };
  centerOnMolecules();
  window.requestAnimationFrame(centerOnMolecules);
  window.setTimeout(centerOnMolecules, 80);

  return true;
}

/** Gap and outer margin, in rendered pixels, used by the Clean Up arrangement. */
const ARRANGE_GAP_PX = 64;
const ARRANGE_MARGIN_PX = 28;
/** Extra room around a component, in object units, so labels are not clipped. */
const ARRANGE_UNIT_PADDING = 0.5;

interface ArrangeUnit {
  /** Fragment that owns the atoms, so it can be moved in one call when possible. */
  molecule: any;
  nodes: any[];
  box: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * Split the drawing into the pieces a user perceives as separate structures:
 * connected components, so disconnected parts of one imported molecule are
 * rearranged as well.
 */
function collectArrangeUnits(K: KekuleNamespace, molecules: any[]): ArrangeUnit[] {
  const units: ArrangeUnit[] = [];

  for (const molecule of molecules) {
    const nodes: any[] = molecule.getNodes?.() ?? [];
    if (nodes.length === 0) continue;

    const neighbours = new Map<any, any[]>();
    for (const node of nodes) neighbours.set(node, []);

    for (const connector of molecule.getConnectors?.() ?? []) {
      const connected = connector.getConnectedObjs?.() ?? [];
      if (connected.length !== 2) continue;

      neighbours.get(connected[0])?.push(connected[1]);
      neighbours.get(connected[1])?.push(connected[0]);
    }

    const visited = new Set<any>();
    for (const start of nodes) {
      if (visited.has(start)) continue;

      const component: any[] = [];
      const queue = [start];
      visited.add(start);

      while (queue.length > 0) {
        const current = queue.shift();
        component.push(current);

        for (const next of neighbours.get(current) ?? []) {
          if (visited.has(next)) continue;
          visited.add(next);
          queue.push(next);
        }
      }

      let x1 = Number.POSITIVE_INFINITY;
      let y1 = Number.POSITIVE_INFINITY;
      let x2 = Number.NEGATIVE_INFINITY;
      let y2 = Number.NEGATIVE_INFINITY;

      for (const node of component) {
        const coord =
          node.getAbsCoordOfMode?.(K.CoordMode.COORD2D, true) ?? node.getCoord2D?.(true);
        if (!coord) continue;

        x1 = Math.min(x1, coord.x);
        y1 = Math.min(y1, coord.y);
        x2 = Math.max(x2, coord.x);
        y2 = Math.max(y2, coord.y);
      }

      if (!Number.isFinite(x1)) continue;

      units.push({
        molecule,
        nodes: component,
        box: {
          x1: x1 - ARRANGE_UNIT_PADDING,
          y1: y1 - ARRANGE_UNIT_PADDING,
          x2: x2 + ARRANGE_UNIT_PADDING,
          y2: y2 + ARRANGE_UNIT_PADDING,
        },
      });
    }
  }

  return units;
}

/**
 * Clean Up rearranges the drawing itself: every structure is moved into an
 * evenly spaced block centred on the current viewport. Structures are placed in
 * reading order (top row first, then left to right) so the result follows the
 * original layout. The view is fitted by the caller.
 */
function arrangeFragments(K: KekuleNamespace, composer: any, editor: any) {
  const molecules = getMolecules(K, composer).filter(
    (molecule) => (molecule.getNodeCount?.() ?? 0) > 0,
  );
  if (molecules.length === 0) return false;

  const scroller = getEditorScroller(editor);
  if (!scroller) return false;

  const units = collectArrangeUnits(K, molecules);
  if (units.length === 0) return false;
  // A single structure that is already on screen needs no rearrangement.
  if (units.length === 1 && !isContentClipped(K, composer, editor)) return false;

  const viewCenter = editor.screenCoordToObj?.({
    x: scroller.scrollLeft + scroller.clientWidth / 2,
    y: scroller.scrollTop + scroller.clientHeight / 2,
  });
  if (!viewCenter) return false;

  const layout = () => {
    const scale = getObjScreenScale(editor);
    if (scale <= 0) return null;

    const items = units.map((unit) => ({
      unit,
      width: Math.abs(unit.box.x2 - unit.box.x1) * scale,
      height: Math.abs(unit.box.y2 - unit.box.y1) * scale,
      centerX: (unit.box.x1 + unit.box.x2) / 2,
      centerY: (unit.box.y1 + unit.box.y2) / 2,
    }));

    const averageHeight = items.reduce((sum, item) => sum + item.height, 0) / items.length;
    const rowTolerance = Math.max(1, averageHeight / 3);
    items.sort((a, b) => {
      const rowA = Math.round((a.centerY * scale) / rowTolerance);
      const rowB = Math.round((b.centerY * scale) / rowTolerance);
      if (rowA !== rowB) return rowB - rowA;
      return a.centerX - b.centerX;
    });

    const availableWidth = Math.max(scroller.clientWidth - ARRANGE_MARGIN_PX * 2, 160);
    const availableHeight = Math.max(scroller.clientHeight - ARRANGE_MARGIN_PX * 2, 160);

    // Balance the rows so a two-row layout does not end up as 7 + 1.
    const averageWidth = items.reduce((sum, item) => sum + item.width, 0) / items.length;
    const capacity = Math.max(
      1,
      Math.floor((availableWidth + ARRANGE_GAP_PX) / (averageWidth + ARRANGE_GAP_PX)),
    );
    const rowCount = Math.ceil(items.length / capacity);
    const perRow = Math.max(1, Math.ceil(items.length / rowCount));

    const rows: (typeof items)[] = [];
    let currentRow: typeof items = [];
    let currentWidth = 0;

    for (const item of items) {
      const extra = currentRow.length === 0 ? item.width : item.width + ARRANGE_GAP_PX;
      if (currentRow.length >= perRow || currentWidth + extra > availableWidth) {
        rows.push(currentRow);
        currentRow = [];
        currentWidth = 0;
      }

      currentWidth += currentRow.length === 0 ? item.width : item.width + ARRANGE_GAP_PX;
      currentRow.push(item);
    }
    if (currentRow.length > 0) rows.push(currentRow);

    const rowMetrics = rows.map((row) => ({
      row,
      width: row.reduce((sum, item) => sum + item.width, 0) + ARRANGE_GAP_PX * (row.length - 1),
      height: Math.max(...row.map((item) => item.height)),
    }));

    const totalWidth = Math.max(...rowMetrics.map((metrics) => metrics.width));
    const placed: Array<(typeof items)[number] & { x: number; y: number }> = [];
    let cursorY = 0;

    for (const metrics of rowMetrics) {
      let cursorX = (totalWidth - metrics.width) / 2;

      for (const item of metrics.row) {
        placed.push({
          ...item,
          x: cursorX,
          y: cursorY + (metrics.height - item.height) / 2,
        });
        cursorX += item.width + ARRANGE_GAP_PX;
      }

      cursorY += metrics.height + ARRANGE_GAP_PX;
    }

    return {
      scale,
      placed,
      totalWidth,
      totalHeight: Math.max(cursorY - ARRANGE_GAP_PX, 1),
      availableWidth,
      availableHeight,
    };
  };

  const result = layout();
  if (!result) return false;

  // The caller always fits the view right afterwards, so the block only has to
  // be laid out here - no extra zoom pass (each one re-renders the whole
  // drawing) is needed to make it fit.
  const blockCenter = { x: result.totalWidth / 2, y: result.totalHeight / 2 };
  const space = editor.getChemSpace?.();
  const allowCoordBorrow = editor.getAllowCoordBorrow?.() ?? true;

  // Offsets per unit, grouped by the fragment that owns the atoms.
  const offsets = new Map<any, { unit: ArrangeUnit; dx: number; dy: number }[]>();
  for (const item of result.placed) {
    const targetX = viewCenter.x + (item.x + item.width / 2 - blockCenter.x) / result.scale;
    const targetY = viewCenter.y - (item.y + item.height / 2 - blockCenter.y) / result.scale;
    const own = offsets.get(item.unit.molecule) ?? [];
    own.push({ unit: item.unit, dx: targetX - item.centerX, dy: targetY - item.centerY });
    offsets.set(item.unit.molecule, own);
  }

  editor.beginUpdateObject?.();
  space?.beginUpdate?.();
  try {
    for (const [molecule, entries] of offsets) {
      const first = entries[0];
      const wholeFragment =
        entries.length === 1 ||
        entries.every(
          (entry) =>
            Math.abs(entry.dx - first.dx) < 1e-6 && Math.abs(entry.dy - first.dy) < 1e-6,
        );

      // Moving the fragment's own coordinate is what Kekule's panning does; it
      // is one update instead of one per atom, which keeps Clean Up fast.
      if (wholeFragment && molecule?.setCoordOfMode) {
        const coord = molecule.getCoordOfMode?.(K.CoordMode.COORD2D, allowCoordBorrow) ?? {};
        molecule.setCoordOfMode(
          { x: (coord.x ?? 0) + first.dx, y: (coord.y ?? 0) + first.dy },
          K.CoordMode.COORD2D,
        );
        continue;
      }

      // Disconnected parts of one fragment must be moved separately.
      for (const entry of entries) {
        for (const node of entry.unit.nodes) {
          const coord = node.getCoord2D?.(true);
          if (!coord) continue;

          node.setCoord2D?.({ x: coord.x + entry.dx, y: coord.y + entry.dy });
        }
      }
    }
  } finally {
    space?.endUpdate?.();
    editor.endUpdateObject?.();
  }

  return true;
}

function centerContentInSpace(K: KekuleNamespace, composer: any) {
  const editor = composer.getEditor?.();
  const space = editor?.getChemSpace?.();
  const size = space?.getSize2D?.();
  if (!space || !size) return;

  const box = getUnionBox(K, getMolecules(K, composer));
  if (!box) return;

  const deltaX = size.x / 2 - (box.x1 + box.x2) / 2;
  const deltaY = size.y / 2 - (box.y1 + box.y2) / 2;
  if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) return;

  editor._shiftChemSpaceChildCoord?.(
    { x: deltaX, y: deltaY },
    K.CoordMode.COORD2D,
    false,
  );
}

function refitAfterLoad(K: KekuleNamespace, composer: any, board: EditorBoard) {
  const centerAndFit = () => {
    centerContentInSpace(K, composer);
    fitToView(K, composer, board);
    board.rebalance();
  };

  window.requestAnimationFrame(() => {
    centerAndFit();
    window.setTimeout(centerAndFit, 60);
  });
}

function getMedianBondLength(K: KekuleNamespace, molecule: any): number {
  try {
    const median = molecule?.getConnectorLengthMedian?.(K.CoordMode.COORD2D, true);
    if (typeof median === 'number' && Number.isFinite(median) && median > 0) {
      return median;
    }
  } catch {
    // fall through to the default bond length
  }

  return K.globalOptions?.structure?.defaultBondLength2D ?? 0.8;
}

function getCentroid(nodes: any[]) {
  if (nodes.length === 0) return { x: 0, y: 0 };

  let x = 0;
  let y = 0;
  for (const node of nodes) {
    const coord = node.getCoord2D?.(true) ?? { x: 0, y: 0 };
    x += coord.x;
    y += coord.y;
  }

  return { x: x / nodes.length, y: y / nodes.length };
}

/**
 * Kekule ships a CPK palette meant for white paper (black carbon, navy
 * nitrogen). Replace it with the shell palette of the active theme so atom
 * labels stay readable on either canvas.
 */
function installAtomPalette(K: KekuleNamespace, theme: ThemeMode) {
  const rendererType = K.Render.RendererType?.R2D;
  const colorSets = K.Render.atomColors;
  if (rendererType === undefined || !colorSets) return;

  const elementColors = getElementColors(theme);
  const defaultColor = getDefaultElementColor(theme);
  const palette: string[] = new Array(ATOMIC_NUMBER_LIMIT).fill(defaultColor);

  for (const [symbol, color] of Object.entries(elementColors)) {
    const atomicNumber = new K.Atom(null, symbol).getAtomicNumber?.();
    if (typeof atomicNumber === 'number' && atomicNumber > 0 && atomicNumber < ATOMIC_NUMBER_LIMIT) {
      palette[atomicNumber] = color;
    }
  }

  colorSets[rendererType] = palette;
}

function applyRenderTheme(K: KekuleNamespace, settings: AppSettings) {
  installAtomPalette(K, settings.theme);

  const renderConfigs = K.Render.getRender2DConfigs();
  const colorConfigs = renderConfigs.getColorConfigs();
  const colors = getThemeRenderColors(settings.theme);
  colorConfigs.setUseAtomSpecifiedColor(true);
  colorConfigs.setAtomColor(colors.atom);
  colorConfigs.setLabelColor(colors.atom);
  colorConfigs.setBondColor(colors.bond);
  colorConfigs.setGlyphStrokeColor(colors.glyphStroke);
  colorConfigs.setGlyphFillColor(colors.glyphFill);

  const lengthConfigs = renderConfigs.getLengthConfigs();
  lengthConfigs.setBondLineWidth?.(1.5);
  lengthConfigs.setBoldBondLineWidthRatio?.(2);

  // Skeletal keeps carbons unlabelled and hydrogens implicit; the alternative
  // labels every atom so carbons and hydrogen counts become visible.
  const displayConfigs = renderConfigs.getMoleculeDisplayConfigs();
  const displayTypes = K.Render.MoleculeDisplayType;
  const hydrogenLevels = K.Render.HydrogenDisplayLevel;
  const hideAtoms = settings.hideCarbonHydrogenAtoms;

  displayConfigs.setDefMoleculeDisplayType?.(
    hideAtoms ? displayTypes?.SKELETAL : displayTypes?.CONDENSED,
  );
  displayConfigs.setDefHydrogenDisplayLevel?.(
    hideAtoms ? hydrogenLevels?.DEFAULT : hydrogenLevels?.ALL,
  );
}

/** Kekule marks hovered/selected objects in pure blue; follow the shell accent. */
function applyUiMarkerTheme(composer: any) {
  const markers = composer.getEditorConfigs?.()?.getUiMarkerConfigs?.();
  if (!markers) return;

  const accent = getThemeAccent();
  const accentStrong = getThemeAccentStrong();
  markers.setHotTrackerColor?.(accent);
  markers.setHotTrackerOpacity?.(0.3);
  markers.setSelectionMarkerStrokeColor?.(accent);
  markers.setSelectionMarkerFillColor?.(accent);
  markers.setSelectionMarkerOpacity?.(0.2);

  // The marquee defaults to a 1px black dashed outline, invisible on the dark
  // canvas. The marker opacity multiplies the stroke too, so it stays high and
  // the fill is left empty to keep the dashed edge crisp.
  markers.setSelectingMarkerStrokeColor?.(accentStrong);
  markers.setSelectingMarkerStrokeWidth?.(2);
  markers.setSelectingMarkerStrokeDash?.(true);
  markers.setSelectingMarkerFillColor?.(null);
  markers.setSelectingMarkerOpacity?.(0.95);
  markers.setSelectingBrushMarkerStrokeColor?.(accentStrong);
  markers.setSelectingBrushMarkerStrokeDash?.(true);
  markers.setSelectingBrushMarkerOpacity?.(0.95);
}

function readThemeToken(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value || fallback;
}

function getThemeAccent() {
  return readThemeToken('--shell-accent', '#89b5fa');
}

function getThemeAccentStrong() {
  return readThemeToken('--shell-accent-strong', '#a8c7fc');
}

function activateBondTool(
  K: KekuleNamespace,
  editor: any,
  order: number,
  stereo: number,
  bondType = K.BondType.COVALENT,
) {
  const controller = editor.getIaController?.('MolBondIaController');
  if (!controller) return false;

  controller.setBondType?.(bondType);
  controller.setBondOrder?.(order);
  controller.setBondStereo?.(stereo);
  editor.setActiveIaControllerId?.('MolBondIaController');
  return true;
}

function activateRingTool(editor: any, atomCount: number, aromatic: boolean) {
  const controller = editor.getIaController?.('MolRingIaController');
  if (!controller) return false;

  controller.setRingAtomCount?.(atomCount);
  controller.setIsAromatic?.(aromatic);
  editor.setActiveIaControllerId?.('MolRingIaController');
  return true;
}

function createElementRepositoryItem(K: KekuleNamespace, symbol: string) {
  const cached = elementRepositoryItems.get(symbol);
  if (cached) return cached;

  const molecule = new K.Molecule();
  const node = symbol === 'R' ? new K.RGroup(null, 'R') : new K.Atom(null, symbol);
  node.setCoord2D?.({ x: 0, y: 0 });
  molecule.appendNode?.(node);

  const json = K.IO.saveFormatData(molecule, K.IO.DataFormat.KEKULE_JSON);
  const item = new K.Editor.StoredStructFragmentRepositoryItem2D(
    json,
    K.IO.DataFormat.KEKULE_JSON,
    1,
  );
  item.setName?.(`zephyrlea-element-${symbol}`);

  elementRepositoryItems.set(symbol, item);
  return item;
}

function activateElementTool(K: KekuleNamespace, editor: any, symbol: string) {
  const controller = editor.getIaController?.(ELEMENT_TOOL_CONTROLLER_ID);
  if (!controller) return false;

  controller.setRepositoryItem?.(createElementRepositoryItem(K, symbol));
  controller.__zephyrleaElementSymbol = symbol;
  editor.setActiveIaControllerId?.(ELEMENT_TOOL_CONTROLLER_ID);
  return true;
}

function createNodeModificationData(K: KekuleNamespace, symbol: string) {
  if (symbol === 'R') return { nodeClass: K.RGroup, props: {} };
  return { nodeClass: K.Atom, props: { isotopeId: symbol } };
}

/** Swaps the element of a node in place, keeping its bonds and neighbours. */
function replaceNodeElement(K: KekuleNamespace, editor: any, node: any, symbol: string) {
  const operation = K.Editor.OperationUtils?.createNodeModificationOperationFromData?.(
    node,
    createNodeModificationData(K, symbol),
    editor,
  );

  if (!operation) return false;
  editor.execOperation?.(operation);
  return true;
}

/**
 * Kekule's repository tool drops a brand-new atom on the cursor and then merges
 * it into the atom underneath, which keeps the old element. Consume that click
 * instead, so picking an element and clicking an existing atom replaces it.
 */
function installElementReplace(K: KekuleNamespace, editor: any) {
  const controller = editor.getIaController?.(ELEMENT_TOOL_CONTROLLER_ID);
  if (!controller || controller.__zephyrleaElementReplace) return;

  controller.__zephyrleaElementReplace = true;
  const originalPointerDown = controller.react_pointerdown;

  controller.react_pointerdown = function reactPointerDown(event: any) {
    const symbol: string | undefined = this.__zephyrleaElementSymbol;

    if (!symbol || event?.getButton?.() !== K.X?.Event?.MOUSE_BTN_LEFT) {
      return originalPointerDown?.call(this, event);
    }

    const coord = editor.getEventMouseRelCoord?.(event);
    const node = coord
      ? editor.getTopmostBasicObjectAtCoord?.(coord, this.getCurrBoundInflation?.())
      : null;

    if (!(node instanceof K.ChemStructureNode)) {
      return originalPointerDown?.call(this, event);
    }

    replaceNodeElement(K, editor, node, symbol);
    event.preventDefault?.();
    return true;
  };
}

/**
 * Select and lasso share one controller; only the select mode differs.
 * Rectangle marquee for the pointer tool, free-hand polygon for the lasso.
 */
function activateSelectTool(editor: any, mode: any) {
  const controller = editor.getIaController?.('SelectIaController');

  // Stretching the selection box (edge/corner handles) distorts bond lengths,
  // so resize and pinch-scaling stay off; move and rotate remain available.
  controller?.setEnableResize?.(false);
  controller?.setEnableAspectRatioLockedResize?.(false);
  controller?.setEnableGestureManipulation?.(false);
  controller?.setEnableMove?.(true);
  controller?.setEnableRotate?.(true);

  editor.setSelectMode?.(mode);
  controller?.setSelectMode?.(mode);
  editor.setActiveIaControllerId?.('SelectIaController');
  return true;
}

function isAtomObject(obj: any) {
  return typeof obj?.getAtomicNumber === 'function';
}

function isBondObject(obj: any) {
  return typeof obj?.getBondOrder === 'function';
}

/**
 * Atoms that actually move when the selection is transformed. Molecules and
 * fragments contribute their nodes, a lone bond contributes its endpoints
 * (bonds borrow their coordinates from atoms in 2D).
 */
function collectSelectionAtoms(selection: any[]) {
  const atoms = new Set<any>();

  const addNode = (node: any) => {
    if (isAtomObject(node)) atoms.add(node);
  };

  for (const obj of selection) {
    if (!obj) continue;

    if (typeof obj.getNodes === 'function') {
      (obj.getNodes() ?? []).forEach(addNode);
      continue;
    }

    if (isAtomObject(obj)) {
      addNode(obj);
      continue;
    }

    const nodes = obj.getConnectedExposedNodes?.() ?? obj.getConnectedNodes?.() ?? [];
    nodes.forEach(addNode);
  }

  return [...atoms];
}

/**
 * Rotates or mirrors the selected atoms around the selection centre. Scaling is
 * deliberately unsupported: it would distort bond lengths and valence geometry.
 */
function transformSelection(
  K: KekuleNamespace,
  editor: any,
  options: { rotate?: number; mirror?: 'horizontal' | 'vertical' },
): boolean {
  const atoms = collectSelectionAtoms(editor.getSelection?.() ?? []);
  if (atoms.length < 2) return false;

  const angle = options.rotate ?? 0;
  const mirrorX = options.mirror === 'vertical' ? -1 : 1;
  const mirrorY = options.mirror === 'horizontal' ? -1 : 1;

  const coords = atoms.map((atom) => {
    const coord = atom.getCoord2D?.();
    return { x: coord?.x ?? 0, y: coord?.y ?? 0 };
  });

  const xs = coords.map((coord) => coord.x);
  const ys = coords.map((coord) => coord.y);
  const center = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const nextCoords = coords.map((coord) => {
    const dx = (coord.x - center.x) * mirrorX;
    const dy = (coord.y - center.y) * mirrorY;

    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  });

  const operations = atoms.map(
    (atom, index) => new K.ChemObjOperation.Modify(atom, { coord2D: nextCoords[index] }, editor),
  );

  editor.execOperation?.(new K.MacroOperation(operations));
  return true;
}

const CLICK_SELECT_TOLERANCE_PX = 4;
const DOUBLE_CLICK_INTERVAL_MS = 400;

/**
 * Kekule opens the inline atom/label setter on every double click, whoever the
 * active tool is. With a tool that acts on every click (charge, element, bond,
 * eraser) two quick clicks on the same atom are a legitimate way to repeat the
 * action, so the setter would pop up over the canvas instead. Keep the gesture
 * for the select/lasso tool only.
 */
function installDoubleClickGuard(K: KekuleNamespace) {
  const proto = K.Editor?.BaseEditorIaController?.prototype;
  if (!proto || proto.__zephyrleaDblClickGuard) return;

  const reactDblClick = proto.react_dblclick;
  if (typeof reactDblClick !== 'function') return;

  proto.__zephyrleaDblClickGuard = true;
  proto.react_dblclick = function patchedReactDblClick(event: any) {
    const activeId = this.getEditor?.()?.getActiveIaControllerId?.();
    if (activeId !== 'SelectIaController') return false;
    return reactDblClick.call(this, event);
  };
}

/**
 * Kekule's select controller only listens to marquee drags, so a plain click
 * never selects a single atom or bond. Add that pointer behaviour while the
 * select/lasso tool is active.
 */
function installClickSelection(editor: any) {
  const host: HTMLElement | undefined = editor.getEditClientElem?.();
  if (!host) return () => {};

  let startClient: { x: number; y: number } | null = null;
  let lastClick: { time: number; x: number; y: number } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    startClient = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!startClient) return;

    const distance = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y);
    startClient = null;

    if (distance > CLICK_SELECT_TOLERANCE_PX) return;
    if (editor.getActiveIaControllerId?.() !== 'SelectIaController') return;

    // The second click of a double click opens Kekule's inline atom setter;
    // drop the selection the first click made so its floating bar stays out of
    // the popup's way.
    const isSecondClick =
      lastClick !== null &&
      event.timeStamp - lastClick.time < DOUBLE_CLICK_INTERVAL_MS &&
      Math.hypot(event.clientX - lastClick.x, event.clientY - lastClick.y) <= CLICK_SELECT_TOLERANCE_PX;
    lastClick = isSecondClick ? null : { time: event.timeStamp, x: event.clientX, y: event.clientY };

    if (isSecondClick) {
      // Kekule's select controller re-selects the marquee area on pointer up,
      // so drop the selection after the event has been processed.
      window.setTimeout(() => {
        editor.deselectAll?.();
        editor.recalcSelectionAreaMarker?.();
      }, 0);
      return;
    }

    const coord = editor.getEventMouseRelCoord?.(event);
    if (!coord) return;

    const obj = editor.getTopmostBasicObjectAtCoord?.(coord, editor.getCurrBoundInflation?.());
    if (!obj) return;

    if (event.shiftKey) {
      editor.toggleSelectingState?.(obj);
    } else {
      editor.deselectAll?.();
      editor.addObjToSelection?.(obj);
    }

    editor.recalcSelectionAreaMarker?.();
  };

  host.addEventListener('pointerdown', onPointerDown, true);
  host.addEventListener('pointerup', onPointerUp, true);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown, true);
    host.removeEventListener('pointerup', onPointerUp, true);
  };
}

function createSelectionSnapshot(editor: any): SelectionSnapshot | null {
  const selection: any[] = editor.getSelection?.() ?? [];
  if (selection.length === 0) return null;

  const box = editor.getSelectionContainerBox?.();
  const host = editor.getEditClientElem?.();
  if (!box || !host) return null;

  const rect = host.getBoundingClientRect();

  return {
    count: selection.length,
    atomCount: selection.filter(isAtomObject).length,
    bondCount: selection.filter(isBondObject).length,
    box: {
      left: rect.left + box.x1,
      top: rect.top + box.y1,
      width: Math.max(box.x2 - box.x1, 0),
      height: Math.max(box.y2 - box.y1, 0),
    },
    transformable: collectSelectionAtoms(selection).length >= 2,
  };
}

function applyTool(K: KekuleNamespace, composer: any, tool: ToolId): boolean {
  const editor = composer.getEditor?.();
  if (!editor) return false;

  if (tool.startsWith('element:')) {
    return activateElementTool(K, editor, tool.slice('element:'.length));
  }

  switch (tool) {
    case 'select':
      return activateSelectTool(editor, K.Editor.SelectMode.RECT);
    case 'pan':
      editor.setActiveIaControllerId?.('ClientDragScrollIaController');
      return true;
    case 'erase':
      editor.setActiveIaControllerId?.('BasicMolEraserIaController');
      return true;
    case 'lasso':
      return activateSelectTool(editor, K.Editor.SelectMode.POLYGON);
    case 'chargePlus':
    case 'chargeMinus': {
      const controller = editor.getIaController?.('MolNodeChargeIaController');
      if (!controller) return false;
      controller.setCharge?.(null);
      controller.setChargeInc?.(tool === 'chargePlus' ? 1 : -1);
      controller.setElectronicBias?.(0);
      controller.setElectronicBiasInc?.(0);
      controller.setRadical?.(K.RadicalOrder.NONE);
      editor.setActiveIaControllerId?.('MolNodeChargeIaController');
      return true;
    }
    case 'single':
      return activateBondTool(K, editor, K.BondOrder.SINGLE, K.BondStereo.NONE);
    case 'double':
      return activateBondTool(K, editor, K.BondOrder.DOUBLE, K.BondStereo.NONE);
    case 'triple':
      return activateBondTool(K, editor, K.BondOrder.TRIPLE, K.BondStereo.NONE);
    case 'wedgeUp':
      return activateBondTool(K, editor, K.BondOrder.SINGLE, K.BondStereo.UP);
    case 'wedgeDown':
      return activateBondTool(K, editor, K.BondOrder.SINGLE, K.BondStereo.DOWN);
    case 'dative':
      return activateBondTool(K, editor, K.BondOrder.SINGLE, K.BondStereo.NONE, K.BondType.COORDINATE);
    case 'wavy':
      return activateBondTool(K, editor, K.BondOrder.SINGLE, K.BondStereo.UP_OR_DOWN);
    case 'ring3':
      return activateRingTool(editor, 3, false);
    case 'ring4':
      return activateRingTool(editor, 4, false);
    case 'ring5':
      return activateRingTool(editor, 5, false);
    case 'ring6':
      return activateRingTool(editor, 6, false);
    case 'ring7':
      return activateRingTool(editor, 7, false);
    case 'ring8':
      return activateRingTool(editor, 8, false);
    case 'benzene':
      return activateRingTool(editor, 6, true);
    default:
      return false;
  }
}

/**
 * Kekule inserts the predefined substituents of its picker as condensed groups
 * (a `SubGroup` drawn as its abbreviation such as "Ph"). Expand them so the
 * canvas shows the real structure and the atoms stay editable.
 *
 * An R group is a `SubGroup` too, but without any child structure: expanding it
 * would replace its "R" label with an empty group, i.e. make it disappear.
 */
function expandCollapsedGroups(K: KekuleNamespace, composer: any) {
  let expanded = false;

  const visit = (obj: any) => {
    if (!obj) return;

    const expandable =
      obj instanceof K.SubGroup && (obj.getNodeCount?.() ?? 0) > 0;
    if (expandable && obj.isExpanded?.() === false) {
      obj.setExpanded?.(true);
      expanded = true;
    }

    const childCount = obj.getChildCount?.() ?? 0;
    for (let i = 0; i < childCount; i += 1) visit(obj.getChildAt?.(i));
  };

  for (const molecule of getMolecules(K, composer)) visit(molecule);
  return expanded;
}

export function createEditorBridge(
  K: KekuleNamespace,
  host: HTMLElement,
  callbacks: EditorBridgeCallbacks = {},
  settings: AppSettings = DEFAULT_SETTINGS,
): MoleculeEditorBridge {
  applyRenderTheme(K, settings);
  installBondLineStyle(K);
  installLabelBaseline(K);
  installElectronStateLabels(K);
  installDoubleClickGuard(K);
  installNodeSetter(K);
  installAtomOnlyNodePicker(K);
  installPeriodicTablePicker(
    K,
    (apply, currentSymbol) => callbacks.onRequestElementPick?.(apply, currentSymbol) ?? false,
  );

  let destroyed = false;
  const composer = new K.Editor.Composer(host);
  composer.setDimension?.('100%', '100%');

  // The React shell provides all controls; remove the native Kekule chrome.
  composer.setCommonToolButtons?.([]);
  composer.setChemToolButtons?.([]);
  composer.setEnableStyleToolbar?.(false);
  composer.setEnableObjModifierToolbar?.(false);
  composer.setShowInspector?.(false);
  composer.setBackgroundColor?.('rgba(0,0,0,0)');

  const environment2D = composer
    .getDisplayerConfigs?.()
    ?.getEnvironment2DConfigs?.();
  environment2D?.setAntialias?.(true);
  environment2D?.setAntialiasBlurRatio?.(0.18);
  environment2D?.setOverSamplingRatio?.(2);

  applyUiMarkerTheme(composer);

  const editor = composer.getEditor();
  let persistence: BoardPersistence | null = null;
  const board = createEditorBoard(K, composer, {
    onZoomChange: (zoom) => {
      callbacks.onZoomChange?.(zoom);
      // The zoom level is part of the persisted view.
      persistence?.scheduleSave();
    },
  });
  persistence = installBoardPersistence(K, composer, editor, board);

  installElementReplace(K, editor);

  const repaint = () => {
    composer.requestRepaint?.();
    composer.repaint?.();
  };

  const hasContent = () =>
    getMolecules(K, composer).some((molecule) => (molecule.getNodeCount?.() ?? 0) > 0);

  let pendingContentCheck = false;
  let contentRevision = 0;
  const notifyContentChange = () => {
    if (pendingContentCheck || destroyed) return;

    pendingContentCheck = true;
    window.requestAnimationFrame(() => {
      pendingContentCheck = false;
      if (destroyed) return;

      if (expandCollapsedGroups(K, composer)) {
        repaint();
      }

      contentRevision += 1;
      callbacks.onContentChange?.(hasContent(), contentRevision);
      board.notifyContentChanged();
      persistence?.scheduleSave();
    });
  };

  const notifySelectionChange = () => {
    if (destroyed) return;
    callbacks.onSelectionChange?.(createSelectionSnapshot(editor));
  };

  const finishSelectionTransform = () => {
    editor.recalcSelectionAreaMarker?.();
    repaint();
    notifyContentChange();
    notifySelectionChange();
  };

  const disposeClickSelection = installClickSelection(editor);

  editor.addEventListener?.('change', notifyContentChange);
  editor.addEventListener?.('editObjChanged', notifyContentChange);
  editor.addEventListener?.('selectionChange', notifySelectionChange);

  const bridge: MoleculeEditorBridge = {
    composer,
    editor,
    setTool(tool) {
      return applyTool(K, composer, tool);
    },
    hasContent,
    exportSmiles() {
      const molecules = getMolecules(K, composer);
      if (molecules.length === 0) return '';

      try {
        return molecules
          .map((molecule) => K.IO.saveFormatData(molecule, 'smi'))
          .filter((smiles: unknown): smiles is string => typeof smiles === 'string' && smiles.length > 0)
          .join('.');
      } catch (error) {
        console.error('[Kekule] Failed to export SMILES', error);
        return '';
      }
    },
    async exportImage(format) {
      if (!hasContent()) return null;

      const molecules = getMolecules(K, composer);
      // The chem space root keeps every molecule at its own coordinates, so a
      // single painter renders the whole board exactly as laid out.
      const root = composer.getEditor?.()?.getChemSpace?.()?.getRoot?.() ?? null;
      const chemObj = root ?? molecules[0];
      if (!chemObj) return null;

      try {
        return await exportMoleculeImage(K, chemObj, format, {
          bounds: getUnionBox(K, molecules),
        });
      } catch (error) {
        if (error instanceof EmptyStructureError) return null;
        throw error;
      }
    },
    collectValidationTargets() {
      const targets: ValidationTarget[] = [];

      for (const molecule of getMolecules(K, composer)) {
        const atoms: any[] = molecule.getNodes?.() ?? [];
        if (atoms.length === 0) continue;

        let molfile = '';
        let smiles = '';

        try {
          molfile = K.IO.saveFormatData(molecule, 'mol') ?? '';
        } catch (error) {
          console.warn('[Validation] Molfile export failed', error);
        }

        try {
          smiles = K.IO.saveFormatData(molecule, 'smi') ?? '';
        } catch (error) {
          console.warn('[Validation] SMILES export failed', error);
        }

        if (!molfile && !smiles) continue;

        targets.push({
          smiles: typeof smiles === 'string' ? smiles : '',
          molfile: typeof molfile === 'string' ? molfile : '',
          atoms,
        });
      }

      return targets;
    },
    getAtomScreenRing(atom) {
      try {
        const coord = atom?.getAbsCoord2D?.() ?? atom?.getCoord2D?.();
        const point = coord ? editor.objCoordToScreen?.(coord) : null;
        const client = editor.getEditClientElem?.();
        if (!point || !client) return null;

        let radius = 0;

        for (const connector of atom.getLinkedConnectors?.() ?? []) {
          const count = connector.getConnectedObjCount?.() ?? 0;

          for (let index = 0; index < count; index += 1) {
            const other = connector.getConnectedObjAt?.(index);
            if (!other || other === atom) continue;

            const otherCoord = other.getAbsCoord2D?.() ?? other.getCoord2D?.();
            const otherPoint = otherCoord ? editor.objCoordToScreen?.(otherCoord) : null;
            if (!otherPoint) continue;

            radius = Math.hypot(otherPoint.x - point.x, otherPoint.y - point.y) * 0.44;
            break;
          }

          if (radius > 0) break;
        }

        if (radius <= 0) radius = 16 * (editor.getCurrZoom?.() ?? 1);

        const rect = client.getBoundingClientRect();

        return {
          x: rect.left + point.x,
          y: rect.top + point.y,
          radius: Math.min(Math.max(radius, 9), 72),
        };
      } catch {
        // The atom may have been deleted between validation and this frame.
        return null;
      }
    },
    async importSmiles(smiles) {
      const trimmed = smiles.trim();
      if (!trimmed) return false;

      try {
        const { Molecule: OclMolecule } = await loadOpenChemLib();
        const oclMolecule = OclMolecule.fromSmiles(trimmed);
        oclMolecule.inventCoordinates();

        const kekuleMolecule = K.IO.loadFormatData(oclMolecule.toMolfile(), 'mol');
        if (!kekuleMolecule) return false;

        composer.setChemObj?.(kekuleMolecule);
        repaint();
        refitAfterLoad(K, composer, board);
        return true;
      } catch (error) {
        console.error('[Kekule] Failed to import SMILES', error);
        return false;
      }
    },
    cleanUp() {
      const molecules = getMolecules(K, composer).filter(
        (molecule) => (molecule.getNodeCount?.() ?? 0) > 0,
      );
      if (molecules.length === 0) return 0;

      // Step 1: pack the scattered structures into tidy rows. This only moves
      // whole structures around - no coordinates are recomputed and no
      // OpenChemLib chunk is pulled in, so the whole call stays cheap.
      if (arrangeFragments(K, composer, editor)) {
        repaint();
      }

      // Step 2: normalise the view around whatever is on the canvas now.
      fitToView(K, composer, board, {
        coverage: VIEW_FIT_COVERAGE,
        maxZoom: MAX_ZOOM,
        minZoom: MIN_ZOOM,
      });
      repaint();
      board.notifyContentChanged();

      return molecules.length;
    },
    async relayout() {
      const molecules = getMolecules(K, composer);
      if (molecules.length === 0) return 0;

      let OclMolecule: typeof import('openchemlib').Molecule | null = null;
      try {
        ({ Molecule: OclMolecule } = await loadOpenChemLib());
      } catch (error) {
        console.warn('[Clean Up] OpenChemLib unavailable, using fallback layout', error);
      }

      const space = editor.getChemSpace?.();
      space?.beginUpdate?.();

      try {
        for (const molecule of molecules) {
          let cleaned = false;

          // Relayout keeps each structure's bond length; only the zoom is
          // normalised afterwards.
          const oldBondLength = getMedianBondLength(K, molecule);

          if (OclMolecule) {
            try {
              const molfile = K.IO.saveFormatData(molecule, 'mol');
              if (molfile) {
                const oclMolecule = OclMolecule.fromMolfile(molfile);
                oclMolecule.inventCoordinates();

                const cleanedMolecule = K.IO.loadFormatData(oclMolecule.toMolfile(), 'mol');
                const oldNodes: any[] = molecule.getNodes?.() ?? [];
                const newNodes: any[] = cleanedMolecule?.getNodes?.() ?? [];

                if (oldNodes.length > 0 && newNodes.length === oldNodes.length) {
                  const sameAtoms = oldNodes.every(
                    (node, index) => node.getSymbol?.() === newNodes[index].getSymbol?.(),
                  );

                  if (sameAtoms) {
                    const newBondLength = getMedianBondLength(K, cleanedMolecule);
                    const rawScale = newBondLength > 0 ? oldBondLength / newBondLength : 1;
                    const scale = Math.min(Math.max(rawScale, 0.2), 5);

                    const oldCenter = getCentroid(oldNodes);
                    const rawNewCenter = getCentroid(newNodes);
                    const newCenter = {
                      x: rawNewCenter.x * scale,
                      y: rawNewCenter.y * scale,
                    };
                    const offsetX = oldCenter.x - newCenter.x;
                    const offsetY = oldCenter.y - newCenter.y;

                    oldNodes.forEach((node, index) => {
                      const coord = newNodes[index].getCoord2D?.(true);
                      if (coord) {
                        node.setCoord2D?.({
                          x: coord.x * scale + offsetX,
                          y: coord.y * scale + offsetY,
                        });
                      }
                    });

                    cleaned = true;
                  }
                }
              }
            } catch (error) {
              console.warn('[Clean Up] OpenChemLib layout failed, using fallback', error);
            }
          }

          if (!cleaned) {
            layoutMolecule(K, molecule, oldBondLength);
          }
        }
      } finally {
        space?.endUpdate?.();
      }

      // Only the geometry is normalised here. Arranging the structures and
      // fitting the view is the job of Clean Up view, so the camera stays put
      // and the two actions never do each other's work.
      repaint();
      board.notifyContentChanged();

      return molecules.length;
    },
    clear() {
      composer.newDoc?.();
      repaint();
      board.centerEmptyView();
      // An explicit clear must not come back after a refresh: write the empty
      // board right away and once more after deferred change events settle.
      persistence?.save();
      persistence?.scheduleSave();
    },
    readSelection() {
      return createSelectionSnapshot(editor);
    },
    rotateSelection(angle) {
      if (!Number.isFinite(angle) || angle === 0) return false;
      const applied = transformSelection(K, editor, { rotate: angle });
      if (applied) finishSelectionTransform();
      return applied;
    },
    mirrorSelection(axis) {
      const applied = transformSelection(K, editor, { mirror: axis });
      if (applied) finishSelectionTransform();
      return applied;
    },
    deleteSelection() {
      if (!editor.hasSelection?.()) return false;

      // deleteSelectedObjs() is a no-op on the base editor; the eraser
      // controller owns the real removal operation.
      const eraser = editor.getIaController?.('BasicMolEraserIaController');
      if (!eraser?.removeSelection) return false;

      eraser.removeSelection();
      finishSelectionTransform();
      return true;
    },
    handleResize() {
      const scroller = getEditorScroller(editor);
      const previousScroll = scroller
        ? { left: scroller.scrollLeft, top: scroller.scrollTop }
        : null;

      composer.resized?.();
      board.rebalance();

      // Kekule snaps the scroll position back to the origin while resizing.
      if (scroller && previousScroll) {
        window.requestAnimationFrame(() => {
          scroller.scrollLeft = previousScroll.left;
          scroller.scrollTop = previousScroll.top;
        });
      }
    },
    undo() {
      composer.undo?.();
      repaint();
    },
    redo() {
      composer.redo?.();
      repaint();
    },
    zoomIn() {
      editor.zoomIn?.();
      board.rebalance();
    },
    zoomOut() {
      editor.zoomOut?.();
      board.rebalance();
    },
    resetZoom() {
      if (!fitToView(K, composer, board)) {
        editor.resetZoom?.();
      }
      board.rebalance();
    },
    async loadFile(file) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'smi' || extension === 'smiles') {
        try {
          return await bridge.importSmiles(await file.text());
        } catch (error) {
          console.error('[Kekule] Failed to load SMILES file', error);
          return false;
        }
      }

      return new Promise((resolve) => {
        try {
          K.IO.loadFileData(
            file,
            (obj: any, success: boolean) => {
              if (!success || !obj) {
                resolve(false);
                return;
              }

              try {
                if (obj instanceof K.StructureFragment) {
                  const hasCoords = obj.nodesHasCoordOfMode?.(K.CoordMode.COORD2D, true, true);
                  if (!hasCoords) layoutMolecule(K, obj);
                } else {
                  const root = obj.getRoot?.();
                  const childCount = root?.getChildCount?.() ?? 0;
                  for (let i = 0; i < childCount; i += 1) {
                    const child = root.getChildAt?.(i);
                    if (child instanceof K.StructureFragment) {
                      const hasCoords = child.nodesHasCoordOfMode?.(K.CoordMode.COORD2D, true, true);
                      if (!hasCoords) layoutMolecule(K, child);
                    }
                  }
                }

                composer.setChemObj?.(obj);
                repaint();
                refitAfterLoad(K, composer, board);
                resolve(true);
              } catch (error) {
                console.error('[Kekule] Failed to render loaded file', error);
                resolve(false);
              }
            },
          );
        } catch (error) {
          console.error('[Kekule] Failed to load file', error);
          resolve(false);
        }
      });
    },
    destroy() {
      destroyed = true;
      persistence?.dispose();
      persistence = null;
      disposeClickSelection();
      board.dispose();
      editor.removeEventListener?.('change', notifyContentChange);
      editor.removeEventListener?.('editObjChanged', notifyContentChange);
      editor.removeEventListener?.('selectionChange', notifySelectionChange);
      try {
        composer.finalize?.();
      } catch (error) {
        console.warn('[Kekule] Composer cleanup failed', error);
      }
      host.replaceChildren();
    },
    applySettings(next) {
      if (destroyed) return;

      applyRenderTheme(K, next);
      applyUiMarkerTheme(composer);
      repaint();
    },
  };

  if (import.meta.env.DEV) {
    window.__zephyrleaEditor = bridge;
  }

  window.requestAnimationFrame(() => {
    if (destroyed) return;
    composer.resized?.();
    applyTool(K, composer, 'single');

    const restored = persistence?.restore() ?? false;
    repaint();
    if (!restored) board.centerEmptyView();

    callbacks.onContentChange?.(hasContent(), contentRevision);
    callbacks.onZoomChange?.(editor.getCurrZoom?.() ?? 1);
  });

  return bridge;
}

