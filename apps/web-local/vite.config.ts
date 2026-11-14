import { defineConfig } from 'vite';
import { createQuietLogger, rendererPlugins } from './vite.shared.ts';

export default defineConfig({
  plugins: rendererPlugins,
  customLogger: createQuietLogger(),
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
