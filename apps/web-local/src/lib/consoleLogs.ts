import { desktopBridge } from './desktop';

/** 转发时截断过长的参数，避免一条日志把主进程内存与窗口撑爆。 */
const MAX_ARGUMENT_LENGTH = 2000;

function formatArgument(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map(formatArgument)
    .join(' ')
    .slice(0, MAX_ARGUMENT_LENGTH);
}

/**
 * Mirrors `console.warn` / `console.error` (plus uncaught errors) into the
 * system log window. Only the desktop build has a bridge, so the plain browser
 * keeps its console untouched.
 */
export function installConsoleLogForwarding(): void {
  const bridge = desktopBridge();
  if (!bridge) return;

  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);

    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        bridge.logs.report(level, formatArgs(args));
      } catch {
        // 上报失败不能再抛错，否则会把日志窗口自己也拖进异常循环
      }
    };
  }

  window.addEventListener('error', (event) => {
    const detail = event.error instanceof Error ? event.error.stack || event.error.message : event.message;
    bridge.logs.report('error', `未捕获异常：${detail}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    bridge.logs.report('error', `未处理的 Promise 拒绝：${formatArgument(event.reason)}`);
  });
}
