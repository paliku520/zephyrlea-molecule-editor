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
