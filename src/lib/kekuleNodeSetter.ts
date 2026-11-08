import type { KekuleNamespace } from './kekule';

type AnyFn = (...args: any[]) => any;

interface PatchFlags {
  __zephyrleaNodeSetter?: boolean;
}

interface PickerPatchFlags {
  __zephyrleaAtomOnlyPicker?: boolean;
}

interface PeriodicTablePatchFlags {
  __zephyrleaPeriodicTable?: boolean;
}

/**
 * Kekule opens its own unthemed periodic table dialog from the "…" button of the
 * dropdown, which is the only way to reach the rest of the elements. Swap in the
 * app's picker: `requestPick` returns false when nothing is listening, and the
 * native dialog is used as a fallback.
 */
export function installPeriodicTablePicker(
  K: KekuleNamespace,
  requestPick: (
    apply: (symbol: string) => void,
    currentSymbol: string | null,
  ) => boolean,
) {
  const panelProto = K.ChemWidget?.StructureNodeSelectPanel?.prototype as
    | (PeriodicTablePatchFlags & {
        _openPeriodicTableDialog?: AnyFn;
        getActiveNode?: AnyFn;
        generateSelectableDataFromElementSymbol?: AnyFn;
        doValueChanged?: AnyFn;
      })
    | undefined;
  if (!panelProto || panelProto.__zephyrleaPeriodicTable) return;

  const openDialog = panelProto._openPeriodicTableDialog;
  if (typeof openDialog !== 'function') return;

  panelProto.__zephyrleaPeriodicTable = true;
  panelProto._openPeriodicTableDialog = function patchedOpenPeriodicTable(
    button: any,
    onDialogClosed: any,
    options: any,
  ) {
    // Variable atom lists need Kekule's multi-select table.
    if (options?.isVarList || options?.isVarNotList) {
      return openDialog.call(this, button, onDialogClosed, options);
    }

    const active = this.getActiveNode?.();
    const node = Array.isArray(active) ? active[0] : active;
    const currentSymbol = node instanceof K.Atom ? node.getSymbol?.() ?? null : null;

    const handled = requestPick((symbol) => {
      const data = this.generateSelectableDataFromElementSymbol?.(symbol);
      if (data) this.doValueChanged?.(data);
    }, currentSymbol);

    if (handled) return undefined;
    return openDialog.call(this, button, onDialogClosed, options);
  };
}

/** Labels an R group can carry: "R", "R1", "R2" … */
const R_GROUP_LABEL = /^R\d*$/i;

/**
 * Kekule resolves the double-click editor through a registry keyed by class,
 * and only atoms are registered. An R group is a `SubGroup`, so double-clicking
 * one did nothing at all; registering the atom setter for sub groups gives the
 * same inline label box, and `applySetter` below turns its value back into an
 * R group instead of an element.
 */
export function installNodeSetter(K: KekuleNamespace) {
  const manager = K.Editor?.EmbeddedSetterManager;
  const setterClass = K.Editor?.EmbeddedSetter?.MolAtom;
  const proto = setterClass?.prototype as
    | (PatchFlags & { applySetter?: AnyFn; getCurrAtom?: AnyFn; getEditor?: AnyFn })
    | undefined;
  if (!manager || !setterClass || !proto || proto.__zephyrleaNodeSetter) return;

  proto.__zephyrleaNodeSetter = true;
  manager.register(setterClass, K.SubGroup);

  const applySetter = proto.applySetter;
  if (typeof applySetter !== 'function') return;

  proto.applySetter = function patchedApplySetter(widget: any, node: any) {
    const target = node ?? this.getCurrAtom?.();
    const data = createRGroupData(K, widget?.getValue?.());

    if (!data || !target) return applySetter.call(this, widget, node);

    const operation = K.Editor.OperationUtils?.createNodeModificationOperationFromData?.(
      target,
      data,
      this.getEditor?.(),
    );
    if (!operation) return applySetter.call(this, widget, node);

    this.getEditor?.().execOperation?.(operation);
    return undefined;
  };
}

/**
 * The label typed into the setter for an R group. Kekule turns "R1" into a
 * pseudo atom and the "R" chip into a sub group without a label, so both are
 * folded back into `abbr`, which is what the canvas draws. Anything else (an
 * element symbol) keeps Kekule's default behaviour and replaces the R group.
 */
function createRGroupData(K: KekuleNamespace, value: any) {
  if (!value) return null;

  const props = value.props ?? {};
  const label = props.abbr ?? props.isotopeId ?? props.symbol ?? value.label;

  if (typeof label !== 'string' || !R_GROUP_LABEL.test(label.trim())) {
    // The plain "R" chip arrives without a label but with the sub group class.
    if (value.nodeClass === K.SubGroup || value.nodeClass === K.RGroup) {
      return { nodeClass: K.RGroup, props: { abbr: 'R' } };
    }
    return null;
  }

  return { nodeClass: K.RGroup, props: { abbr: label.trim().toUpperCase() } };
}

/**
 * The double-click picker also offered the predefined substituents (Ph, NO2 …)
 * as ready-made groups, both as a "group" tab and as a text shortcut. Those
 * templates are hard to keep in sync with the rest of the editor, so only atoms
 * (and R groups) are offered now.
 */
export function installAtomOnlyNodePicker(K: KekuleNamespace) {
  const panelProto = K.ChemWidget?.StructureNodeSelectPanel?.prototype as
    | (PickerPatchFlags & { _getDisplayedTabPageNames?: AnyFn })
    | undefined;
  const repositoryItem = K.Editor?.StoredSubgroupRepositoryItem2D;

  if (panelProto && !panelProto.__zephyrleaAtomOnlyPicker) {
    panelProto.__zephyrleaAtomOnlyPicker = true;

    // The tab list drives both the tab strip and the page contents, so hiding
    // "subgroup" here removes the whole group page.
    const getTabPageNames = panelProto._getDisplayedTabPageNames;
    if (typeof getTabPageNames === 'function') {
      panelProto._getDisplayedTabPageNames = function patchedTabPageNames(...args: any[]) {
        const names: unknown = getTabPageNames.apply(this, args);
        return Array.isArray(names) ? names.filter((name) => name !== 'subgroup') : names;
      };
    }
  }

  if (typeof repositoryItem?.getRepItemOfInputText === 'function') {
    // Typing "Ph" must not silently expand into a predefined group either.
    repositoryItem.getRepItemOfInputText = () => null;
  }
}
