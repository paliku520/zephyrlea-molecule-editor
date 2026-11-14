import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createLogger, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { APP_VERSION } from './src/lib/version.ts';

// `sci-form-wasm` ships its `.wasm` inside the package but its `exports` map
// only exposes `.`, `./alpha` and `./beta`, so the binary cannot be imported as
// `sci-form-wasm/sci_form_wasm_bg.wasm?url`. Alias it to the real file and let
// Vite resolve it as a build asset instead of guessing a runtime path.
// Resolve the package entry through Node so hoisted workspace installs work.
const sciFormWasm = join(
  dirname(createRequire(import.meta.url).resolve('sci-form-wasm')),
  'sci_form_wasm_bg.wasm',
);

/** Plugins shared by the web build and the Electron renderer build. */
export const rendererPlugins: PluginOption[] = [
  react(),
  tailwindcss(),
  {
    // Inject the version into the static page title so the tab matches the app
    // without duplicating the number in index.html.
    name: 'zephyrlea-app-version',
    transformIndexHtml: (html: string) => html.replace(/__APP_VERSION__/g, `v${APP_VERSION}`),
  },
];

export const rendererAlias = [
  { find: /^sci-form-wasm\/wasm(\?.*)?$/, replacement: `${sciFormWasm}$1` },
];

/**
 * @rdkit/rdkit ships an Emscripten bundle with a Node-only `fs`/`crypto` branch.
 * Vite externalizes those imports for the browser (they never run), but warns
 * loudly about it on every build, so drop just that one message.
 */
export function createQuietLogger() {
  const logger = createLogger();
  const baseWarn = logger.warn.bind(logger);
  logger.warn = (msg, options) => {
    if (msg.includes('externalized for browser compatibility')) return;
    baseWarn(msg, options);
  };
  return logger;
}
