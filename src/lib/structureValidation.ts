import { inspectStructure, type MoleculeInfo, type RDKitProblem } from './rdkit';

/** One molecule on the canvas, ready to be handed to RDKit. */
export interface ValidationTarget {
  smiles: string;
  /** Atom order of the molblock matches `atoms`, so RDKit atom indexes are node indexes. */
  molfile: string;
  /** Kekule atoms of this molecule, in molfile order. */
  atoms: unknown[];
}

export interface StructureIssue {
  key: string;
  /** RDKit exception name, e.g. `AtomValenceException`. */
  type: string;
  /** Raw RDKit message. */
  message: string;
  /** Human readable (Chinese) explanation shown first in the panel. */
  description: string;
  atomSymbol: string;
  /** 0-based index inside the molecule atoms, or `null` when RDKit reports none. */
  atomIndex: number | null;
  moleculeIndex: number;
  /** Blocking issues disable Clean Up and the 3D preview. */
  blocking: boolean;
}

/** Analysis summary of one molecule on the canvas. */
export interface MoleculeSummary {
  /** 0-based index of the molecule inside the editor. */
  index: number;
  /** `null` when RDKit cannot sanitize the structure (blocking issue). */
  info: MoleculeInfo | null;
}

export interface StructureValidation {
  /** True when no blocking issue was found. */
  ok: boolean;
  issues: StructureIssue[];
  molecules: MoleculeSummary[];
  moleculeCount: number;
  atomCount: number;
}

const ELEMENT_NAMES: Record<string, string> = {
  H: '氢',
  B: '硼',
  C: '碳',
  N: '氮',
  O: '氧',
  F: '氟',
  Si: '硅',
  P: '磷',
  S: '硫',
  Cl: '氯',
  Br: '溴',
  I: '碘',
  Se: '硒',
  As: '砷',
  Na: '钠',
  K: '钾',
  Mg: '镁',
  Ca: '钙',
  Li: '锂',
  Zn: '锌',
  Fe: '铁',
  Cu: '铜',
};

const BLOCKING_TYPES = new Set(['AtomValenceException']);

function describeProblem(problem: RDKitProblem, atomIndex: number | null): string {
  if (problem.type === 'AtomValenceException') {
    const name = problem.atomSymbol ? ELEMENT_NAMES[problem.atomSymbol] ?? problem.atomSymbol : '该';
    const position = atomIndex === null ? '' : `第 ${atomIndex + 1} 个`;
    return `${position}${name}原子的显式化合价为 ${problem.valence}，超过了该元素允许的最大值；无法整理结构或生成 3D 视图。`;
  }

  if (problem.type === 'ParseException') {
    return 'RDKit 无法解析该结构，暂时无法进行化学校验。';
  }

  return 'RDKit 在化学校验时报告了问题，请检查结构中的原子价态与电荷。';
}

export async function validateStructure(targets: ValidationTarget[]): Promise<StructureValidation> {
  const issues: StructureIssue[] = [];
  const molecules: MoleculeSummary[] = [];
  let atomCount = 0;

  for (let moleculeIndex = 0; moleculeIndex < targets.length; moleculeIndex += 1) {
    const target = targets[moleculeIndex];
    atomCount += target.atoms.length;

    if (!target.smiles && !target.molfile) continue;

    let problems: RDKitProblem[];
    let info: MoleculeInfo | null = null;
    try {
      const inspection = await inspectStructure({ smiles: target.smiles, molfile: target.molfile });
      problems = inspection.problems;
      info = inspection.info;
    } catch (error) {
      problems = [
        {
          type: 'SanitizeException',
          message: error instanceof Error ? error.message : String(error),
          atomIndex: null,
        },
      ];
    }

    molecules.push({ index: moleculeIndex, info });

    problems.forEach((problem, problemIndex) => {
      const atomIndex =
        problem.atomIndex !== null && problem.atomIndex >= 0 && problem.atomIndex < target.atoms.length
          ? problem.atomIndex
          : null;

      issues.push({
        key: `${moleculeIndex}-${atomIndex ?? 'none'}-${problem.type}-${problemIndex}`,
        type: problem.type,
        message: problem.message,
        description: describeProblem(problem, atomIndex),
        atomSymbol: problem.atomSymbol ?? '',
        atomIndex,
        moleculeIndex,
        blocking: BLOCKING_TYPES.has(problem.type),
      });
    });
  }

  return {
    ok: !issues.some((issue) => issue.blocking),
    issues,
    molecules,
    moleculeCount: targets.length,
    atomCount,
  };
}
