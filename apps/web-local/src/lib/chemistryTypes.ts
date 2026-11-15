/**
 * Chemistry data contracts shared by the renderer, the preload bridge and the
 * local Python backend.
 */

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

/** Chemistry problems plus the analysis summary, computed in a single turn. */
export interface StructureInspection {
  problems: RDKitProblem[];
  /** Formula / mass / descriptors, or `null` when the structure cannot be sanitized. */
  info: MoleculeInfo | null;
}

/** One structure handed to the backend for analysis. */
export interface ProblemSource {
  /** Atom order of this molblock matches the molecule nodes held by the editor. */
  molfile: string;
  /** SMILES exported from the same structure. */
  smiles: string;
}

/** `{ smiles, molfile }` payload shared by the structure endpoints. */
export interface StructureSource {
  smiles: string;
  molfile: string | null;
}

/** Reply of `/api/embed3d`: two molblocks plus the counts the viewer shows. */
export interface Embed3DResult {
  /** Heavy-atom conformer; what the viewer draws by default. */
  sdf: string;
  /** Same conformer with every explicit hydrogen kept (`AddHs` output). */
  sdfWithHydrogens: string;
  atomCount: number;
  bondCount: number;
  /** Counts of `sdfWithHydrogens`; shown when hydrogen display is switched on. */
  atomCountWithHydrogens: number;
  bondCountWithHydrogens: number;
  /** Explicit hydrogens the engine placed (difference between the two variants). */
  hydrogenCount: number;
  fragmentCount: number;
  elapsedMs: number;
}
