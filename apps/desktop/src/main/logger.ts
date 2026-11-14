import { BrowserWindow } from 'electron';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogSource = 'main' | 'backend' | 'renderer';

/** One line in the system log console. */
export interface LogEntry {
  /** Monotonic id so windows can merge history with live entries without dupes. */
  id: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  /** Epoch milliseconds; the window formats it as HH:mm:ss.SSS. */
  timestamp: number;
}

/** Entries kept in the main process, so a late-opened console still sees history. */
const MAX_ENTRIES = 1000;
/** Renderer `console.error(obj)` payloads can be huge; keep the line readable. */
const MAX_MESSAGE_LENGTH = 8000;

/**
 * Collects logs from the main process, the Python backend and the renderers,
 * keeps a bounded history and mirrors every entry to all open windows.
 */
export class Logger {
  private entries: LogEntry[] = [];
  private nextId = 1;

  log(level: LogLevel, source: LogSource, message: string): LogEntry {
    const entry: LogEntry = {
      id: this.nextId,
      level,
      source,
      message: normalize(message),
      timestamp: Date.now(),
    };

    this.nextId += 1;
    this.entries.push(entry);

    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }

    this.broadcast('log:received', entry);
    return entry;
  }

  info(source: LogSource, message: string): LogEntry {
    return this.log('info', source, message);
  }

  warn(source: LogSource, message: string): LogEntry {
    return this.log('warn', source, message);
  }

  error(source: LogSource, message: string): LogEntry {
    return this.log('error', source, message);
  }

  history(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.broadcast('logs:cleared');
  }

  private broadcast(channel: string, payload?: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send(channel, payload);
    }
  }
}

function normalize(message: string): string {
  const text = String(message ?? '').replace(/\r\n/g, '\n').trimEnd();
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…` : text;
}
