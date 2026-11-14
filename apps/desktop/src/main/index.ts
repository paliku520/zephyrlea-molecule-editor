import { writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import type { SaveDialogOptions } from 'electron';
import { LocalBackend } from './backend';
import { runSelfTest } from './self-test';

const backend = new LocalBackend();
const SELF_TEST = process.argv.includes('--self-test');

const EXTENSION_NAMES: Record<string, string> = {
  png: 'PNG 图片',
  svg: 'SVG 矢量图',
};

interface AnalyzeSource {
  smiles: string;
  molfile: string | null;
}

interface SaveRequest {
  fileName: string;
  /** UTF-8 text, or file bytes for binary exports. */
  data: string | ArrayBuffer;
}

interface SaveResult {
  saved: boolean;
  filePath?: string;
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#151516',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  if (SELF_TEST) {
    window.webContents.once('did-finish-load', () => {
      void runSelfTest(window, console.log).then((ok) => app.exit(ok ? 0 : 1));
    });
  }

  // Repository / document links belong in the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

async function saveFile(owner: BrowserWindow | undefined, request: SaveRequest): Promise<SaveResult> {
  const fileName = request?.fileName?.trim() || 'molecule';
  const extension = extname(fileName).slice(1).toLowerCase();

  const options: SaveDialogOptions = {
    defaultPath: join(app.getPath('documents'), fileName),
    filters: extension
      ? [{ name: EXTENSION_NAMES[extension] ?? extension.toUpperCase(), extensions: [extension] }]
      : [],
  };

  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { saved: false };

  const payload =
    typeof request.data === 'string' ? Buffer.from(request.data, 'utf8') : Buffer.from(request.data);
  await writeFile(result.filePath, payload);
  return { saved: true, filePath: result.filePath };
}

function registerIpc(): void {
  ipcMain.handle('chemistry:analyze', async (_event, source: AnalyzeSource) => {
    await backend.ensureStarted();
    return backend.request('/analyze', source);
  });

  ipcMain.handle('backend:health', async () => {
    await backend.ensureStarted();
    return backend.request('/health');
  });

  ipcMain.handle('chemistry:layout2d', async (_event, source: AnalyzeSource) => {
    await backend.ensureStarted();
    return backend.request('/api/layout2d', source);
  });

  ipcMain.handle('chemistry:embed3d', async (_event, source: AnalyzeSource) => {
    await backend.ensureStarted();
    // 3D 构象可能较慢，给足超时时间
    return backend.request('/api/embed3d', source, 120_000);
  });

  ipcMain.handle('file:save', async (event, request: SaveRequest) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    return saveFile(owner ?? undefined, request);
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  // Warm up the Python process while the window paints; failures are reported
  // per request so the UI can show them in its own language.
  void backend.ensureStarted().catch((error: unknown) => console.error('[backend]', error));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => backend.stop());
