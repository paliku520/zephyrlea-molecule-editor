import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { app } from 'electron';
import type { Logger, LogLevel } from './logger';

const READY_PATTERN = /ZEPHYRLEA_BACKEND_READY\s+(\d+)/;
const TOKEN_ENV = 'ZEPHYRLEA_BACKEND_TOKEN';
const START_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 20_000;
/** 单行超过这个长度就丢弃前半段，防止没有换行的输出撑爆内存。 */
const MAX_PENDING_CHARS = 64 * 1024;

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

/**
 * Splits a stream into lines and hands each one over as soon as it is complete.
 * Without this, several log lines would arrive glued together in one chunk.
 */
function forwardLines(stream: Readable, onLine: (line: string) => void): void {
  let buffered = '';

  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    buffered += chunk;

    let index = buffered.indexOf('\n');
    while (index >= 0) {
      const line = buffered.slice(0, index).replace(/\r$/, '');
      buffered = buffered.slice(index + 1);
      if (line.trim()) onLine(line);
      index = buffered.indexOf('\n');
    }

    if (buffered.length > MAX_PENDING_CHARS) buffered = buffered.slice(-MAX_PENDING_CHARS);
  });
}

/** Uvicorn writes everything to one of the two streams, so classify by content. */
function classifyLevel(line: string): LogLevel {
  if (/\b(?:error|exception|traceback|fatal|critical)\b/i.test(line)) return 'error';
  if (/\b(?:warn|warning)\b/i.test(line)) return 'warn';
  return 'info';
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Pull the friendly message out of a failed response body, if there is one. */
function describeFailure(payload: string): string | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as {
      error?: { message?: string };
      detail?: string | { message?: string };
    };

    if (typeof parsed.error?.message === 'string') return parsed.error.message;
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (typeof parsed.detail?.message === 'string') return parsed.detail.message;
  } catch {
    // 不是 JSON（例如代理返回的 HTML 错误页），退回原文
  }

  return payload.length > 300 ? `${payload.slice(0, 300)}…` : payload;
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

  constructor(private readonly logger: Logger) {}

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
      // 后端用 {"error": {"message"}} 描述可预期的失败（例如 3D 嵌入失败），
      // 直接把这句话透给界面，比「返回 422」有用得多。
      const payload = await response.text().catch(() => '');
      throw new Error(describeFailure(payload) ?? `本地计算服务返回 ${response.status}`);
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
    this.logger.info('backend', `启动本地计算服务：${command} ${args.join(' ')}`);

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

    // stdout 是握手行与 access log，stderr 是 uvicorn 的错误日志；
    // 两者都按行转发到系统日志，握手行交给 waitForReadyLine 单独处理。
    forwardLines(child.stdout, (line) => {
      if (READY_PATTERN.test(line)) return;
      this.logger.log(classifyLevel(line), 'backend', line);
    });
    forwardLines(child.stderr, (line) => {
      this.logger.log(classifyLevel(line), 'backend', line);
    });

    child.once('error', (error: Error) => {
      this.logger.error('backend', `本地计算服务进程异常：${error.message}`);
    });

    child.once('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.endpoint = null;
      this.starting = null;
      const message = `本地计算服务已退出（退出码 ${code ?? 'unknown'}）`;
      if (code === 0) this.logger.info('backend', message);
      else this.logger.error('backend', message);
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
