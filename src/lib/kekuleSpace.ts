import type { KekuleNamespace } from './kekule';

export interface Box2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function getMolecules(K: KekuleNamespace, composer: any): any[] {
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

export function getUnionBox(K: KekuleNamespace, molecules: any[]): Box2D | null {
  let box: Box2D | null = null;

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

/** Element that actually scrolls the drawing surface. */
export function getEditorScroller(editor: any): HTMLElement | undefined {
  return editor?.getEditClientElem?.()?.parentNode ?? undefined;
}

/** Rendered pixels per object-coordinate unit, current zoom included. */
export function getObjScreenScale(editor: any): number {
  const origin = editor?.objCoordToScreen?.({ x: 0, y: 0 });
  const unit = editor?.objCoordToScreen?.({ x: 1, y: 0 });
  if (!origin || !unit) return 0;

  return Math.abs(unit.x - origin.x);
}
