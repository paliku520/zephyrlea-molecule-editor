import initSciFormEngine, { embed } from 'sci-form-wasm';
import wasmUrl from 'sci-form-wasm/wasm?url';

/** One conformer produced by the local WASM engine. */
export interface Conformer3D {
  /**
   * V2000 molblock. Unlike XYZ it carries the bond orders the engine computed,
   * which is what lets 3Dmol draw double / triple / aromatic bonds natively.
   */
  molblock: string;
  atomCount: number;
  bondCount: number;
  /** Milliseconds reported by the engine. */
  elapsedMs: number;
  /** Number of disconnected structures merged into this conformer. */
  fragmentCount: number;
}

/** Shape of `embed()`'s JSON payload (`elements` holds atomic numbers). */
interface EmbedResult {
  smiles?: string;
  num_atoms?: number;
  coords?: number[];
  elements?: Array<number | string>;
  bonds?: Array<[number, number, string]>;
  error?: string | null;
  time_ms?: number;
}

const ELEMENT_SYMBOLS = (
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
  'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
).split(' ');

function resolveElement(element: number | string | undefined): string {
  if (typeof element === 'number') {
    return ELEMENT_SYMBOLS[element - 1] ?? 'X';
  }

  if (typeof element === 'string') {
    const trimmed = element.trim();
    if (!trimmed) return 'X';
    if (/^\d+$/.test(trimmed)) return ELEMENT_SYMBOLS[Number(trimmed) - 1] ?? 'X';
    return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  return 'X';
}

let enginePromise: Promise<void> | null = null;

/**
 * `init()` is idempotent for us but the factory itself must run once: a second
 * call would re-instantiate the module and leave the first instance pinned.
 */
export function loadConformerEngine(): Promise<void> {
  enginePromise ??= initSciFormEngine({ module_or_path: wasmUrl })
    .then(() => undefined)
    .catch((error: unknown) => {
      enginePromise = null;
      throw error;
    });

  return enginePromise;
}

/** MOL V2000 bond types. Aromatic bonds use 4, which 3Dmol renders as 1.5. */
const BOND_TYPES: Record<string, number> = {
  SINGLE: 1,
  DOUBLE: 2,
  TRIPLE: 3,
  AROMATIC: 4,
};

/** Gap between two structures placed side by side, in Ångström. */
const FRAGMENT_GAP = 4;

/** One atom / bond record parsed out of `embed()`'s JSON, still fragment-local. */
interface Fragment3D {
  elements: string[];
  coords: Array<[number, number, number]>;
  /** `[from, to, molType]` with fragment-local, 0-based atom indexes. */
  bonds: Array<[number, number, number]>;
}

function readFragment(result: EmbedResult): Fragment3D {
  const coords = result.coords ?? [];
  const elements = result.elements ?? [];
  const count = Math.min(
    result.num_atoms ?? elements.length,
    elements.length,
    Math.floor(coords.length / 3),
  );

  if (count <= 0) {
    throw new Error('本地引擎没有返回任何原子坐标。');
  }

  const fragment: Fragment3D = {
    elements: elements.slice(0, count).map((element) => resolveElement(element)),
    coords: Array.from({ length: count }, (_, index) => [
      coords[index * 3] ?? 0,
      coords[index * 3 + 1] ?? 0,
      coords[index * 3 + 2] ?? 0,
    ]),
    bonds: (result.bonds ?? [])
      .filter(([from, to]) => from >= 0 && to >= 0 && from < count && to < count && from !== to)
      .map(([from, to, order]) => [from, to, BOND_TYPES[String(order).toUpperCase()] ?? 1]),
  };

  return fragment;
}

/**
 * Place every fragment in a row along x so disconnected structures never overlap,
 * then centre the group on the origin. A single fragment keeps the coordinates
 * the engine produced.
 */
function layoutFragments(fragments: Fragment3D[]): Fragment3D {
  if (fragments.length <= 1) return fragments[0];

  let cursorX = 0;

  for (const fragment of fragments) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let sumY = 0;
    let sumZ = 0;

    for (const [x, y, z] of fragment.coords) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      sumY += y;
      sumZ += z;
    }

    const centerY = sumY / fragment.coords.length;
    const centerZ = sumZ / fragment.coords.length;
    const shiftX = cursorX - minX;

    fragment.coords = fragment.coords.map(([x, y, z]) => [
      x + shiftX,
      y - centerY,
      z - centerZ,
    ]);

    cursorX += maxX - minX + FRAGMENT_GAP;
  }

  const totalWidth = cursorX - FRAGMENT_GAP;
  const shift = -totalWidth / 2;
  for (const fragment of fragments) {
    fragment.coords = fragment.coords.map(([x, y, z]) => [x + shift, y, z]);
  }

  return {
    elements: fragments.flatMap((fragment) => fragment.elements),
    coords: fragments.flatMap((fragment) => fragment.coords),
    bonds: fragments.flatMap((fragment, fragmentIndex) => {
      const offset = fragments
        .slice(0, fragmentIndex)
        .reduce((sum, previous) => sum + previous.elements.length, 0);

      return fragment.bonds.map(
        ([from, to, type]) => [from + offset, to + offset, type] as [number, number, number],
      );
    }),
  };
}

function buildMolBlock(
  merged: Fragment3D,
  fragmentCount: number,
  title: string,
  elapsedMs: number,
): Conformer3D {
  const count = merged.elements.length;
  const bonds = merged.bonds;

  // V2000 stores both counts in three-character fields.
  if (count > 999 || bonds.length > 999) {
    throw new Error(`结构过大（${count} 个原子 / ${bonds.length} 根键），3D 视图仅支持 999 个原子以内。`);
  }

  // Three header lines, then the counts line, then atoms and bonds. The counts
  // line must keep the V2000 column layout: 11 three-character fields followed
  // by " V2000" (3Dmol reads the format tag from columns 35-39).
  const counts =
    `${String(count).padStart(3)}${String(bonds.length).padStart(3)}` +
    `${'  0'.repeat(9)} V2000`;

  const lines = [title, '  Zephyrlea  3D', '', counts];

  merged.coords.forEach(([rawX, rawY, rawZ], index) => {
    const x = rawX.toFixed(4).padStart(10);
    const y = rawY.toFixed(4).padStart(10);
    const z = rawZ.toFixed(4).padStart(10);
    lines.push(`${x}${y}${z} ${merged.elements[index].padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  });

  for (const [from, to, type] of bonds) {
    lines.push(
      `${String(from + 1).padStart(3)}${String(to + 1).padStart(3)}${String(type).padStart(3)}  0  0  0  0`,
    );
  }

  lines.push('M  END');

  return {
    molblock: `${lines.join('\n')}\n`,
    atomCount: count,
    bondCount: bonds.length,
    elapsedMs,
    fragmentCount,
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

/** `.` separates disconnected structures, so each one is embedded on its own. */
function splitComponents(smiles: string): string[] {
  return smiles
    .split('.')
    .map((component) => component.trim())
    .filter((component) => component.length > 0);
}

function embedOne(smiles: string, seed: number): EmbedResult {
  const raw = embed(smiles, seed);

  let parsed: EmbedResult;
  try {
    parsed = JSON.parse(raw) as EmbedResult;
  } catch {
    throw new Error(`本地引擎返回了无法解析的结果（${smiles}）。`);
  }

  if (parsed.error) throw new Error(parsed.error);

  return parsed;
}

/**
 * Generates a 3D conformer with the bundled `sci-form` WASM engine. `embed()` is
 * a synchronous WASM call, so the browser is yielded first to let the caller
 * paint its loading state before the main thread blocks.
 *
 * `embed()` keeps only one structure when the SMILES holds several, which is why
 * every component is embedded separately and the results are merged into a
 * single molblock with the structures laid out side by side.
 */
export async function computeConformer(smiles: string, seed = 42): Promise<Conformer3D> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new Error('画布为空，没有可生成 3D 构象的结构。');

  const components = splitComponents(trimmed);
  if (components.length === 0) throw new Error('画布为空，没有可生成 3D 构象的结构。');

  await loadConformerEngine();
  await nextFrame();

  let elapsedMs = 0;
  const fragments = components.map((component) => {
    const parsed = embedOne(component, seed);
    elapsedMs += parsed.time_ms ?? 0;
    return readFragment(parsed);
  });

  const merged = layoutFragments(fragments);
  const label = components.length > 1 ? `${components.length} structures` : trimmed;

  return buildMolBlock(
    merged,
    fragments.length,
    `sci-form-wasm conformer (seed ${seed}) for ${label}`,
    elapsedMs,
  );
}
