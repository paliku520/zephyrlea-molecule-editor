import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { createQuietLogger, rendererAlias, rendererPlugins } from '../web/vite.shared.ts';

// electron-vite runs with the package directory as cwd (npm workspace script).
const projectRoot = process.cwd();

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(projectRoot, 'src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(projectRoot, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    // The renderer is the shared web app, so both builds use one source tree.
    root: resolve(projectRoot, '../web'),
    plugins: rendererPlugins,
    customLogger: createQuietLogger(),
    resolve: { alias: rendererAlias },
    server: {
      host: '127.0.0.1',
      port: 5174,
    },
    build: {
      outDir: resolve(projectRoot, 'out/renderer'),
      // The HTML entry lives in the shared web app, not under this package.
      rollupOptions: { input: resolve(projectRoot, '../web/index.html') },
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200,
    },
  },
});
