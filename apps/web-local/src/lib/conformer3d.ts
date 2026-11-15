import { requestEmbed3D } from './chemistryBackend';

/** One conformer produced by the local engine. */
export interface Conformer3D {
  /**
   * V2000 molblock with heavy atoms only, Kekulé form (alternating single /
   * double bonds). Unlike XYZ it carries the bond orders the engine computed,
   * which is what lets 3Dmol draw double / triple bonds natively.
   */
  molblock: string;
  /** Same heavy-atom conformer with aromatic bonds written as order 4. */
  molblockAromatic: string;
  /**
   * The very same conformer with every explicit hydrogen. All four molblocks
   * share the engine's coordinates, so switching between them only changes how
   * atoms and bonds are drawn.
   */
  molblockWithHydrogens: string;
  /** Hydrogen-complete conformer with aromatic bonds written as order 4. */
  molblockWithHydrogensAromatic: string;
  atomCount: number;
  bondCount: number;
  /** Counts of the hydrogen-complete molblocks. */
  atomCountWithHydrogens: number;
  bondCountWithHydrogens: number;
  /** Explicit hydrogens the engine placed. */
  hydrogenCount: number;
  /** Milliseconds reported by the engine. */
  elapsedMs: number;
  /** Number of disconnected structures merged into this conformer. */
  fragmentCount: number;
}

/**
 * Generates a 3D conformer with the local Python backend (native RDKit ETKDG +
 * force field, fixed seed 42). Every render variant comes back in one call —
 * heavy atoms / hydrogens, Kekulé / aromatic — so switching them is a local
 * model swap instead of another embedding run. Disconnected structures are
 * already laid out side by side by the backend, so the result can go straight
 * to 3Dmol.
 */
export async function computeConformer(smiles: string): Promise<Conformer3D> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new Error('画布为空，没有可生成 3D 构象的结构。');

  const result = await requestEmbed3D({ smiles: trimmed, molfile: null });

  return {
    molblock: result.sdf,
    molblockAromatic: result.sdfAromatic,
    molblockWithHydrogens: result.sdfWithHydrogens,
    molblockWithHydrogensAromatic: result.sdfWithHydrogensAromatic,
    atomCount: result.atomCount,
    bondCount: result.bondCount,
    atomCountWithHydrogens: result.atomCountWithHydrogens,
    bondCountWithHydrogens: result.bondCountWithHydrogens,
    hydrogenCount: result.hydrogenCount,
    elapsedMs: result.elapsedMs,
    fragmentCount: result.fragmentCount,
  };
}
