import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    // OpenChemLib is lazy-loaded only for SMILES parsing / Clean Up.
    chunkSizeWarningLimit: 1200,
  },
});
