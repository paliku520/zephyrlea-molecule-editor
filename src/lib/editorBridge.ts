import type { EditorBoard } from './editorBoard';
import { createEditorBoard } from './editorBoard';
import { ATOMIC_NUMBER_LIMIT, DEFAULT_ELEMENT_COLOR, ELEMENT_COLORS } from './elementColors';
import type { KekuleNamespace } from './kekule';
import { installBondLineStyle } from './kekuleBondStyle';
import { installLabelBaseline } from './kekuleLabelStyle';
import { getEditorScroller, getMolecules, getObjScreenScale, getUnionBox } from './kekuleSpace';
import { layoutMolecule } from './moleculeLayout';

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
  onContentChange?: (hasContent: boolean) => void;
}

export interface MoleculeEditorBridge {
  readonly composer: any;
  readonly editor: any;
  setTool(tool: ToolId): boolean;
  hasContent(): boolean;
  exportSmiles(): string;
  importSmiles(smiles: string): Promise<boolean>;
  cleanUp(): Promise<number>;
  clear(): void;
  undo(): void;
  redo(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  loadFile(file: File): Promise<boolean>;
  handleResize(): void;
  destroy(): void;
}

export const ATOM_COLOR = '#e9e9eb';
export const BOND_COLOR = '#e9e9eb';

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
}

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

  const padding = 120;
  const factor = Math.min(
    (visible.width - padding) / contentWidth,
    (visible.height - padding) / contentHeight,
  );
  const currentZoom = editor.getCurrZoom?.() ?? 1;
  const maxZoom = options.allowZoomIn === false ? currentZoom : 2.6;
  const minZoom = options.minZoom ?? 0.45;
  const targetZoom = Math.max(minZoom, Math.min(currentZoom * factor, maxZoom));

  editor.zoomTo?.(targetZoom);
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
 * evenly spaced block centred on the current viewport, keeping the zoom level
 * when it fits. Structures are placed in reading order (top row first, then
 * left to right) so the result follows the original layout.
 */
function arrangeFragments(
  K: KekuleNamespace,
  composer: any,
  editor: any,
  board: EditorBoard,
) {
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

  let result = layout();
  if (!result) return false;

  // Only shrink when the packed block cannot fit the viewport at this zoom.
  if (result.totalWidth > result.availableWidth || result.totalHeight > result.availableHeight) {
    const factor = Math.min(
      result.availableWidth / result.totalWidth,
      result.availableHeight / result.totalHeight,
    );

    if (factor < 0.98) {
      const currentZoom = editor.getCurrZoom?.() ?? 1;
      editor.zoomTo?.(Math.max(0.25, currentZoom * factor));
      board.clearPendingRestores();
      result = layout() ?? result;
    }
  }

  const blockCenter = { x: result.totalWidth / 2, y: result.totalHeight / 2 };
  const space = editor.getChemSpace?.();

  space?.beginUpdate?.();
  try {
    for (const item of result.placed) {
      const targetX = viewCenter.x + (item.x + item.width / 2 - blockCenter.x) / result.scale;
      const targetY = viewCenter.y - (item.y + item.height / 2 - blockCenter.y) / result.scale;
      const deltaX = targetX - item.centerX;
      const deltaY = targetY - item.centerY;

      for (const node of item.unit.nodes) {
        const coord = node.getCoord2D?.(true);
        if (!coord) continue;

        node.setCoord2D?.({ x: coord.x + deltaX, y: coord.y + deltaY });
      }
    }
  } finally {
    space?.endUpdate?.();
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
 * nitrogen). Replace it with the shell palette so heteroatom labels stay
 * readable on the dark canvas while carbons keep the neutral atom color.
 */
function installAtomPalette(K: KekuleNamespace) {
  const rendererType = K.Render.RendererType?.R2D;
  const colorSets = K.Render.atomColors;
  if (rendererType === undefined || !colorSets) return;

  const palette: string[] = new Array(ATOMIC_NUMBER_LIMIT).fill(DEFAULT_ELEMENT_COLOR);

  for (const [symbol, color] of Object.entries(ELEMENT_COLORS)) {
    const atomicNumber = new K.Atom(null, symbol).getAtomicNumber?.();
    if (typeof atomicNumber === 'number' && atomicNumber > 0 && atomicNumber < ATOMIC_NUMBER_LIMIT) {
      palette[atomicNumber] = color;
    }
  }

  colorSets[rendererType] = palette;
}

function applyDarkRenderTheme(K: KekuleNamespace) {
  installAtomPalette(K);

  const renderConfigs = K.Render.getRender2DConfigs();
  const colorConfigs = renderConfigs.getColorConfigs();
  colorConfigs.setUseAtomSpecifiedColor(true);
  colorConfigs.setAtomColor(ATOM_COLOR);
  colorConfigs.setLabelColor(ATOM_COLOR);
  colorConfigs.setBondColor(BOND_COLOR);
  colorConfigs.setGlyphStrokeColor('#b9b9bd');
  colorConfigs.setGlyphFillColor('#8d8d92');

  const lengthConfigs = renderConfigs.getLengthConfigs();
  lengthConfigs.setBondLineWidth?.(1.5);
  lengthConfigs.setBoldBondLineWidthRatio?.(2);
}

/** Kekule marks hovered/selected objects in pure blue; follow the shell accent. */
function applyUiMarkerTheme(composer: any) {
  const markers = composer.getEditorConfigs?.()?.getUiMarkerConfigs?.();
  if (!markers) return;

  const accent = getThemeAccent();
  markers.setHotTrackerColor?.(accent);
  markers.setHotTrackerOpacity?.(0.3);
  markers.setSelectionMarkerStrokeColor?.(accent);
  markers.setSelectionMarkerFillColor?.(accent);
  markers.setSelectionMarkerOpacity?.(0.2);
}

function getThemeAccent() {
  const fallback = '#89b5fa';
  if (typeof window === 'undefined') return fallback;

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-accent')
    .trim();

  return value || fallback;
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
  const controller = editor.getIaController?.('RepositoryStructureFragmentIaController');
  if (!controller) return false;

  controller.setRepositoryItem?.(createElementRepositoryItem(K, symbol));
  editor.setActiveIaControllerId?.('RepositoryStructureFragmentIaController');
  return true;
}

function applyTool(K: KekuleNamespace, composer: any, tool: ToolId): boolean {
  const editor = composer.getEditor?.();
  if (!editor) return false;

  if (tool.startsWith('element:')) {
    return activateElementTool(K, editor, tool.slice('element:'.length));
  }

  switch (tool) {
    case 'select':
      editor.setActiveIaControllerId?.('SelectIaController');
      return true;
    case 'pan':
      editor.setActiveIaControllerId?.('ClientDragScrollIaController');
      return true;
    case 'erase':
      editor.setActiveIaControllerId?.('BasicMolEraserIaController');
      return true;
    case 'lasso': {
      const controller = editor.getIaController?.('SelectIaController');
      controller?.setSelectMode?.(K.Editor.SelectMode.POLYGON);
      editor.setActiveIaControllerId?.('SelectIaController');
      return true;
    }
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

export function createEditorBridge(
  K: KekuleNamespace,
  host: HTMLElement,
  callbacks: EditorBridgeCallbacks = {},
): MoleculeEditorBridge {
  applyDarkRenderTheme(K);
  installBondLineStyle(K);
  installLabelBaseline(K);

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
  const board = createEditorBoard(K, composer);

  const repaint = () => {
    composer.requestRepaint?.();
    composer.repaint?.();
  };

  const hasContent = () =>
    getMolecules(K, composer).some((molecule) => (molecule.getNodeCount?.() ?? 0) > 0);

  let pendingContentCheck = false;
  const notifyContentChange = () => {
    if (pendingContentCheck || destroyed) return;

    pendingContentCheck = true;
    window.requestAnimationFrame(() => {
      pendingContentCheck = false;
      if (destroyed) return;

      callbacks.onContentChange?.(hasContent());
      board.notifyContentChanged();
    });
  };

  editor.addEventListener?.('change', notifyContentChange);
  editor.addEventListener?.('editObjChanged', notifyContentChange);

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
    async cleanUp() {
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

          // Keep the on-screen size stable: Clean Up must not change zoom or bond length.
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

      // Cleaning never enlarges the drawing: the zoom stays put and the
      // structures themselves are moved into a tidy block in the middle of the
      // view. A single structure that is already on screen is left untouched.
      repaint();

      if (arrangeFragments(K, composer, editor, board)) {
        repaint();
        board.notifyContentChanged();
      }

      return molecules.length;
    },
    clear() {
      composer.newDoc?.();
      repaint();
      board.centerEmptyView();
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
      board.dispose();
      editor.removeEventListener?.('change', notifyContentChange);
      editor.removeEventListener?.('editObjChanged', notifyContentChange);
      try {
        composer.finalize?.();
      } catch (error) {
        console.warn('[Kekule] Composer cleanup failed', error);
      }
      host.replaceChildren();
    },
  };

  if (import.meta.env.DEV) {
    window.__zephyrleaEditor = bridge;
  }

  window.requestAnimationFrame(() => {
    if (destroyed) return;
    composer.resized?.();
    applyTool(K, composer, 'single');
    repaint();
    board.centerEmptyView();
    callbacks.onContentChange?.(hasContent());
  });

  return bridge;
}

