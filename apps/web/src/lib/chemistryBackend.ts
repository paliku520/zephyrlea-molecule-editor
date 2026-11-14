import { desktopBridge } from './desktop';
import type {
  Embed3DResult,
  MoleculeInfo,
  ProblemSource,
  RDKitProblem,
  StructureInspection,
  StructureSource,
} from './chemistryTypes';

export type {
  Embed3DResult,
  MoleculeInfo,
  ProblemSource,
  RDKitProblem,
  StructureInspection,
  StructureSource,
};

/**
 * The message shown whenever the local engine cannot be reached. The desktop
 * app is the only supported host, so a missing backend is a hard stop rather
 * than something to paper over with a bundled fallback engine.
 */
export const LOCAL_ENGINE_UNAVAILABLE = '未连接本地计算引擎，请确保软件已正确安装运行';

export class LocalEngineUnavailableError extends Error {
  constructor() {
    super(LOCAL_ENGINE_UNAVAILABLE);
    this.name = 'LocalEngineUnavailableError';
  }
}

/**
 * Optional HTTP endpoint for the local backend when the renderer runs outside
 * the desktop shell (e.g. `npm run dev:web` together with `npm run dev:backend`).
 * Packaged builds always talk to the Python service through IPC.
 */
function configuredBackendUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const fromWindow = (window as unknown as Record<string, unknown>).__zephyrleaBackendUrl;
  if (typeof fromWindow === 'string' && fromWindow) return fromWindow.replace(/\/+$/, '');

  const fromEnv = import.meta.env.VITE_ZEPHYRLEA_BACKEND;
  if (typeof fromEnv === 'string' && fromEnv) return fromEnv.replace(/\/+$/, '');

  return null;
}

/** Cached probe so the renderer does not hit /health on every call. */
let httpProbe: { url: string; promise: Promise<boolean> } | null = null;

function probeHttpBackend(url: string): Promise<boolean> {
  if (httpProbe?.url !== url) {
    const promise = fetch(`${url}/health`, { signal: AbortSignal.timeout(1_500) })
      .then((response) => response.ok)
      .catch(() => false);

    // 探测失败可能只是后端还没起来，下次调用重新探测；成功则一直复用。
    httpProbe = { url, promise };
    void promise.then((ok) => {
      if (!ok && httpProbe?.promise === promise) httpProbe = null;
    });
  }

  return httpProbe.promise;
}

async function resolveHttpBackend(): Promise<string> {
  const url = configuredBackendUrl();
  if (url && (await probeHttpBackend(url))) return url;
  throw new LocalEngineUnavailableError();
}

/**
 * Starts (or wakes up) the local engine so the first analysis is instant.
 * Throws `LocalEngineUnavailableError` when nothing answers, which the analysis
 * panel turns into its "本地计算服务不可用" state.
 */
export async function prepareAnalysisEngine(): Promise<void> {
  const bridge = desktopBridge();
  if (bridge) {
    await bridge.backend.health();
    return;
  }

  await resolveHttpBackend();
}

/**
 * IPC 失败时 Electron 会把错误包成 `Error invoking remote method '…': Error: …`，
 * 这里剥掉前缀，界面上只显示后端给的友好说明。
 */
function unwrapIpcError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  const match = /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?([\s\S]*)$/.exec(raw);
  return new Error(match ? match[1] : raw);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    // 后端把可预期的失败放在 error.message 里，直接抛给调用方显示
    const payload = await response.text().catch(() => '');
    let message = `本地计算服务返回 ${response.status}`;
    try {
      const parsed = JSON.parse(payload) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // 非 JSON 响应，保留默认文案
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

/** Chemistry problems plus the analysis summary of one structure. */
export async function inspectStructure(source: ProblemSource): Promise<StructureInspection> {
  const bridge = desktopBridge();
  if (bridge) {
    try {
      return await bridge.backend.analyze(source);
    } catch (error) {
      throw unwrapIpcError(error);
    }
  }

  return postJson<StructureInspection>(`${await resolveHttpBackend()}/analyze`, source);
}

/** Regenerates standard 2D coordinates and returns a V2000 molblock. */
export async function requestLayout2D(source: StructureSource): Promise<string> {
  const bridge = desktopBridge();
  if (bridge) {
    try {
      const result = await bridge.backend.layout2d(source);
      return result.molfile;
    } catch (error) {
      throw unwrapIpcError(error);
    }
  }

  const result = await postJson<{ molfile: string }>(
    `${await resolveHttpBackend()}/api/layout2d`,
    source,
  );
  return result.molfile;
}

/** Builds a 3D conformer (ETKDG + force field) for the given structure. */
export async function requestEmbed3D(source: StructureSource): Promise<Embed3DResult> {
  const bridge = desktopBridge();
  if (bridge) {
    try {
      return await bridge.backend.embed3d(source);
    } catch (error) {
      throw unwrapIpcError(error);
    }
  }

  return postJson<Embed3DResult>(`${await resolveHttpBackend()}/api/embed3d`, source);
}
