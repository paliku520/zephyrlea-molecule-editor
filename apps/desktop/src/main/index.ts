import { writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import type {
  BrowserWindowConstructorOptions,
  IpcMainInvokeEvent,
  SaveDialogOptions,
} from 'electron';
import { LocalBackend } from './backend';
import { Logger, type LogLevel } from './logger';
import { runSelfTest } from './self-test';

const logger = new Logger();
const backend = new LocalBackend(logger);
const SELF_TEST = process.argv.includes('--self-test');
const IS_MAC = process.platform === 'darwin';

/** Only one system log window is ever open; further requests just focus it. */
let logsWindow: BrowserWindow | null = null;

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

interface RendererLogReport {
  level?: unknown;
  message?: unknown;
}

function windowOptions(): BrowserWindowConstructorOptions {
  return {
    backgroundColor: '#151516',
    show: false,
    autoHideMenuBar: true,
    // 无边框窗口：系统标题栏和最小化 / 最大化 / 关闭按钮全部去掉，改由渲染层自绘。
    // macOS 例外，用 hiddenInset 保留系统红绿灯（它们浮在页面内容左上角）。
    ...(IS_MAC
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

/**
 * 无原生标题栏后，最大化状态的变化只能靠主进程通知渲染层，
 * 自绘按钮据此在「最大化」和「向下还原」之间切换图标。
 */
function bindWindowState(window: BrowserWindow): void {
  const broadcast = () => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send('window:maximize-changed', window.isMaximized());
  };

  window.on('maximize', broadcast);
  window.on('unmaximize', broadcast);
}

/** 窗口按钮的 IPC 一律作用于事件来源窗口，主窗口和日志窗口互不影响。 */
function windowFrom(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

/**
 * Loads the shared renderer entry. `query` is what splits the molecule editor
 * and the log console: both come from the same bundle, picked apart in `main.tsx`.
 */
function loadRenderer(window: BrowserWindow, query?: Record<string, string>): void {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;

  if (devServerUrl) {
    const url = new URL(devServerUrl);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    void window.loadURL(url.toString());
    return;
  }

  void window.loadFile(join(__dirname, '../renderer/index.html'), { query });
}

/** Repository / document links belong in the system browser. */
function openLinksExternally(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

/** Ctrl/Cmd + Shift + L opens the console from any window. */
function bindLogShortcut(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const withModifier = process.platform === 'darwin' ? input.meta : input.control;
    if (!withModifier || !input.shift || input.key.toLowerCase() !== 'l') return;

    event.preventDefault();
    openLogsWindow();
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...windowOptions(),
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
  });

  window.once('ready-to-show', () => window.show());

  if (SELF_TEST) {
    window.webContents.once('did-finish-load', () => {
      void runSelfTest(window, console.log).then((ok) => app.exit(ok ? 0 : 1));
    });
  }

  openLinksExternally(window);
  bindLogShortcut(window);
  bindWindowState(window);
  loadRenderer(window);
  logger.info('main', '主窗口已创建');

  return window;
}

function openLogsWindow(): void {
  if (logsWindow && !logsWindow.isDestroyed()) {
    if (logsWindow.isMinimized()) logsWindow.restore();
    logsWindow.focus();
    return;
  }

  const window = new BrowserWindow({
    ...windowOptions(),
    width: 800,
    height: 600,
    minWidth: 520,
    minHeight: 360,
    title: '系统日志',
    // 独立的普通窗口：不绑定父窗口、不阻塞主界面，可以自由最大化。
    modal: false,
    maximizable: true,
    minimizable: true,
  });

  logsWindow = window;
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (logsWindow === window) logsWindow = null;
  });

  openLinksExternally(window);
  bindLogShortcut(window);
  bindWindowState(window);
  loadRenderer(window, { window: 'logs' });
  logger.info('main', '系统日志窗口已打开');
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

  ipcMain.handle('window:open-logs', () => openLogsWindow());
  ipcMain.handle('logs:history', () => logger.history());
  ipcMain.handle('logs:clear', () => logger.clear());

  ipcMain.handle('window:minimize', (event) => {
    windowFrom(event)?.minimize();
  });

  // 返回切换后的目标状态：Windows 的最大化是异步生效的，`isMaximized()`
  // 在本次调用里未必已经翻转，渲染层用它先乐观更新按钮图标。
  ipcMain.handle('window:toggle-maximize', (event) => {
    const target = windowFrom(event);
    if (!target) return false;

    const maximize = !target.isMaximized();
    if (maximize) target.maximize();
    else target.unmaximize();
    return maximize;
  });

  ipcMain.handle('window:close', (event) => {
    windowFrom(event)?.close();
  });

  ipcMain.handle('window:is-maximized', (event) => windowFrom(event)?.isMaximized() ?? false);

  // 渲染层用 send 上报 console.warn / console.error；参数来自页面，先收敛再入库。
  ipcMain.on('log:report', (_event, report: RendererLogReport) => {
    const level: LogLevel =
      report?.level === 'error' || report?.level === 'warn' ? report.level : 'info';
    logger.log(level, 'renderer', String(report?.message ?? ''));
  });
}

app.whenReady().then(() => {
  logger.info(
    'main',
    `应用启动 · Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · ${process.platform}`,
  );

  registerIpc();
  createMainWindow();

  // Warm up the Python process while the window paints; failures are reported
  // per request so the UI can show them in its own language.
  void backend
    .ensureStarted()
    .then(() => logger.info('main', `本地计算服务已就绪：${backend.url ?? '未知地址'}`))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('main', `本地计算服务启动失败：${message}`);
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  logger.info('main', '应用即将退出');
  backend.stop();
});
