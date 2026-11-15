import type {
  Embed3DResult,
  ProblemSource,
  StructureInspection,
  StructureSource,
} from './chemistryTypes';

export type { Embed3DResult, StructureSource };

export type LogLevel = 'info' | 'warn' | 'error';
export type LogSource = 'main' | 'backend' | 'renderer';

/** One line in the system log console, broadcast by the main process. */
export interface LogEntry {
  id: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  /** Epoch milliseconds. */
  timestamp: number;
}

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

/** Window buttons drawn by the renderer, since the desktop shell has no frame. */
interface DesktopWindowControls {
  minimize(): Promise<void>;
  /** Resolves to the state the window is switching to. */
  toggleMaximize(): Promise<boolean>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Returns the unsubscribe function. */
  onMaximizeChange(callback: (maximized: boolean) => void): () => void;
}

/** API the Electron preload script exposes on `window.zephyrlea`. */
interface DesktopBridge {
  platform: string;
  backend: {
    health(): Promise<DesktopBackendHealth>;
    analyze(source: ProblemSource): Promise<StructureInspection>;
    layout2d(source: StructureSource): Promise<{ molfile: string }>;
    embed3d(source: StructureSource): Promise<Embed3DResult>;
  };
  saveFile(request: DesktopSaveRequest): Promise<DesktopSaveResult>;
  window: DesktopWindowControls;
  logs: {
    /** Opens (or focuses) the system log window. */
    open(): Promise<void>;
    history(): Promise<LogEntry[]>;
    clear(): Promise<void>;
    report(level: LogLevel, message: string): void;
    /** Returns the unsubscribe function. */
    onEntry(callback: (entry: LogEntry) => void): () => void;
    onCleared(callback: () => void): () => void;
  };
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
