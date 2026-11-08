import createRDKitModule from '@rdkit/rdkit';
import type { Mol } from '@rdkit/rdkit';
import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';

export type RDKitModule = Awaited<ReturnType<typeof createRDKitModule>>;

/** A chemistry problem reported by RDKit for one structure. */
export interface RDKitProblem {
  /** RDKit exception name, e.g. `AtomValenceException`. */
  type: string;
  /** Raw RDKit message, e.g. `Explicit valence for atom # 0 C, 5, is greater than permitted`. */
  message: string;
  /** 0-based atom index inside the validated structure, when RDKit reports one. */
  atomIndex: number | null;
  atomSymbol?: string;
  valence?: number;
}

/** Everything the analysis panel shows for one structure on the canvas. */
export interface MoleculeInfo {
  /** Hill formula, e.g. `C9H8O4`. */
  formula: string;
  /** Sum of the formal charges of all atoms. */
  charge: number;
  /** Average molecular weight. */
  mass: number;
  /** Monoisotopic mass. */
  exactMass: number;
  heavyAtoms: number;
  /** Heavy atoms plus implicit hydrogens. */
  totalAtoms: number;
  bonds: number;
  rings: number;
  aromaticRings: number;
  rotatableBonds: number;
  hydrogenDonors: number;
  hydrogenAcceptors: number;
  /** Topological polar surface area in Å². */
  polarSurfaceArea: number;
  /** Crippen logP. */
  logP: number;
  /** Canonical SMILES produced by RDKit. */
  smiles: string;
}

/** Atom defaults emitted by `Mol.get_json()`; omitted fields fall back to these. */
interface JsonAtom {
  z?: number;
  impHs?: number;
  chg?: number;
}

interface JsonMol {
  defaults?: { atom?: JsonAtom };
  molecules?: { atoms?: JsonAtom[] }[];
}

interface JsonDescriptors {
  amw?: number;
  exactmw?: number;
  NumHeavyAtoms?: number;
  NumAtoms?: number;
  NumRings?: number;
  NumAromaticRings?: number;
  NumRotatableBonds?: number;
  NumHBD?: number;
  NumHBA?: number;
  tpsa?: number;
  CrippenClogP?: number;
}

const ELEMENT_SYMBOLS = [
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br',
  'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te',
  'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm',
  'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn',
  'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
];

function elementSymbol(atomicNumber: number): string {
  if (atomicNumber <= 0) return '*';
  return ELEMENT_SYMBOLS[atomicNumber - 1] ?? `X${atomicNumber}`;
}

/** Hill order: C, H, then the rest alphabetically; without carbon everything is alphabetical. */
function toHillFormula(counts: Map<string, number>): string {
  const symbols = [...counts.keys()];
  const ordered = counts.has('C')
    ? ['C', ...(counts.has('H') ? ['H'] : []), ...symbols.filter((s) => s !== 'C' && s !== 'H').sort()]
    : symbols.sort();

  return ordered
    .map((symbol) => {
      const count = counts.get(symbol) ?? 0;
      return count === 1 ? symbol : `${symbol}${count}`;
    })
    .join('');
}

function buildFormula(atoms: JsonAtom[], defaultAtomicNumber: number): { formula: string; charge: number } {
  const counts = new Map<string, number>();
  let charge = 0;

  for (const atom of atoms) {
    const symbol = elementSymbol(atom.z ?? defaultAtomicNumber);
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);

    const hydrogens = atom.impHs ?? 0;
    if (hydrogens > 0) counts.set('H', (counts.get('H') ?? 0) + hydrogens);

    charge += atom.chg ?? 0;
  }

  return { formula: toHillFormula(counts), charge };
}

function descriptor(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readMoleculeInfo(RDKit: RDKitModule, source: ProblemSource): MoleculeInfo | null {
  let mol: Mol | null = null;

  try {
    mol = RDKit.get_mol(source.smiles) ?? (source.molfile ? RDKit.get_mol(source.molfile) : null);
    if (!mol) return null;

    const json = JSON.parse(mol.get_json()) as JsonMol;
    const atoms = json.molecules?.[0]?.atoms ?? [];
    const { formula, charge } = buildFormula(atoms, json.defaults?.atom?.z ?? 6);
    const descriptors = JSON.parse(mol.get_descriptors()) as JsonDescriptors;

    return {
      formula,
      charge,
      mass: descriptor(descriptors.amw),
      exactMass: descriptor(descriptors.exactmw),
      heavyAtoms: descriptor(descriptors.NumHeavyAtoms, atoms.length),
      totalAtoms: descriptor(descriptors.NumAtoms, atoms.length),
      bonds: mol.get_num_bonds(),
      rings: descriptor(descriptors.NumRings),
      aromaticRings: descriptor(descriptors.NumAromaticRings),
      rotatableBonds: descriptor(descriptors.NumRotatableBonds),
      hydrogenDonors: descriptor(descriptors.NumHBD),
      hydrogenAcceptors: descriptor(descriptors.NumHBA),
      polarSurfaceArea: descriptor(descriptors.tpsa),
      logP: descriptor(descriptors.CrippenClogP),
      smiles: mol.get_smiles(),
    };
  } catch (error) {
    console.warn('[RDKit] Molecule analysis failed', error);
    return null;
  } finally {
    mol?.delete();
  }
}

let modulePromise: Promise<RDKitModule> | null = null;

export function loadRDKit(): Promise<RDKitModule> {
  modulePromise ??= createRDKitModule({
    locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
  }).catch((error: unknown) => {
    modulePromise = null;
    throw error;
  });

  return modulePromise;
}

const LOG_CHANNEL = 'rdApp.error';

/**
 * RDKit's MinimalLib does not expose `detect_chemistry_problems` in this build
 * (see `RDKit_minimal.d.ts`), so the fallback below re-runs RDKit's sanitizer
 * while capturing the C++ error log. That log carries the very same exception
 * text the dedicated API would return.
 */
let logCapture: ReturnType<RDKitModule['set_log_capture']> = null;

function captureLog(RDKit: RDKitModule, action: () => void): string {
  logCapture ??= RDKit.set_log_capture(LOG_CHANNEL);
  logCapture?.clear_buffer?.();

  try {
    action();
    return logCapture?.get_buffer?.() ?? '';
  } finally {
    logCapture?.clear_buffer?.();
  }
}

const TIMESTAMP_PREFIX = /^\[?\d{1,2}:\d{2}:\d{2}\]?\s*/;

function stripTimestamps(log: string): string {
  return log
    .split('\n')
    .map((line) => line.replace(TIMESTAMP_PREFIX, '').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

const VALENCE_PATTERN =
  /Explicit valence for atom # (\d+) ([A-Za-z]{1,3}), (\d+), is greater than permitted/g;

function parseSanitizeLog(log: string): RDKitProblem[] {
  const problems: RDKitProblem[] = [];
  const seen = new Set<string>();

  for (const match of log.matchAll(VALENCE_PATTERN)) {
    const key = `AtomValenceException:${match[1]}:${match[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    problems.push({
      type: 'AtomValenceException',
      message: match[0],
      atomIndex: Number(match[1]),
      atomSymbol: match[2],
      valence: Number(match[3]),
    });
  }

  return problems;
}

function parseNativeProblems(raw: string): RDKitProblem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((entry: any) => {
    if (!entry || typeof entry !== 'object') return [];
    const message = typeof entry.message === 'string' ? entry.message : '';
    if (!message) return [];

    return [
      {
        type: typeof entry.type === 'string' ? entry.type : 'ChemistryProblem',
        message,
        atomIndex: typeof entry.atomId === 'number' ? entry.atomId : null,
      },
    ];
  });
}

export interface ProblemSource {
  /** Atom order of this molblock matches the molecule nodes held by the editor. */
  molfile: string;
  /** SMILES exported from the same structure. */
  smiles: string;
}

/**
 * Valence / chemistry problems for one structure. The structure is loaded with
 * `sanitize: false` first so RDKit always yields a mol object — with sanitizing
 * enabled the parser simply rejects an invalid structure and there is nothing to
 * inspect.
 */
function detectProblemsSync(RDKit: RDKitModule, source: ProblemSource): RDKitProblem[] {
  let mol: Mol | null = null;

  try {
    mol = RDKit.get_mol(source.smiles, JSON.stringify({ sanitize: false }));

    if (!mol && source.molfile) {
      mol = RDKit.get_mol(source.molfile, JSON.stringify({ sanitize: false }));
    }

    if (!mol) {
      return [{ type: 'ParseException', message: 'RDKit 无法解析该结构', atomIndex: null }];
    }

    const nativeDetector = (mol as unknown as Record<string, unknown>).detect_chemistry_problems;
    if (typeof nativeDetector === 'function') {
      return parseNativeProblems(String(nativeDetector.call(mol)));
    }

    const input = source.molfile || source.smiles;
    let sanitized: Mol | null = null;
    const log = captureLog(RDKit, () => {
      sanitized = RDKit.get_mol(input, JSON.stringify({ sanitize: true }));
    });

    if (sanitized) {
      (sanitized as Mol).delete();
      return [];
    }

    const problems = parseSanitizeLog(log);
    if (problems.length > 0) return problems;

    const detail = stripTimestamps(log);
    return [
      {
        type: 'SanitizeException',
        message: detail || 'RDKit 无法完成结构校验',
        atomIndex: null,
      },
    ];
  } catch (error) {
    return [
      {
        type: 'SanitizeException',
        message: error instanceof Error ? error.message : String(error),
        atomIndex: null,
      },
    ];
  } finally {
    mol?.delete();
  }
}

let queue: Promise<unknown> = Promise.resolve();

export function detectChemistryProblems(source: ProblemSource): Promise<RDKitProblem[]> {
  const run = queue.then(async () => {
    const RDKit = await loadRDKit();
    return detectProblemsSync(RDKit, source);
  });

  // Keep the chain alive after a rejection so later calls still run.
  queue = run.catch(() => undefined);
  return run;
}

export interface StructureInspection {
  problems: RDKitProblem[];
  /** Formula / mass / descriptors, or `null` when the structure cannot be sanitized. */
  info: MoleculeInfo | null;
}

/** Chemistry problems plus the analysis summary, computed in a single queued RDKit turn. */
export function inspectStructure(source: ProblemSource): Promise<StructureInspection> {
  const run = queue.then(async () => {
    const RDKit = await loadRDKit();
    return { problems: detectProblemsSync(RDKit, source), info: readMoleculeInfo(RDKit, source) };
  });

  // Keep the chain alive after a rejection so later calls still run.
  queue = run.catch(() => undefined);
  return run;
}

/** Console smoke test: legal methane vs. a five-valent carbon. */
export async function runDetectionSelfTest(): Promise<void> {
  const cases = [
    { label: '合法 / methane', smile: 'C' },
    { label: '非法 / five-valent carbon', smile: 'C(C)(C)(C)(C)(C)' },
  ];

  for (const item of cases) {
    const problems = await detectChemistryProblems({ smiles: item.smile, molfile: '' });
    console.log(`[RDKit self test] ${item.label}: ${item.smile}`, problems);
  }
}

if (import.meta.env.DEV) {
  const devWindow = window as unknown as Record<string, unknown>;
  devWindow.__zephyrleaDetectChemistryProblems = detectChemistryProblems;
  devWindow.__zephyrleaRunDetectionSelfTest = runDetectionSelfTest;
}
