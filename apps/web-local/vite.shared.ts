import { createLogger, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { APP_VERSION } from './src/lib/version.ts';

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

/**
 * Some dependencies ship a Node-only `fs`/`crypto` branch. Vite externalizes
 * those imports for the browser (they never run), but warns loudly about it on
 * every build, so drop just that one message.
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
