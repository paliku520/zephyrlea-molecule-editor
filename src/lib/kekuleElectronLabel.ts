import type { KekuleNamespace } from './kekule';

type AnyFn = (...args: any[]) => any;

interface PatchFlags {
  __zephyrleaElectronLabel?: boolean;
}

function hasElectronState(node: any) {
  return Boolean(
    node?.getCharge?.() || node?.getRadical?.() || node?.getElectronicBias?.(),
  );
}

/**
 * Kekule renders charges/radicals of plain atoms as detached marker objects
 * placed in the "most empty" direction around the atom, and it hides the
 * element symbol of unlabelled carbons. That reads as a floating "+" with no
 * atom behind it. Draw the state inline as a superscript of the atom label
 * instead, so an ion shows up as "C+" / "NH2+" like a printed structure.
 */
export function installElectronStateLabels(K: KekuleNamespace) {
  const nodeProto = K.ChemStructureNode?.prototype as
    | (PatchFlags & { getDisplayRichText?: AnyFn })
    | undefined;
  const atomProto = K.AbstractAtom?.prototype as
    | (PatchFlags & { getDisplayRichText?: AnyFn })
    | undefined;
  const rendererProto = K.Render?.ChemCtab2DRenderer?.prototype as
    | (PatchFlags & {
        _needNodeDrawLabel?: AnyFn;
        _decideNodeLabelCharDirection?: AnyFn;
      })
    | undefined;
  const markerProto = K.Render?.TextBasedChemMarker2DRenderer?.prototype as
    | (PatchFlags & { getRichText?: AnyFn })
    | undefined;

  if (!nodeProto || !atomProto || !rendererProto || !markerProto) return;
  if (rendererProto.__zephyrleaElectronLabel) return;

  rendererProto.__zephyrleaElectronLabel = true;

  // Kekule materialises a charge/radical marker object for every atom on each
  // repaint; keeping that off lets the label stay the single source of truth.
  K.Render?.getRender2DConfigs?.()
    ?.getMoleculeDisplayConfigs?.()
    ?.setAutoCreateChargeAndRadicalMarker?.(false);

  const nodeRichText = nodeProto.getDisplayRichText;
  const atomRichText = atomProto.getDisplayRichText;
  const hydrogenLevels = K.Render?.HydrogenDisplayLevel ?? {};

  if (typeof nodeRichText === 'function') {
    nodeProto.getDisplayRichText = function patchedNodeRichText(
      level: any,
      showElectronState: any,
      labelConfigs: any,
      ...rest: any[]
    ) {
      // Force the state into the label only when a label is actually rendered.
      const show = labelConfigs ? true : showElectronState;
      return nodeRichText.call(this, level, show, labelConfigs, ...rest);
    };
  }

  if (typeof atomRichText === 'function' && typeof nodeRichText === 'function') {
    // Hydrogens belong before the superscript charge: "CH3+" instead of "C+H3".
    atomProto.getDisplayRichText = function patchedAtomRichText(
      this: any,
      level: any,
      _showElectronState: any,
      labelConfigs: any,
      decimals: any,
      markType: any,
      distinguish: any,
    ) {
      const hydrogenLevel = level ?? hydrogenLevels.DEFAULT;
      let text = nodeRichText.call(
        this,
        hydrogenLevel,
        false,
        labelConfigs,
        decimals,
        markType,
        distinguish,
      );

      let hydrogenCount = 0;
      switch (hydrogenLevel) {
        case hydrogenLevels.ALL:
          hydrogenCount = this.getHydrogenCount?.() ?? 0;
          break;
        case hydrogenLevels.EXPLICIT:
          hydrogenCount = this.getExplicitHydrogenCount?.() ?? 0;
          break;
        case hydrogenLevels.UNMATCHED_EXPLICIT:
          hydrogenCount =
            this.getImplicitHydrogenCount?.() !== this.getExplicitHydrogenCount?.()
              ? this.getExplicitHydrogenCount?.() ?? 0
              : 0;
          break;
        default:
          hydrogenCount = 0;
      }

      if (hydrogenCount) {
        text = this.appendHydrogenDisplayText?.(text, hydrogenCount) ?? text;
      }

      return (
        this.appendElectronStateDisplayText?.(
          text,
          decimals,
          markType,
          distinguish,
          labelConfigs?.getElectronicBiasMark?.() ?? null,
        ) ?? text
      );
    };
  }

  const needNodeDrawLabel = rendererProto._needNodeDrawLabel;
  if (typeof needNodeDrawLabel === 'function') {
    rendererProto._needNodeDrawLabel = function patchedNeedNodeDrawLabel(
      node: any,
      options: any,
    ) {
      if (node instanceof K.ChemStructureNode && hasElectronState(node)) return true;
      return needNodeDrawLabel.call(this, node, options);
    };
  }

  const decideCharDirection = rendererProto._decideNodeLabelCharDirection;
  if (typeof decideCharDirection === 'function') {
    // A vertical label would stack the charge under the symbol ("+ over C"),
    // so charged atoms always keep the horizontal run the reference uses.
    rendererProto._decideNodeLabelCharDirection = function patchedDecideCharDirection(
      context: any,
      node: any,
    ) {
      if (node instanceof K.ChemStructureNode && hasElectronState(node)) {
        return K.Render.TextDirection.LTR;
      }
      return decideCharDirection.call(this, context, node);
    };
  }

  const chargeMarkerClass = K.ChemMarker?.Charge;
  const radicalMarkerClass = K.ChemMarker?.Radical;
  const markerRichText = markerProto.getRichText;

  if (typeof markerRichText === 'function' && chargeMarkerClass && radicalMarkerClass) {
    markerProto.getRichText = function patchedMarkerRichText(obj: any, options: any) {
      const parent = obj?.getParent?.();
      const isStateMarker =
        obj instanceof chargeMarkerClass || obj instanceof radicalMarkerClass;

      // The label already carries the state; a detached marker would double it.
      if (isStateMarker && parent instanceof K.ChemStructureNode && hasElectronState(parent)) {
        return null;
      }

      return markerRichText.call(this, obj, options);
    };
  }
}
