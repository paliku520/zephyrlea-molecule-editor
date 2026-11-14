import type { EditorBoard } from './editorBoard';
import type { KekuleNamespace } from './kekule';
import { getEditorScroller, getMolecules, getUnionBox } from './kekuleSpace';

/** Where the drawing of the 2D board lives in `localStorage`. */
export const BOARD_STORAGE_KEY = 'zephyrlea.board';
/** Bumped when the stored shape changes; snapshots of other versions are ignored. */
const STORAGE_VERSION = 1;
/** Quiet period after the last edit before the drawing is written. */
const SAVE_DELAY_MS = 600;

export interface StoredBoardMolecule {
  /** MDL molfile whose atom order matches `coords`. */
  mol: string;
  /** Absolute 2D position of every atom, in molfile atom order. */
  coords: Array<[number, number] | null>;
}

export interface StoredBoard {
  version: number;
  molecules: StoredBoardMolecule[];
  zoom: number;
  /** Viewport centre, relative to the centre of the drawing (chemical units). */
  viewOffset: [number, number] | null;
  /** Screen pixels per chemical unit the drawing was laid out with. */
  objScreenLengthRatio: number | null;
  /** Reference bond length the drawing surface was auto-scaled to. */
  autoScaleRefLength: number | null;
}

export interface BoardPersistence {
  /** Load the stored drawing into the editor; false when there was nothing to restore. */
  restore(): boolean;
  /** Debounced write after an edit or a view change. */
  scheduleSave(): void;
  /** Write the drawing right away (clear, page hide, teardown). */
  save(): void;
  /** Flush a pending write and stop listening. */
  dispose(): void;
}

interface Point {
  x: number;
  y: number;
}

function toPoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null;

  const { x, y } = value as { x?: unknown; y?: unknown };
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null;
  }

  return { x, y };
}

function parsePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;

  const [x, y] = value;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null;
  }

  return [x, y];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStoredBoard(value: unknown): StoredBoard | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  if (raw.version !== STORAGE_VERSION || !Array.isArray(raw.molecules)) return null;

  const molecules: StoredBoardMolecule[] = [];

  for (const entry of raw.molecules) {
    if (!entry || typeof entry !== 'object') continue;

    const { mol, coords } = entry as Record<string, unknown>;
    if (typeof mol !== 'string' || mol.length === 0) continue;

    molecules.push({
      mol,
      coords: Array.isArray(coords) ? coords.map(parsePair) : [],
    });
  }

  if (molecules.length === 0) return null;

  const zoom = finiteNumber(raw.zoom);
  const ratio = finiteNumber(raw.objScreenLengthRatio);
  const refLength = finiteNumber(raw.autoScaleRefLength);

  return {
    version: STORAGE_VERSION,
    molecules,
    zoom: zoom && zoom > 0 ? zoom : 1,
    viewOffset: parsePair(raw.viewOffset),
    objScreenLengthRatio: ratio && ratio > 0 ? ratio : null,
    autoScaleRefLength: refLength && refLength > 0 ? refLength : null,
  };
}

function loadStoredBoard(): StoredBoard | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(BOARD_STORAGE_KEY);
    return stored ? normalizeStoredBoard(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function saveStoredBoard(board: StoredBoard | null) {
  if (typeof window === 'undefined') return;

  try {
    if (!board || board.molecules.length === 0) {
      window.localStorage.removeItem(BOARD_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(board));
  } catch {
    // Private mode or a full quota: the drawing keeps working in memory only.
  }
}

/** Snapshot of everything a refresh has to bring back. */
function captureBoard(K: KekuleNamespace, composer: any, editor: any): StoredBoard {
  const fragments = getMolecules(K, composer).filter(
    (molecule) => (molecule.getNodeCount?.() ?? 0) > 0,
  );
  const molecules: StoredBoardMolecule[] = [];

  for (const molecule of fragments) {
    let mol = '';
    try {
      mol = K.IO.saveFormatData(molecule, 'mol') ?? '';
    } catch (error) {
      console.warn('[Board] Molfile export failed', error);
    }
    if (typeof mol !== 'string' || mol.length === 0) continue;

    // The molfile itself only round-trips relative atom positions; the editor
    // moves whole fragments around, so the absolute positions ride along here.
    const coords = (molecule.getNodes?.() ?? []).map((node: any) => {
      const point = toPoint(node.getAbsCoord2D?.(true)) ?? toPoint(node.getCoord2D?.(true));
      return point ? ([point.x, point.y] as [number, number]) : null;
    });

    molecules.push({ mol, coords });
  }

  const space = editor.getChemSpace?.();
  const box = getUnionBox(K, fragments);
  const scroller = getEditorScroller(editor);
  const viewCenter =
    scroller && editor.screenCoordToObj
      ? toPoint(
          editor.screenCoordToObj({
            x: scroller.scrollLeft + scroller.clientWidth / 2,
            y: scroller.scrollTop + scroller.clientHeight / 2,
          }),
        )
      : null;

  // The offset is stored instead of the absolute centre: the editor shifts the
  // drawing around the surface while it lays out, which moves every coordinate.
  const viewOffset =
    box && viewCenter
      ? ([
          viewCenter.x - (box.x1 + box.x2) / 2,
          viewCenter.y - (box.y1 + box.y2) / 2,
        ] as [number, number])
      : null;

  return {
    version: STORAGE_VERSION,
    molecules,
    zoom: Number(editor.getCurrZoom?.() ?? 1) || 1,
    viewOffset,
    objScreenLengthRatio: finiteNumber(space?.getObjScreenLengthRatio?.()),
    autoScaleRefLength: finiteNumber(space?.getDefAutoScaleRefLength?.()),
  };
}

/** Rebuild every stored fragment and append it to the chemical space. */
function restoreBoardContent(K: KekuleNamespace, editor: any, board: StoredBoard): boolean {
  const space = editor?.getChemSpace?.();
  if (!space?.appendChild) return false;

  const restored: any[] = [];

  for (const entry of board.molecules) {
    try {
      const molecule = K.IO.loadFormatData(entry.mol, 'mol');
      if (!molecule) continue;

      // Loaded fragments carry their own offset; zero it so the saved absolute
      // positions can be applied to the atoms verbatim.
      molecule.setCoord2D?.({ x: 0, y: 0 });

      const nodes: any[] = molecule.getNodes?.() ?? [];
      for (let index = 0; index < nodes.length && index < entry.coords.length; index += 1) {
        const coord = entry.coords[index];
        if (!coord) continue;

        nodes[index].setCoord2D?.({ x: coord[0], y: coord[1] });
      }

      restored.push(molecule);
    } catch (error) {
      console.warn('[Board] Molfile import failed', error);
    }
  }

  if (restored.length === 0) return false;

  space.beginUpdate?.();
  try {
    for (const molecule of restored) {
      space.appendChild(molecule);
    }
  } finally {
    space.endUpdate?.();
  }

  return true;
}

/**
 * Loading a structure makes Kekule auto-scale the surface to the bond lengths
 * of that structure. Restoring the fragments alone would keep the default
 * scale, so the saved scale is put back before the view is rebuilt.
 */
function restoreBoardScale(editor: any, stored: StoredBoard) {
  const space = editor?.getChemSpace?.();
  if (!space) return;

  if (stored.autoScaleRefLength) {
    space.setDefAutoScaleRefLength?.(stored.autoScaleRefLength);
  }
  if (!stored.objScreenLengthRatio) return;

  space.setObjScreenLengthRatio?.(stored.objScreenLengthRatio);

  // Surface size follows the ratio, and the board skips a resize it considers
  // unchanged, so recompute the size in chemical units right here.
  const screenSize = space.getScreenSize?.();
  if (screenSize?.x && screenSize?.y) {
    editor.changeChemSpaceScreenSize?.(screenSize);
  }
}

export function installBoardPersistence(
  K: KekuleNamespace,
  composer: any,
  editor: any,
  board: EditorBoard,
): BoardPersistence {
  let saveTimer = 0;
  let disposed = false;
  /** Saving only starts once the first layout pass ran (see `restore`). */
  let initialized = false;

  const save = () => {
    if (disposed || !initialized) return;
    saveStoredBoard(captureBoard(K, composer, editor));
  };

  const flush = () => {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = 0;
    }
    save();
  };

  const scheduleSave = () => {
    if (disposed || !initialized) return;

    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      save();
    }, SAVE_DELAY_MS);
  };

  const restore = () => {
    initialized = true;
    if (disposed) return false;

    const stored = loadStoredBoard();
    if (!stored || !restoreBoardContent(K, editor, stored)) return false;

    restoreBoardScale(editor, stored);
    composer.requestRepaint?.();

    // The surface has to fit the restored drawing before the saved zoom and
    // viewport position are applied on top of it.
    board.rebalance({ preserveViewCenter: false });

    if (Math.abs(stored.zoom - (editor.getCurrZoom?.() ?? 1)) > 1e-3) {
      editor.zoomTo?.(stored.zoom);
    }

    if (stored.viewOffset) {
      board.centerOnContentOffset({ x: stored.viewOffset[0], y: stored.viewOffset[1] });
    }
    board.notifyContentChanged();

    return true;
  };

  const onPageHide = () => flush();
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    restore,
    scheduleSave,
    save,
    dispose() {
      if (disposed) return;

      flush();
      disposed = true;
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
