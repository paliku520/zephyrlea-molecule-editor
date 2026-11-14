import { desktopBridge } from './desktop';
import {
  inspectStructure as inspectWithRDKit,
  loadRDKit,
  type MoleculeInfo,
  type ProblemSource,
  type RDKitProblem,
  type StructureInspection,
} from './rdkit';

export type { MoleculeInfo, ProblemSource, RDKitProblem, StructureInspection };

/**
 * Which implementation backs structure analysis: the desktop build delegates to
 * the local Python service (native RDKit), the browser build to RDKit WASM.
 */
export function analysisEngine(): 'local' | 'wasm' {
  return desktopBridge() ? 'local' : 'wasm';
}

/** Loads whatever the analysis engine needs before the editor can start. */
export async function prepareAnalysisEngine(): Promise<void> {
  const bridge = desktopBridge();
  if (bridge) {
    // Starts (or wakes up) the Python service so the first analysis is instant.
    await bridge.backend.health();
    return;
  }

  await loadRDKit();
}

/**
 * Analysis entry point. The desktop build delegates to the local Python backend
 * (native RDKit); the browser build keeps using the bundled RDKit WASM module.
 */
export async function inspectStructure(source: ProblemSource): Promise<StructureInspection> {
  const bridge = desktopBridge();
  return bridge ? bridge.backend.analyze(source) : inspectWithRDKit(source);
}
