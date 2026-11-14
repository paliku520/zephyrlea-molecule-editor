import { defineConfig } from 'vite';
import { createQuietLogger, rendererAlias, rendererPlugins } from './vite.shared.ts';

export default defineConfig({
  plugins: rendererPlugins,
  customLogger: createQuietLogger(),
  resolve: { alias: rendererAlias },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    // OpenChemLib is lazy-loaded only for SMILES parsing / Clean Up.
    chunkSizeWarningLimit: 1200,
  },
});
