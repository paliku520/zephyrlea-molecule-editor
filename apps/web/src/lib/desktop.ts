import type { ProblemSource, StructureInspection } from './rdkit';

export interface DesktopSaveRequest {
  fileName: string;
  /** UTF-8 text, or the file bytes for binary exports. */
  data: string | ArrayBuffer;
}

export interface DesktopSaveResult {
  saved: boolean;
  filePath?: string;
}

export interface DesktopBackendHealth {
  status: string;
  engine: string;
  rdkitVersion: string;
  pid: number;
}

/** API the Electron preload script exposes on `window.zephyrlea`. */
interface DesktopBridge {
  platform: string;
  backend: {
    health(): Promise<DesktopBackendHealth>;
    analyze(source: ProblemSource): Promise<StructureInspection>;
  };
  saveFile(request: DesktopSaveRequest): Promise<DesktopSaveResult>;
}

declare global {
  interface Window {
    zephyrlea?: DesktopBridge;
  }
}

/** The Electron preload bridge, or `null` when running in a plain browser. */
export function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.zephyrlea ?? null;
}
