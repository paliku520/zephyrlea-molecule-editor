import { contextBridge, ipcRenderer } from 'electron';

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
  saveFile: (request: SaveRequest) => ipcRenderer.invoke('file:save', request),
};

contextBridge.exposeInMainWorld('zephyrlea', bridge);
