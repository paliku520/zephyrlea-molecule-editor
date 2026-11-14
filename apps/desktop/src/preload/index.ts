import { contextBridge, ipcRenderer } from 'electron';

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  id: number;
  level: LogLevel;
  source: string;
  message: string;
  timestamp: number;
}

interface StructureSource {
  smiles: string;
  molfile: string | null;
}

interface SaveRequest {
  fileName: string;
  data: string | ArrayBuffer;
}

const bridge = {
  platform: process.platform,
  backend: {
    health: () => ipcRenderer.invoke('backend:health'),
    analyze: (source: StructureSource) => ipcRenderer.invoke('chemistry:analyze', source),
    layout2d: (source: StructureSource) => ipcRenderer.invoke('chemistry:layout2d', source),
    embed3d: (source: StructureSource) => ipcRenderer.invoke('chemistry:embed3d', source),
  },
  logs: {
    open: () => ipcRenderer.invoke('window:open-logs'),
    history: () => ipcRenderer.invoke('logs:history'),
    clear: () => ipcRenderer.invoke('logs:clear'),
    report: (level: LogLevel, message: string) => ipcRenderer.send('log:report', { level, message }),
    /** Subscribes to live entries and returns the unsubscribe function. */
    onEntry: (callback: (entry: LogEntry) => void) => {
      const handler = (_event: unknown, entry: LogEntry) => callback(entry);
      ipcRenderer.on('log:received', handler);
      return () => ipcRenderer.off('log:received', handler);
    },
    onCleared: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('logs:cleared', handler);
      return () => ipcRenderer.off('logs:cleared', handler);
    },
  },
  saveFile: (request: SaveRequest) => ipcRenderer.invoke('file:save', request),
};

contextBridge.exposeInMainWorld('zephyrlea', bridge);
