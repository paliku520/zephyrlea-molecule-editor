import { fileURLToPath } from 'node:url';
import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `sci-form-wasm` ships its `.wasm` inside the package but its `exports` map
// only exposes `.`, `./alpha` and `./beta`, so the binary cannot be imported as
// `sci-form-wasm/sci_form_wasm_bg.wasm?url`. Alias it to the real file and let
// Vite resolve it as a build asset instead of guessing a runtime path.
const sciFormWasm = fileURLToPath(
  new URL('./node_modules/sci-form-wasm/sci_form_wasm_bg.wasm', import.meta.url),
);

// @rdkit/rdkit ships an Emscripten bundle with a Node-only `fs`/`crypto`
// branch. Vite externalizes those imports for the browser (they never run),
// but warns loudly about it on every build, so drop just that one message.
const logger = createLogger();
const baseWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  if (msg.includes('externalized for browser compatibility')) return;
  baseWarn(msg, options);
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  customLogger: logger,
  resolve: {
    alias: [{ find: /^sci-form-wasm\/wasm(\?.*)?$/, replacement: `${sciFormWasm}$1` }],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    // OpenChemLib is lazy-loaded only for SMILES parsing / Clean Up.
    chunkSizeWarningLimit: 1200,
  },
});
