import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

const READY_PATTERN = /ZEPHYRLEA_BACKEND_READY\s+(\d+)/;
const TOKEN_ENV = 'ZEPHYRLEA_BACKEND_TOKEN';
const START_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 20_000;

export interface BackendHealth {
  status: string;
  engine: string;
  rdkitVersion: string;
  pid: number;
}

interface PythonCommand {
  command: string;
  args: string[];
  cwd: string;
}

function backendRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'backend')
    : join(app.getAppPath(), '..', 'backend');
}

/** Development uses the backend virtualenv; packaging ships a frozen executable. */
function resolvePython(): PythonCommand {
  const override = process.env.ZEPHYRLEA_PYTHON;
  const root = backendRoot();

  if (override) {
    return { command: override, args: [join(root, 'main.py')], cwd: root };
  }

  if (app.isPackaged) {
    return { command: join(root, 'zephyrlea-backend.exe'), args: [], cwd: root };
  }

  const venvPython = join(root, '.venv', 'Scripts', 'python.exe');
  return {
    command: existsSync(venvPython) ? venvPython : 'python',
    args: [join(root, 'main.py')],
    cwd: root,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Owns the Python process that computes structures for the desktop build.
 * The renderer never talks to it directly: every call is proxied over IPC and
 * authenticated with a per-session token.
 */
export class LocalBackend {
  private readonly token = randomBytes(24).toString('hex');
  private child: ChildProcessWithoutNullStreams | null = null;
  private endpoint: string | null = null;
  private starting: Promise<void> | null = null;

  get url(): string | null {
    return this.endpoint;
  }

  ensureStarted(): Promise<void> {
    this.starting ??= this.start().catch((error: unknown) => {
      this.starting = null;
      throw new Error(`本地计算服务启动失败：${describeError(error)}`);
    });
    return this.starting;
  }

  async request<T>(path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
    if (!this.endpoint) throw new Error('本地计算服务尚未就绪。');

    const response = await fetch(`${this.endpoint}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-zephyrlea-token': this.token },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`本地计算服务返回 ${response.status}${detail ? `：${detail}` : ''}`);
    }

    return (await response.json()) as T;
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    this.endpoint = null;
    this.starting = null;
    if (!child) return;

    child.stdin.end();
    child.kill();
  }

  private async start(): Promise<void> {
    const { command, args, cwd } = resolvePython();

    const child = spawn(command, [...args, '--watch-stdin'], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        [TOKEN_ENV]: this.token,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    });
    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => console.log(`[backend] ${chunk.trimEnd()}`));
    child.once('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.endpoint = null;
      this.starting = null;
      console.warn(`[backend] exited with code ${code ?? 'unknown'}`);
    });

    const port = await this.waitForReadyLine(child);
    this.endpoint = `http://127.0.0.1:${port}`;
    await this.waitForHealth();
  }

  private waitForReadyLine(child: ChildProcessWithoutNullStreams): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let buffered = '';
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('等待本地计算服务启动超时。'));
      }, START_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.off('error', onError);
        child.off('exit', onExit);
      };

      const onData = (chunk: string) => {
        buffered += chunk;
        const match = READY_PATTERN.exec(buffered);
        if (!match) return;
        cleanup();
        resolve(Number(match[1]));
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onExit = (code: number | null) => {
        cleanup();
        reject(new Error(`本地计算服务提前退出（退出码 ${code ?? 'unknown'}）。`));
      };

      child.stdout.on('data', onData);
      child.once('error', onError);
      child.once('exit', onExit);
    });
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    let lastError: unknown = null;

    while (Date.now() < deadline) {
      try {
        await this.request<BackendHealth>('/health', undefined, 2_000);
        return;
      } catch (error) {
        lastError = error;
        await delay(250);
      }
    }

    throw new Error(`本地计算服务未在预期时间内就绪：${describeError(lastError)}`);
  }
}
