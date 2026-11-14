import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Clipboard, Eraser, Terminal } from 'lucide-react';
import { desktopBridge, type LogEntry, type LogLevel } from '../lib/desktop';

/** Hard cap on rendered rows: older entries are dropped from the head. */
const MAX_VISIBLE_ENTRIES = 1000;

type LevelFilter = 'all' | LogLevel;

const LEVEL_FILTERS: { value: LevelFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'info', label: 'INFO' },
  { value: 'warn', label: 'WARN' },
  { value: 'error', label: 'ERROR' },
];

/** 选中态直接用该级别的实色，扫一眼就知道当前在看哪一级。 */
const FILTER_ACTIVE: Record<LevelFilter, string> = {
  all: 'bg-hover-strong text-ink',
  info: 'bg-[var(--log-info-badge)] text-white',
  warn: 'bg-[var(--log-warn-badge)] text-[var(--log-warn-badge-ink)]',
  error: 'bg-[var(--log-error-badge)] text-[var(--log-error-badge-ink)]',
};

/** 级别配色取自 index.css 里的 --log-* 变量：文字用高饱和前景，badge 用实色底。 */
const LEVEL_TEXT: Record<LogLevel, string> = {
  info: 'text-[var(--log-info)]',
  warn: 'text-[var(--log-warn)]',
  error: 'text-[var(--log-error)]',
};

const LEVEL_BADGE: Record<LogLevel, string> = {
  info: 'bg-[var(--log-info-badge)] text-white',
  warn: 'bg-[var(--log-warn-badge)] text-[var(--log-warn-badge-ink)]',
  error: 'bg-[var(--log-error-badge)] text-[var(--log-error-badge-ink)]',
};

/** 行首色条与整行底纹，让 WARN / ERROR 在一屏日志里一眼可见。 */
const LEVEL_ROW: Record<LogLevel, string> = {
  info: 'border-l-transparent hover:bg-hover/50',
  warn: 'border-l-[var(--log-warn)] bg-[var(--log-warn)]/[0.07] hover:bg-[var(--log-warn)]/[0.12]',
  error: 'border-l-[var(--log-error)] bg-[var(--log-error)]/[0.09] hover:bg-[var(--log-error)]/[0.15]',
};

const SOURCE_LABEL: Record<string, string> = {
  main: 'MAIN',
  backend: 'PYTHON',
  renderer: 'WEB',
};

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** `14:03:22.481` — milliseconds are what make interleaved sources readable. */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function formatForClipboard(entries: LogEntry[]): string {
  return entries
    .map((entry) => `[${formatTime(entry.timestamp)}] ${entry.level.toUpperCase()} ${entry.source} ${entry.message}`)
    .join('\n');
}

/** Appends while keeping the list bounded; ids let history and live entries merge. */
function appendEntries(current: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  const seen = new Set(current.map((entry) => entry.id));
  const merged = [...current];

  for (const entry of incoming) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }

  merged.sort((left, right) => left.id - right.id);
  return merged.length > MAX_VISIBLE_ENTRIES ? merged.slice(merged.length - MAX_VISIBLE_ENTRIES) : merged;
}

export function LogsWindow() {
  const bridge = desktopBridge();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bridge) return;

    // 先订阅再取历史：两者用 id 合并，先到的实时日志不会丢。
    const unsubscribeEntry = bridge.logs.onEntry((entry) => {
      setEntries((current) => appendEntries(current, [entry]));
    });
    const unsubscribeClear = bridge.logs.onCleared(() => setEntries([]));

    let cancelled = false;
    void bridge.logs
      .history()
      .then((history) => {
        if (!cancelled) setEntries((current) => appendEntries(current, history));
      })
      .catch((error: unknown) => {
        console.error('[logs] 读取历史日志失败', error);
      });

    return () => {
      cancelled = true;
      unsubscribeEntry();
      unsubscribeClear();
    };
  }, [bridge]);

  const visible = useMemo(
    () => (levelFilter === 'all' ? entries : entries.filter((entry) => entry.level === levelFilter)),
    [entries, levelFilter],
  );

  // useLayoutEffect so the jump happens in the same frame the rows are painted.
  useLayoutEffect(() => {
    if (!autoScroll) return;
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [visible, autoScroll]);

  const handleClear = () => {
    setEntries([]);
    void bridge?.logs.clear().catch(() => undefined);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatForClipboard(visible));
      setCopyState('copied');
    } catch (error) {
      console.error('[logs] 复制日志失败', error);
      setCopyState('failed');
    }

    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <Terminal size={15} strokeWidth={2} />
          系统日志
        </span>
        <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] text-ink-muted">
          {visible.length} / {entries.length} 条
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-md border border-line-strong p-0.5">
            {LEVEL_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setLevelFilter(filter.value)}
                aria-pressed={levelFilter === filter.value}
                className={`h-6 rounded px-2 text-[11px] font-semibold transition-colors ${
                  levelFilter === filter.value
                    ? FILTER_ACTIVE[filter.value]
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoScroll}
            onClick={() => setAutoScroll((value) => !value)}
            title="开启后新日志会自动滚动到最新一条"
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors ${
              autoScroll
                ? 'border-accent/60 bg-accent/15 text-accent'
                : 'border-line-strong text-ink-muted hover:text-ink'
            }`}
          >
            <ArrowDownToLine size={13} strokeWidth={2} />
            自动滚动
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="把当前筛选结果复制到剪贴板"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong px-2 text-[11px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
          >
            <Clipboard size={13} strokeWidth={2} />
            {copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制全部'}
          </button>

          <button
            type="button"
            onClick={handleClear}
            title="清空所有窗口中的日志"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong px-2 text-[11px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
          >
            <Eraser size={13} strokeWidth={2} />
            清空日志
          </button>
        </div>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto font-mono text-[11.5px] leading-relaxed"
      >
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-ink-faint">
            {entries.length === 0 ? '暂无日志' : '当前筛选条件下没有日志'}
          </p>
        ) : (
          <ol className="divide-y divide-line/60">
            {visible.map((entry) => (
              <li
                key={entry.id}
                className={`flex items-start gap-2 border-l-2 px-3 py-1 transition-colors ${LEVEL_ROW[entry.level]}`}
              >
                <span className="shrink-0 text-ink-faint">{formatTime(entry.timestamp)}</span>
                <span
                  className={`w-[52px] shrink-0 rounded px-1 text-center text-[10px] font-bold tracking-wide ${LEVEL_BADGE[entry.level]}`}
                >
                  {entry.level.toUpperCase()}
                </span>
                <span className="w-[48px] shrink-0 text-[10px] font-semibold tracking-wide text-ink-muted">
                  {SOURCE_LABEL[entry.source] ?? entry.source.toUpperCase()}
                </span>
                <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${LEVEL_TEXT[entry.level]}`}>
                  {entry.message}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-3 py-1.5 text-[10.5px] text-ink-faint">
        最多保留 {MAX_VISIBLE_ENTRIES} 条 · Ctrl/⌘ + Shift + L 再次打开本窗口
      </footer>
    </div>
  );
}
