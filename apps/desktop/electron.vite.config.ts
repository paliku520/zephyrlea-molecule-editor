import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { createQuietLogger, rendererPlugins } from '../web-local/vite.shared.ts';

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
    root: resolve(projectRoot, '../web-local'),
    plugins: rendererPlugins,
    customLogger: createQuietLogger(),
    server: {
      host: '127.0.0.1',
      port: 5174,
    },
    build: {
      outDir: resolve(projectRoot, 'out/renderer'),
      // The HTML entry lives in the shared web app, not under this package.
      rollupOptions: { input: resolve(projectRoot, '../web-local/index.html') },
      emptyOutDir: true,
      // electron-vite leaves the renderer unminified by default; the packaged
      // app ships this bundle, so minify it like the web build does.
      minify: true,
      chunkSizeWarningLimit: 1200,
    },
  },
});
