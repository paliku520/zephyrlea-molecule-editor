import { BrowserWindow } from 'electron';

/**
 * End-to-end smoke test for the desktop shell, run with `electron . --self-test`.
 *
 * It drives the real renderer through the preload bridge: preload exposure,
 * IPC forwarding, the Python backend (analysis / 2D layout / 3D conformer) and
 * the editor UI. Exits non-zero when any step fails, so it can gate CI builds.
 */

const UI_SCRIPT = `(() => new Promise((resolve) => {
  const input = document.querySelector('input[placeholder^="粘贴"]');
  if (!input) return resolve({ stage: 'input not found' });

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'CCO');
  input.dispatchEvent(new Event('input', { bubbles: true }));

  const waitFor = (predicate, onDone, tries = 0) => {
    if (predicate()) return onDone(true);
    if (tries > 80) return onDone(false);
    window.setTimeout(() => waitFor(predicate, onDone, tries + 1), 250);
  };

  window.setTimeout(() => {
    const load = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === '载入');
    if (!load) return resolve({ stage: 'load button not found' });
    load.click();

    waitFor(
      () => document.body.innerText.includes('C2H6O'),
      (formula) => {
        if (!formula) return resolve({ stage: 'formula never appeared', formula: false });

        const relayout = Array.from(document.querySelectorAll('button')).find((b) =>
          (b.getAttribute('title') || '').startsWith('整理结构'),
        );
        if (!relayout) return resolve({ stage: 'relayout button not found', formula: true });
        relayout.click();

        waitFor(
          () => document.body.innerText.includes('结构已整理'),
          (ok) => {
            const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
            resolve({
              stage: ok ? 'done' : 'relayout toast missing',
              formula: true,
              relayout: ok,
              rdkitRequests: resources.filter((name) => name.includes('RDKit_minimal')).length,
              openChemLibRequests: resources.filter((name) => name.includes('openchemlib')).length,
            });
          },
        );
      },
    );
  }, 250);
}))()`;

interface UiResult {
  stage: string;
  formula?: boolean;
  relayout?: boolean;
  rdkitRequests?: number;
  openChemLibRequests?: number;
}

interface Viewer3DResult {
  stage: string;
  atomCount?: number;
  detail?: string;
}

interface LogEntry {
  id: number;
  level: string;
  source: string;
  message: string;
  timestamp: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Opens the 3D modal on whatever is already on the canvas and waits for the
 * 3Dmol model. The conformer itself comes from `/api/embed3d` over IPC.
 */
const VIEWER_SCRIPT = `(() => new Promise((resolve) => {
  const open = Array.from(document.querySelectorAll('button')).find(
    (b) => (b.getAttribute('title') || '') === '在 3D 中查看',
  );
  if (!open) return resolve({ stage: 'viewer button not found' });
  open.click();

  const deadline = Date.now() + 45000;
  const poll = () => {
    const text = document.body.innerText;
    const counts = text.match(/(\\d+) 个原子/);
    if (counts) return resolve({ stage: 'ready', atomCount: Number(counts[1]) });
    if (text.includes('无法生成 3D 构象')) {
      return resolve({ stage: 'error', detail: text.split('无法生成 3D 构象')[1].slice(0, 120) });
    }
    if (Date.now() > deadline) return resolve({ stage: 'timeout' });
    window.setTimeout(poll, 250);
  };
  poll();
}))()`;

interface AnalyzeResult {
  problems?: Array<{ type?: string; atomIndex?: number | null }>;
  info?: { formula?: string } | null;
}

interface Layout2DResult {
  molfile?: string;
}

interface Embed3DResult {
  sdf?: string;
  atomCount?: number;
  bondCount?: number;
  fragmentCount?: number;
}

/** Atom count and z spread of a V2000 molblock, used to prove 3D really is 3D. */
function coordinateSpread(molblock: string): { atoms: number; zSpread: number } {
  const lines = molblock.split(/\r?\n/);
  const counts = lines[3] ?? '';
  const atoms = Number.parseInt(counts.slice(0, 3).trim(), 10) || 0;

  const zs: number[] = [];
  for (let index = 0; index < atoms; index += 1) {
    const line = lines[4 + index];
    if (!line) break;
    zs.push(Number.parseFloat(line.slice(20, 30)));
  }

  return {
    atoms,
    zSpread: zs.length > 0 ? Math.max(...zs) - Math.min(...zs) : 0,
  };
}

export async function runSelfTest(
  window: BrowserWindow,
  log: (message: string) => void,
): Promise<boolean> {
  const evaluate = <T>(script: string) =>
    window.webContents.executeJavaScript(script, true) as Promise<T>;

  const checks: Array<{ name: string; run: () => Promise<boolean> }> = [
    {
      name: 'preload bridge exposed',
      run: () => evaluate<boolean>('typeof window.zephyrlea === "object"'),
    },
    {
      name: 'backend health over IPC',
      run: async () => {
        const health = await evaluate<{ engine?: string; rdkitVersion?: string }>(
          'window.zephyrlea.backend.health()',
        );
        log(`  health: ${JSON.stringify(health)}`);
        return health?.engine === 'rdkit';
      },
    },
    {
      name: 'valence detection over IPC',
      run: async () => {
        const result = await evaluate<AnalyzeResult>(
          `window.zephyrlea.backend.analyze({ smiles: 'C(C)(C)(C)(C)(C)', molfile: null })`,
        );
        log(`  analyze: ${JSON.stringify(result)}`);
        return result?.problems?.[0]?.type === 'AtomValenceException' && result?.info === null;
      },
    },
    {
      name: '2D layout over IPC',
      run: async () => {
        const result = await evaluate<Layout2DResult>(
          `window.zephyrlea.backend.layout2d({ smiles: 'CC(=O)Oc1ccccc1C(=O)O', molfile: null })`,
        );
        const molfile = result?.molfile ?? '';
        const spread = coordinateSpread(molfile);
        log(`  layout2d: ${molfile.length} chars, ${spread.atoms} atoms`);
        return molfile.includes('V2000') && spread.atoms === 13;
      },
    },
    {
      name: '3D conformer over IPC',
      run: async () => {
        const result = await evaluate<Embed3DResult>(
          `window.zephyrlea.backend.embed3d({ smiles: 'CCO.c1ccccc1', molfile: null })`,
        );
        const sdf = result?.sdf ?? '';
        const spread = coordinateSpread(sdf);
        log(
          `  embed3d: ${JSON.stringify({ ...result, sdf: `${sdf.length} chars` })}, zSpread=${spread.zSpread.toFixed(2)}`,
        );
        return result?.fragmentCount === 2 && result?.atomCount === 9 && spread.zSpread > 0.5;
      },
    },
    {
      name: 'friendly error for unparsable structure',
      run: async () => {
        const message = await evaluate<string>(
          `window.zephyrlea.backend.embed3d({ smiles: 'C(C)(C)(C)(C)(C)', molfile: null })
             .then(() => 'resolved')
             .catch((error) => String(error && error.message ? error.message : error))`,
        );
        log(`  error: ${message}`);
        return message.includes('无法解析');
      },
    },
    {
      name: 'analysis panel + relayout rendered from backend',
      run: async () => {
        const result = await evaluate<UiResult>(UI_SCRIPT);
        log(`  ui: ${JSON.stringify(result)}`);
        // No RDKit wasm and no OpenChemLib chunk: both imports and layout came
        // from the Python backend.
        return (
          result.stage === 'done' &&
          result.relayout === true &&
          result.rdkitRequests === 0 &&
          result.openChemLibRequests === 0
        );
      },
    },
    {
      name: '3D viewer built from backend conformer',
      run: async () => {
        const result = await evaluate<Viewer3DResult>(VIEWER_SCRIPT);
        log(`  viewer: ${JSON.stringify(result)}`);
        return result.stage === 'ready' && (result.atomCount ?? 0) > 0;
      },
    },
    {
      name: 'renderer console.warn reaches the log buffer',
      run: async () => {
        await evaluate(`window.zephyrlea.logs.report('warn', 'self-test 渲染层日志')`);
        await delay(300);
        const history = await evaluate<LogEntry[]>(`window.zephyrlea.logs.history()`);
        const entry = history.find((item) => item.message.includes('self-test 渲染层日志'));
        log(`  entry: ${JSON.stringify(entry)}`);
        return entry?.level === 'warn' && entry?.source === 'renderer';
      },
    },
    {
      name: 'python backend output captured',
      run: async () => {
        const history = await evaluate<LogEntry[]>(`window.zephyrlea.logs.history()`);
        const backendEntries = history.filter((entry) => entry.source === 'backend');
        const last = backendEntries[backendEntries.length - 1];
        log(`  backend entries: ${backendEntries.length} · last: ${last?.level} ${last?.message.slice(0, 70)}`);
        return backendEntries.length > 0;
      },
    },
    {
      name: 'self-drawn window controls drive the frameless window',
      run: async () => {
        const dom = await evaluate<{ controls: number; dragRegion: boolean }>(`(() => ({
          controls: document.querySelectorAll('[data-window-control]').length,
          dragRegion: Boolean(document.querySelector('.window-drag')),
        }))()`);

        const maximizeState = await evaluate<boolean>('window.zephyrlea.window.toggleMaximize()');
        await delay(600);
        const maximized = window.isMaximized();

        await evaluate('window.zephyrlea.window.toggleMaximize()');
        await delay(600);
        const restored = window.isMaximized();

        log(`  window: ${JSON.stringify({ ...dom, maximizeState, maximized, restored })}`);
        return dom.controls === 3 && dom.dragRegion && maximizeState && maximized && !restored;
      },
    },
    {
      name: 'log window opens once and renders entries',
      run: async () => {
        await evaluate(`window.zephyrlea.logs.open()`);
        await evaluate(`window.zephyrlea.logs.open()`);

        // 第二次调用只应聚焦，不应产生第三个窗口。
        const deadline = Date.now() + 15_000;
        let logsWindow = BrowserWindow.getAllWindows().find((win) => win !== window);

        while (!logsWindow && Date.now() < deadline) {
          await delay(250);
          logsWindow = BrowserWindow.getAllWindows().find((win) => win !== window);
        }
        if (!logsWindow) {
          log('  log window never appeared');
          return false;
        }

        const windowCount = BrowserWindow.getAllWindows().length;

        // 窗口存在不等于页面已渲染完，轮询到列表出现带时间戳的行再判定。
        const renderDeadline = Date.now() + 15_000;
        let text = '';

        while (Date.now() < renderDeadline) {
          text = (await logsWindow.webContents.executeJavaScript(
            'document.body.innerText',
          )) as string;
          if (text.includes('系统日志') && /\d{2}:\d{2}:\d{2}\.\d{3}/.test(text)) break;
          await delay(250);
        }

        const hasTimestamp = /\d{2}:\d{2}:\d{2}\.\d{3}/.test(text);
        log(`  windows: ${windowCount} · rendered: ${hasTimestamp} · head: ${text.slice(0, 60).replace(/\s+/g, ' ')}`);
        return windowCount === 2 && text.includes('系统日志') && hasTimestamp;
      },
    },
  ];

  let passed = true;

  for (const check of checks) {
    try {
      const ok = await check.run();
      log(`${ok ? 'PASS' : 'FAIL'} ${check.name}`);
      passed = passed && ok;
    } catch (error) {
      log(`FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
      passed = false;
    }
  }

  log(passed ? 'SELF TEST PASSED' : 'SELF TEST FAILED');
  return passed;
}
