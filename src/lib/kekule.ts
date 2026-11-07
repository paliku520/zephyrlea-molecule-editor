export type KekuleNamespace = Record<string, any>;

export const KEKULE_VERSION = '1.0.4';

export function waitForKekule(timeoutMs = 15_000): Promise<KekuleNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Kekule.js can only be loaded in the browser.'));
  }

  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    const probe = () => {
      const kekule = window.Kekule;

      if (kekule?.Editor?.Composer && kekule?.IO && kekule?.Render) {
        resolve(kekule);
        return;
      }

      if (performance.now() - startedAt > timeoutMs) {
        reject(new Error('Timed out while waiting for Kekule.js to load.'));
        return;
      }

      window.setTimeout(probe, 50);
    };

    probe();
  });
}
