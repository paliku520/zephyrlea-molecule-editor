import type { KekuleNamespace } from './kekule';

/**
 * Kekule centers the whole line box of an atom label on the node coordinate,
 * but the glyphs themselves only fill the cap height, so labels such as "N"
 * end up about 0.15em above the atom and the bonds point past them. Nudge the
 * drawn text down by that fraction so the label sits between its bonds.
 */
const LABEL_BASELINE_SHIFT = 0.15;

interface LabelPatchedProto {
  __zephyrleaLabelBaseline?: boolean;
}

export function installLabelBaseline(K: KekuleNamespace) {
  const proto = K.Render.CanvasRendererBridge?.prototype as
    | (LabelPatchedProto & { drawText?: (...args: any[]) => any })
    | undefined;
  const drawText = proto?.drawText;
  if (!proto || !drawText || proto.__zephyrleaLabelBaseline) return;

  proto.__zephyrleaLabelBaseline = true;
  proto.drawText = function patchedDrawText(context, coord, text, options) {
    const fontSize = options?.fontSize;
    const shifted =
      typeof fontSize === 'number' && fontSize > 0
        ? { x: coord.x, y: coord.y + fontSize * LABEL_BASELINE_SHIFT }
        : coord;

    return drawText.call(this, context, shifted, text, options);
  };
}
