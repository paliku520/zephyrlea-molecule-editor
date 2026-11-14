import type { BrowserWindow } from 'electron';

/**
 * End-to-end smoke test for the desktop shell, run with `electron . --self-test`.
 *
 * It drives the real renderer through the preload bridge: preload exposure,
 * IPC forwarding, the Python backend and the analysis panel. Exits non-zero
 * when any step fails, so it can gate CI builds.
 */

const UI_IMPORT_SCRIPT = `(() => new Promise((resolve) => {
  const input = document.querySelector('input[placeholder^="粘贴"]');
  if (!input) return resolve({ formula: false, rdkitRequests: 0, panel: 'input not found' });

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'CCO');
  input.dispatchEvent(new Event('input', { bubbles: true }));

  window.setTimeout(() => {
    const load = Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === '载入');
    if (!load) return resolve({ formula: false, rdkitRequests: 0, panel: 'load button not found' });

    load.click();
    let tries = 0;
    const poll = () => {
      const text = document.body.innerText;
      const rdkitRequests = performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.includes('RDKit_minimal')).length;

      if (text.includes('C2H6O')) return resolve({ formula: true, rdkitRequests, panel: '' });

      tries += 1;
      if (tries > 60) return resolve({ formula: false, rdkitRequests, panel: text.slice(0, 400) });
      window.setTimeout(poll, 250);
    };
    poll();
  }, 250);
}))()`;

interface UiResult {
  formula: boolean;
  rdkitRequests: number;
  panel: string;
}

interface AnalyzeResult {
  problems?: Array<{ type?: string; atomIndex?: number | null }>;
  info?: { formula?: string } | null;
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
      name: 'analysis panel rendered from backend',
      run: async () => {
        const result = await evaluate<UiResult>(UI_IMPORT_SCRIPT);
        log(`  ui: ${JSON.stringify(result)}`);
        // No RDKit WASM request means the numbers came from the Python backend.
        return result.formula && result.rdkitRequests === 0;
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
