import { contextBridge, ipcRenderer } from 'electron';

interface InspectSource {
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
    analyze: (source: InspectSource) => ipcRenderer.invoke('chemistry:analyze', source),
  },
  saveFile: (request: SaveRequest) => ipcRenderer.invoke('file:save', request),
};

contextBridge.exposeInMainWorld('zephyrlea', bridge);
