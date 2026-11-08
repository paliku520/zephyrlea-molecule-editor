import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Atom,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  LoaderCircle,
  PanelRightOpen,
  RefreshCw,
} from 'lucide-react';
import type {
  MoleculeSummary,
  StructureIssue,
  StructureValidation,
} from '../lib/structureValidation';

export type EngineState = 'loading' | 'ready' | 'error';
export type ValidationState = 'idle' | 'checking' | 'done' | 'error';

interface AnalysisPanelProps {
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

function SectionHeading({ children, meta }: { children: ReactNode; meta?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {children}
      </span>
      <span className="h-px flex-1 bg-line" />
      {meta && <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">{meta}</span>}
    </div>
  );
}

function formatCharge(charge: number): string {
  return charge > 0 ? `+${charge}` : String(charge);
}

function MoleculeCard({
  summary,
  showLabel,
  collapsed,
  onToggle,
}: {
  summary: MoleculeSummary;
  showLabel: boolean;
  /** Owned by the panel so the state survives collapsing the panel itself. */
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const info = summary.info;

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!info) {
    return (
      <div className="rounded-lg border border-line-strong bg-hover px-3 py-2.5">
        <p className="text-[12px] font-medium text-ink">结构 {summary.index + 1} 无法解析</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
          修正价键问题后会自动重新计算分子式与描述符。
        </p>
      </div>
    );
  }

  const stats: Array<{ label: string; value: string }> = [
    { label: '精确质量', value: info.exactMass.toFixed(4) },
    { label: '重原子', value: String(info.heavyAtoms) },
    { label: '原子总数', value: String(info.totalAtoms) },
    { label: '化学键', value: String(info.bonds) },
    { label: '环数', value: String(info.rings) },
    ...(info.aromaticRings > 0 ? [{ label: '芳香环', value: String(info.aromaticRings) }] : []),
    { label: '可旋转键', value: String(info.rotatableBonds) },
    { label: '氢键供体', value: String(info.hydrogenDonors) },
    { label: '氢键受体', value: String(info.hydrogenAcceptors) },
    { label: 'TPSA', value: `${info.polarSurfaceArea.toFixed(2)} Å²` },
    { label: 'cLogP', value: info.logP.toFixed(2) },
  ];

  const copySmiles = () => {
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) return;

    void clipboard.writeText(info.smiles).then(
      () => setCopied(true),
      (copyError: unknown) => console.warn('[Clipboard] Copy failed', copyError),
    );
  };

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-hover">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={collapsed ? '展开分子信息' : '收起分子信息'}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-hover-strong"
      >
        <div className="min-w-0 flex-1">
          {showLabel && (
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
              结构 {summary.index + 1}
            </p>
          )}
          <p className="flex flex-wrap items-baseline gap-1.5">
            <span className="break-all font-mono text-[15.5px] font-semibold leading-6 text-ink">
              {info.formula}
            </span>
            {info.charge !== 0 && (
              <span
                title={`净电荷 ${formatCharge(info.charge)}`}
                className="rounded-full border border-line-strong bg-hover-strong px-1.5 py-[1px] font-mono text-[10px] leading-4 tabular-nums text-ink-soft"
              >
                {formatCharge(info.charge)}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            相对分子质量{' '}
            <span className="font-mono text-[11.5px] tabular-nums text-ink-soft">
              {info.mass.toFixed(2)}
            </span>
          </p>
        </div>

        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`mt-1 shrink-0 text-ink-faint transition-transform duration-150 ${
            collapsed ? '-rotate-90' : ''
          }`}
        />
      </button>

      {!collapsed && (
        <div className="px-3 pb-2.5">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            {stats.map((stat) => (
              <div
                key={stat.label}
                title={`${stat.label}：${stat.value}`}
                className="flex min-w-0 items-baseline justify-between gap-2"
              >
                <dt className="shrink-0 text-[11px] text-ink-muted">{stat.label}</dt>
                <dd className="truncate font-mono text-[11px] tabular-nums text-ink-soft">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            onClick={copySmiles}
            title={copied ? '已复制到剪贴板' : `点击复制 SMILES：${info.smiles}`}
            className="mt-2.5 flex w-full items-center gap-2 rounded-md border border-line bg-panel/60 px-2 py-1.5 text-left transition-colors hover:bg-hover-strong"
          >
            <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
              SMILES
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-soft">
              {info.smiles}
            </span>
            {copied ? (
              <Check size={12} strokeWidth={2.6} className="shrink-0 text-accent" />
            ) : (
              <Copy size={12} strokeWidth={2} className="shrink-0 text-ink-faint" />
            )}
          </button>
        </div>
      )}
    </section>
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

export function AnalysisPanel({
  collapsed,
  onToggle,
  engine,
  engineError,
  onReloadEngine,
  status,
  validation,
  error,
  hasContent,
}: AnalysisPanelProps) {
  const blocking = validation?.issues.filter((issue) => issue.blocking) ?? [];
  const warnings = validation?.issues.filter((issue) => !issue.blocking) ?? [];
  const hasIssues = blocking.length > 0 || warnings.length > 0;
  const badgeCount = blocking.length > 0 ? blocking.length : warnings.length;
  const summaries = validation?.molecules ?? [];
  const single = summaries.find((summary) => summary.info)?.info ?? null;

  const issuesRef = useRef<HTMLDivElement>(null);
  const previousBlocking = useRef(0);
  const [collapsedCards, setCollapsedCards] = useState<ReadonlySet<number>>(() => new Set());

  const toggleCard = useCallback((index: number) => {
    setCollapsedCards((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (blocking.length > 0 && previousBlocking.current === 0) {
      issuesRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    previousBlocking.current = blocking.length;
  }, [blocking.length]);

  // Indexes are the only identity a card has, so forget them once the canvas is empty.
  useEffect(() => {
    if (summaries.length === 0) setCollapsedCards(new Set());
  }, [summaries.length]);

  if (collapsed) {
    return (
      <aside className="flex min-h-0 w-11 shrink-0 flex-col items-center gap-2 overflow-hidden border-l border-line bg-panel py-2.5">
        <button
          type="button"
          onClick={onToggle}
          title="展开分子分析面板"
          aria-label="展开分子分析面板"
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
                : single
                  ? `${single.formula} · 结构有效`
                  : '分子分析'
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
    <aside className="flex min-h-0 w-[304px] shrink-0 flex-col overflow-hidden border-l border-line bg-panel">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Atom
          size={15}
          strokeWidth={1.9}
          className={
            blocking.length > 0 ? 'text-danger' : warnings.length > 0 ? 'text-warning' : 'text-accent'
          }
        />
        <h2 className="text-[12.5px] font-semibold text-ink">分子分析</h2>
        <span className="rounded-full border border-line-strong px-1.5 py-[1px] text-[9.5px] font-medium tracking-wide text-ink-muted">
          RDKit
        </span>
        <button
          type="button"
          onClick={onToggle}
          title="收起面板"
          aria-label="收起分子分析面板"
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <ChevronLeft size={15} strokeWidth={2} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {engine === 'loading' && <Spinner label="正在加载 RDKit 分析引擎…" />}

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

        {engine === 'ready' && (
          <div className="space-y-4">
            <section>
              <SectionHeading meta={summaries.length > 1 ? `${summaries.length} 个结构` : undefined}>
                分子信息
              </SectionHeading>

              {!hasContent && (
                <p className="text-[12px] leading-relaxed text-ink-muted">
                  画布为空。绘制结构后会自动计算分子式、分子量与分子描述符。
                </p>
              )}

              {hasContent && summaries.length > 0 && (
                <div className="space-y-2">
                  {summaries.map((summary) => (
                    <MoleculeCard
                      key={summary.index}
                      summary={summary}
                      showLabel={summaries.length > 1}
                      collapsed={collapsedCards.has(summary.index)}
                      onToggle={() => toggleCard(summary.index)}
                    />
                  ))}
                </div>
              )}

              {hasContent && summaries.length === 0 && status === 'checking' && (
                <Spinner label="正在分析结构…" />
              )}

              {hasContent && summaries.length === 0 && status !== 'checking' && (
                <p className="text-[12px] leading-relaxed text-ink-muted">暂无可分析的分子信息。</p>
              )}
            </section>

            <div ref={issuesRef}>
              <SectionHeading meta={blocking.length > 0 ? `${blocking.length} 个错误` : undefined}>
                结构校验
              </SectionHeading>

              {status === 'checking' && !validation && <Spinner label="正在检查结构…" />}

              {status === 'error' && (
                <div className="rounded-lg border border-line-strong bg-hover px-3 py-2.5">
                  <p className="text-[12px] font-medium text-ink">校验未完成</p>
                  <p className="mt-1 break-words text-[11px] leading-relaxed text-ink-muted">{error}</p>
                </div>
              )}

              {hasContent && status === 'done' && !validation && (
                <p className="text-[12px] leading-relaxed text-ink-muted">未能读取画布上的结构。</p>
              )}

              {validation && !hasIssues && (
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

              {validation && hasIssues && (
                <div className="space-y-3">
                  {blocking.length > 0 && (
                    <div className="rounded-lg border border-danger/45 bg-danger/10 px-3 py-2.5">
                      <p className="text-[12px] font-semibold text-danger">
                        {blocking.length} 个价键错误
                      </p>
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
                      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                        其他提示
                      </p>
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
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-3 py-2 text-[10.5px] leading-relaxed text-ink-faint">
        由 RDKit WASM 实时分析 · 每次编辑后自动刷新
      </footer>
    </aside>
  );
}
