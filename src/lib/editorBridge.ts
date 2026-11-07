import type { KekuleNamespace } from './kekule';
import { installBondLineStyle } from './kekuleBondStyle';
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

function getUnionBox(K: KekuleNamespace, molecules: any[]) {
  let box: { x1: number; y1: number; x2: number; y2: number } | null = null;

  for (const molecule of molecules) {
    const current = K.Render.ObjUtils.getContainerBox?.(molecule, K.CoordMode.COORD2D, true);
    if (!current) continue;

    if (!box) {
      box = { x1: current.x1, y1: current.y1, x2: current.x2, y2: current.y2 };
    } else {
      box.x1 = Math.min(box.x1, current.x1);
      box.y1 = Math.min(box.y1, current.y1);
      box.x2 = Math.max(box.x2, current.x2);
      box.y2 = Math.max(box.y2, current.y2);
    }
  }

  return box;
}

function fitToView(K: KekuleNamespace, composer: any) {
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

  const padding = 120;
  const factor = Math.min(
    (visible.width - padding) / contentWidth,
    (visible.height - padding) / contentHeight,
  );
  const currentZoom = editor.getCurrZoom?.() ?? 1;
  const targetZoom = Math.max(0.45, Math.min(currentZoom * factor, 2.6));

  editor.zoomTo?.(targetZoom);
  rebalanceBoard(K, composer, { preserveViewCenter: false });

  // Kekule finishes its own layout (and may reset the scroll) right after a
  // zoom or a document load, so center the content a few times.
  const centerOnMolecules = () => {
    editor.scrollClientToObject?.(molecules, { scrollToCenter: true, coverMostObjs: true });
  };
  centerOnMolecules();
  window.requestAnimationFrame(centerOnMolecules);
  window.setTimeout(centerOnMolecules, 80);

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

function getEditorScroller(editor: any): HTMLElement | undefined {
  return editor?.getEditClientElem?.()?.parentNode ?? undefined;
}

/**
 * Center the viewport on the drawing surface. Starting at a corner leaves the
 * scroll at a boundary, so panning away from that edge does nothing.
 */
function centerEditorView(editor: any) {
  const scroller = getEditorScroller(editor);
  if (!scroller) return;

  const left = Math.max(0, Math.round((scroller.scrollWidth - scroller.clientWidth) / 2));
  const top = Math.max(0, Math.round((scroller.scrollHeight - scroller.clientHeight) / 2));

  if (scroller.scrollLeft !== left) scroller.scrollLeft = left;
  if (scroller.scrollTop !== top) scroller.scrollTop = top;
}

/**
 * Target size of the drawing surface. Kekule sizes its canvas layers as
 * `screenSize * zoom`, so the surface is expressed in rendered pixels and then
 * converted back with the current zoom; this keeps both the panning room and
 * the canvas memory bounded at every zoom level.
 */
const BOARD_SPAN_FACTOR = 2.5;
const BOARD_TARGET_MIN_PX = 2400;
const BOARD_TARGET_MAX_PX = 3000;
/** Rendered pixels per side the canvas may reach; Kekule keeps 3 canvas layers. */
const BOARD_MAX_CANVAS_PX = 3600;
/** Chemical-space margin (in rendered px) that must stay free around the content. */
const BOARD_CONTENT_MARGIN_PX = 80;

function getBoardTarget(editor: any, scroller: HTMLElement) {
  const zoom = editor.getCurrZoom?.() || 1;
  const viewportX = scroller.clientWidth / zoom;
  const viewportY = scroller.clientHeight / zoom;

  const targetWidth = Math.min(
    Math.max(scroller.clientWidth * BOARD_SPAN_FACTOR, BOARD_TARGET_MIN_PX),
    BOARD_TARGET_MAX_PX,
  );
  const targetHeight = Math.min(
    Math.max(scroller.clientHeight * BOARD_SPAN_FACTOR, BOARD_TARGET_MIN_PX),
    BOARD_TARGET_MAX_PX,
  );

  return {
    zoom,
    viewportX,
    viewportY,
    desiredX: Math.max(targetWidth / zoom, viewportX),
    desiredY: Math.max(targetHeight / zoom, viewportY),
  };
}

/** Smallest surface (in screen px) that still contains the drawn content. */
function getContentMinScreenSize(K: KekuleNamespace, composer: any, zoom: number) {
  const box = getUnionBox(K, getMolecules(K, composer));
  const ratio = composer.getEditor?.()?.getChemSpace?.()?.getObjScreenLengthRatio?.() || 0;
  if (!box || !ratio) return null;

  const margin = (BOARD_CONTENT_MARGIN_PX / zoom) * ratio;
  const widthObj = Math.max(box.x2 - box.x1 + margin * 2, box.x2 + margin);
  const heightObj = Math.max(box.y2 - box.y1 + margin * 2, box.y2 + margin);

  return {
    x: widthObj / ratio,
    y: heightObj / ratio,
  };
}

/**
 * Keep the drawing surface sized for the current zoom: big enough to pan and
 * draw around the viewport, never smaller than the content, and bounded so the
 * canvas layers do not explode in memory at high zoom levels.
 */
function rebalanceBoard(
  K: KekuleNamespace,
  composer: any,
  options: { preserveViewCenter?: boolean } = {},
) {
  const preserveViewCenter = options.preserveViewCenter ?? true;
  const editor = composer.getEditor?.();
  const space = editor?.getChemSpace?.();
  const scroller = getEditorScroller(editor);
  if (!space || !scroller) return;

  const current = space.getScreenSize?.();
  if (!current || !current.x || !current.y) return;

  const target = getBoardTarget(editor, scroller);
  const contentMin = getContentMinScreenSize(K, composer, target.zoom);
  const contentX = contentMin?.x ?? 0;
  const contentY = contentMin?.y ?? 0;

  const floorX = Math.max(target.viewportX, contentX);
  const floorY = Math.max(target.viewportY, contentY);
  const ceilX = Math.max(BOARD_MAX_CANVAS_PX / target.zoom, floorX);
  const ceilY = Math.max(BOARD_MAX_CANVAS_PX / target.zoom, floorY);

  const nextX = Math.min(Math.max(target.desiredX, contentX, floorX), ceilX);
  const nextY = Math.min(Math.max(target.desiredY, contentY, floorY), ceilY);

  if (Math.abs(nextX - current.x) < 1 && Math.abs(nextY - current.y) < 1) return;

  // Resizing the surface changes the scroll range, so remember what the center
  // of the viewport points at and restore it afterwards.
  const viewCenter = preserveViewCenter
    ? editor.screenCoordToObj?.({
        x: scroller.scrollLeft + scroller.clientWidth / 2,
        y: scroller.scrollTop + scroller.clientHeight / 2,
      })
    : null;

  editor.changeChemSpaceScreenSize?.({
    x: Math.max(1, Math.round(nextX)),
    y: Math.max(1, Math.round(nextY)),
  });

  if (viewCenter) {
    // Kekule resets the scroll position asynchronously after a size change,
    // so keep re-applying until its own layout pass has finished.
    const restoreViewCenter = () => {
      const screenCoord = editor.objCoordToScreen?.(viewCenter);
      if (!screenCoord) return;

      const left = Math.max(0, Math.round(screenCoord.x - scroller.clientWidth / 2));
      const top = Math.max(0, Math.round(screenCoord.y - scroller.clientHeight / 2));

      if (scroller.scrollLeft !== left) scroller.scrollLeft = left;
      if (scroller.scrollTop !== top) scroller.scrollTop = top;
    };

    restoreViewCenter();
    window.requestAnimationFrame(restoreViewCenter);
    window.setTimeout(restoreViewCenter, 80);
  }
}

function centerEmptyView(K: KekuleNamespace, composer: any) {
  const editor = composer.getEditor?.();
  if (!editor) return;

  const apply = () => {
    rebalanceBoard(K, composer);
    centerEditorView(editor);
  };

  window.requestAnimationFrame(() => {
    apply();
    window.setTimeout(apply, 80);
    window.setTimeout(apply, 320);
  });
}

function refitAfterLoad(K: KekuleNamespace, composer: any) {
  const centerAndFit = () => {
    centerContentInSpace(K, composer);
    fitToView(K, composer);
    rebalanceBoard(K, composer);
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

function applyDarkRenderTheme(K: KekuleNamespace) {
  const renderConfigs = K.Render.getRender2DConfigs();
  const colorConfigs = renderConfigs.getColorConfigs();
  colorConfigs.setUseAtomSpecifiedColor(false);
  colorConfigs.setAtomColor(ATOM_COLOR);
  colorConfigs.setLabelColor(ATOM_COLOR);
  colorConfigs.setBondColor(BOND_COLOR);
  colorConfigs.setGlyphStrokeColor('#b9b9bd');
  colorConfigs.setGlyphFillColor('#8d8d92');

  const lengthConfigs = renderConfigs.getLengthConfigs();
  lengthConfigs.setBondLineWidth?.(1.5);
  lengthConfigs.setBoldBondLineWidthRatio?.(2);
}

function getMolecules(K: KekuleNamespace, composer: any): any[] {
  const result: any[] = [];
  const space = composer.getEditor?.()?.getChemSpace?.();
  const root = space?.getRoot?.();
  if (!root) return result;

  const visit = (obj: any) => {
    if (!obj) return;

    if (obj instanceof K.StructureFragment) {
      result.push(obj);
      return;
    }

    const childCount = obj.getChildCount?.() ?? 0;
    for (let i = 0; i < childCount; i += 1) {
      visit(obj.getChildAt?.(i));
    }
  };

  const childCount = root.getChildCount?.() ?? 0;
  for (let i = 0; i < childCount; i += 1) {
    visit(root.getChildAt?.(i));
  }

  return result;
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

  const editor = composer.getEditor();

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
      if (!destroyed) callbacks.onContentChange?.(hasContent());
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
        refitAfterLoad(K, composer);
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

      // Deliberately keep the current zoom and scroll position.
      repaint();
      return molecules.length;
    },
    clear() {
      composer.newDoc?.();
      repaint();
      centerEmptyView(K, composer);
    },
    handleResize() {
      const scroller = getEditorScroller(editor);
      const previousScroll = scroller
        ? { left: scroller.scrollLeft, top: scroller.scrollTop }
        : null;

      composer.resized?.();
      rebalanceBoard(K, composer);

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
      rebalanceBoard(K, composer);
    },
    zoomOut() {
      editor.zoomOut?.();
      rebalanceBoard(K, composer);
    },
    resetZoom() {
      if (!fitToView(K, composer)) {
        editor.resetZoom?.();
      }
      rebalanceBoard(K, composer);
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
                refitAfterLoad(K, composer);
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
    centerEmptyView(K, composer);
    callbacks.onContentChange?.(hasContent());
  });

  return bridge;
}

