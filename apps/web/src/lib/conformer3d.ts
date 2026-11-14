import { requestEmbed3D } from './chemistryBackend';

/** One conformer produced by the local engine. */
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

/**
 * Generates a 3D conformer with the local Python backend (native RDKit ETKDG +
 * force field, fixed seed 42). Disconnected structures are already laid out side
 * by side by the backend, so the result can go straight to 3Dmol.
 */
export async function computeConformer(smiles: string): Promise<Conformer3D> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new Error('画布为空，没有可生成 3D 构象的结构。');

  const result = await requestEmbed3D({ smiles: trimmed, molfile: null });

  return {
    molblock: result.sdf,
    atomCount: result.atomCount,
    bondCount: result.bondCount,
    elapsedMs: result.elapsedMs,
    fragmentCount: result.fragmentCount,
  };
}
