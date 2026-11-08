import { AlertTriangle, Check, ChevronLeft, LoaderCircle, PanelRightOpen, RefreshCw, ShieldCheck } from 'lucide-react';
import type { StructureIssue, StructureValidation } from '../lib/structureValidation';

export type EngineState = 'loading' | 'ready' | 'error';
export type ValidationState = 'idle' | 'checking' | 'done' | 'error';

interface ValidationPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  engine: EngineState;
  engineError: string | null;
  onReloadEngine: () => void;
  status: ValidationState;
  validation: StructureValidation | null;
  error: string | null;
  hasContent: boolean;
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] text-ink-muted">
      <LoaderCircle size={15} className="animate-spin text-ink-faint" />
      {label}
    </div>
  );
}

function IssueRow({ issue }: { issue: StructureIssue }) {
  const blocking = issue.blocking;

  return (
    <li
      className={`rounded-lg border px-3 py-2.5 ${
        blocking ? 'border-danger/45 bg-danger/10' : 'border-warning/40 bg-warning/10'
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            blocking ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'
          }`}
        >
          !
        </span>
        <div className="min-w-0">
          <p className="text-[12px] leading-5 text-ink">{issue.description}</p>
          <p className="mt-1 break-words font-mono text-[10.5px] leading-relaxed text-ink-muted">
            {issue.message}
          </p>
        </div>
      </div>
    </li>
  );
}

export function ValidationPanel({
  collapsed,
  onToggle,
  engine,
  engineError,
  onReloadEngine,
  status,
  validation,
  error,
  hasContent,
}: ValidationPanelProps) {
  const blocking = validation?.issues.filter((issue) => issue.blocking) ?? [];
  const warnings = validation?.issues.filter((issue) => !issue.blocking) ?? [];
  const hasIssues = blocking.length > 0 || warnings.length > 0;
  const badgeCount = blocking.length > 0 ? blocking.length : warnings.length;

  if (collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-line bg-panel py-2.5">
        <button
          type="button"
          onClick={onToggle}
          title="展开结构校验面板"
          aria-label="展开结构校验面板"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <PanelRightOpen size={16} strokeWidth={1.7} />
        </button>
        <span
          title={
            blocking.length > 0
              ? `${blocking.length} 个价键错误`
              : warnings.length > 0
                ? `${warnings.length} 条提示`
                : '结构校验'
          }
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
            blocking.length > 0
              ? 'bg-danger/20 text-danger'
              : warnings.length > 0
                ? 'bg-warning/20 text-warning'
                : validation?.ok
                  ? 'bg-accent/20 text-accent'
                  : 'bg-hover text-ink-muted'
          }`}
        >
          {badgeCount > 0 ? badgeCount : validation?.ok ? <Check size={12} strokeWidth={3} /> : '–'}
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex w-[304px] shrink-0 flex-col border-l border-line bg-panel">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        {blocking.length > 0 ? (
          <AlertTriangle size={15} className="text-danger" strokeWidth={2} />
        ) : warnings.length > 0 ? (
          <AlertTriangle size={15} className="text-warning" strokeWidth={2} />
        ) : (
          <ShieldCheck size={15} className="text-accent" strokeWidth={1.9} />
        )}
        <h2 className="text-[12.5px] font-semibold text-ink">结构校验</h2>
        <span className="rounded-full border border-line-strong px-1.5 py-[1px] text-[9.5px] font-medium tracking-wide text-ink-muted">
          RDKit
        </span>
        <button
          type="button"
          onClick={onToggle}
          title="收起面板"
          aria-label="收起结构校验面板"
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <ChevronLeft size={15} strokeWidth={2} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {engine === 'loading' && <Spinner label="正在加载 RDKit 校验引擎…" />}

        {engine === 'error' && (
          <div className="rounded-lg border border-line-strong bg-hover px-3 py-2.5">
            <p className="text-[12px] font-medium text-ink">RDKit 加载失败</p>
            <p className="mt-1 break-words text-[11px] leading-relaxed text-ink-muted">
              {engineError ?? '未知错误'}
            </p>
            <button
              type="button"
              onClick={onReloadEngine}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-hover px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:bg-hover-strong hover:text-ink"
            >
              <RefreshCw size={12} strokeWidth={2} />
              重新加载
            </button>
          </div>
        )}

        {engine === 'ready' && status === 'checking' && !validation && <Spinner label="正在检查结构…" />}

        {engine === 'ready' && status === 'error' && (
          <div className="rounded-lg border border-line-strong bg-hover px-3 py-2.5">
            <p className="text-[12px] font-medium text-ink">校验未完成</p>
            <p className="mt-1 break-words text-[11px] leading-relaxed text-ink-muted">{error}</p>
          </div>
        )}

        {engine === 'ready' && !hasContent && (
          <p className="text-[12px] leading-relaxed text-ink-muted">
            画布为空。绘制结构后会自动进行价键校验。
          </p>
        )}

        {engine === 'ready' && hasContent && status === 'done' && !validation && (
          <p className="text-[12px] leading-relaxed text-ink-muted">未能读取画布上的结构。</p>
        )}

        {engine === 'ready' && hasContent && validation && !hasIssues && (
          <div className="rounded-lg border border-accent/35 bg-accent/10 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Check size={13} strokeWidth={2.6} className="text-accent" />
              <p className="text-[12px] font-semibold text-ink">结构有效</p>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
              {validation.moleculeCount} 个结构 · {validation.atomCount} 个原子，未发现价键错误。
            </p>
          </div>
        )}

        {engine === 'ready' && hasContent && validation && hasIssues && (
          <div className="space-y-3">
            {blocking.length > 0 && (
              <div className="rounded-lg border border-danger/45 bg-danger/10 px-3 py-2.5">
                <p className="text-[12px] font-semibold text-danger">{blocking.length} 个价键错误</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
                  已禁用「整理」与「在 3D 中查看」，请修正标红的原子后重试。
                </p>
              </div>
            )}

            {blocking.length > 0 && (
              <ul className="space-y-2">
                {blocking.map((issue) => (
                  <IssueRow key={issue.key} issue={issue} />
                ))}
              </ul>
            )}

            {warnings.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">其他提示</p>
                <ul className="space-y-2">
                  {warnings.map((issue) => (
                    <IssueRow key={issue.key} issue={issue} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-3 py-2 text-[10.5px] leading-relaxed text-ink-faint">
        由 RDKit WASM 实时校验 · 每次编辑后自动重新检查
      </footer>
    </aside>
  );
}
