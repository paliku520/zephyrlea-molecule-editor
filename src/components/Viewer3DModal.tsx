import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Box, RotateCcw, X } from 'lucide-react';
import type { GLViewer } from '3dmol';
import { computeConformer, type Conformer3D } from '../lib/conformer3d';
import type { ThemeMode } from '../lib/settings';

type ThreeDmolModule = typeof import('3dmol');

interface Viewer3DModalProps {
  open: boolean;
  smiles: string;
  theme: ThemeMode;
  onClose: () => void;
}

type Stage = 'loading' | 'ready' | 'error';

/** Deterministic so the same structure always yields the same conformer. */
const CONFORMER_SEED = 42;

const VIEWER_BACKGROUND: Record<ThemeMode, string> = {
  dark: '#171717',
  light: '#ffffff',
};

let threeDmolPromise: Promise<ThreeDmolModule> | null = null;

/** 3Dmol ships a UMD webpack bundle, so accept either interop shape. */
function loadThreeDmol(): Promise<ThreeDmolModule> {
  threeDmolPromise ??= import('3dmol')
    .then(
      (module) =>
        ((module as { default?: ThreeDmolModule }).default ?? module) as ThreeDmolModule,
    )
    .catch((error: unknown) => {
      threeDmolPromise = null;
      throw error;
    });

  return threeDmolPromise;
}

export function Viewer3DModal({ open, smiles, theme, onClose }: Viewer3DModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<GLViewer | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const [stage, setStage] = useState<Stage>('loading');
  const [conformer, setConformer] = useState<Conformer3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    setStage('loading');
    setConformer(null);
    setError(null);

    const disposeViewer = () => {
      const viewer = viewerRef.current;
      viewerRef.current = null;
      if (!viewer) return;

      try {
        viewer.clear();
        viewer.render();
      } catch {
        // The canvas may already be detached; dropping the reference is enough.
      }

      container.replaceChildren();
    };

    void (async () => {
      try {
        const result = await computeConformer(smiles, CONFORMER_SEED);
        if (cancelled) return;

        const $3Dmol = await loadThreeDmol();
        if (cancelled) return;

        const viewer = $3Dmol.createViewer(container, {
          backgroundColor: VIEWER_BACKGROUND[themeRef.current],
          backgroundAlpha: 1,
        });

        viewerRef.current = viewer;
        viewer.addModel(result.xyz, 'xyz');
        viewer.setStyle({}, { stick: {}, sphere: { scale: 0.3 } });
        viewer.zoomTo();
        viewer.render();

        setConformer(result);
        setStage('ready');
      } catch (caught: unknown) {
        if (cancelled) return;
        console.error('[3D viewer] Failed to build the conformer', caught);
        setError(caught instanceof Error ? caught.message : String(caught));
        setStage('error');
      }
    })();

    return () => {
      cancelled = true;
      disposeViewer();
    };
    // `theme` is read through a ref: switching themes must not rebuild the model.
  }, [open, smiles, attempt]);

  useEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;

    const observer = new ResizeObserver(() => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.resize();
      viewer.render();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [open, stage]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.setBackgroundColor(VIEWER_BACKGROUND[theme], 1);
    viewer.render();
  }, [theme, stage]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-[var(--shell-scrim)] backdrop-blur-[2px]"
        onPointerDown={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="viewer3d-title"
        className="relative flex h-[min(78vh,720px)] w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_28px_80px_var(--shell-shadow)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Box size={16} strokeWidth={1.8} className="shrink-0 text-ink-muted" />
            <h2 id="viewer3d-title" className="shrink-0 text-[14px] font-semibold text-ink">
              3D 视图
            </h2>
            <span className="min-w-0 truncate font-mono text-[11.5px] text-ink-faint">{smiles}</span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {conformer && (
              <span className="hidden text-[11px] text-ink-faint sm:inline">
                {conformer.atomCount} 个原子
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭 3D 视图"
              title="关闭 3D 视图"
              className="-mr-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <X size={16} strokeWidth={1.9} />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={containerRef}
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            style={{ backgroundColor: VIEWER_BACKGROUND[theme] }}
          />

          {stage === 'ready' && (
            <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] leading-relaxed text-ink-faint">
              当前 3D 构象由本地算法生成，仅供参考
            </p>
          )}

          {stage === 'loading' && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel/70">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-ink/60" />
              <p className="text-[13px] text-ink-soft">正在计算 3D 构象…</p>
              <p className="text-[11px] text-ink-faint">首次使用需加载本地计算引擎</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-panel px-6">
              <div className="max-w-md text-center">
                <AlertTriangle size={22} className="mx-auto text-danger" />
                <p className="mt-3 text-sm font-medium text-ink">无法生成 3D 构象</p>
                <p className="mt-2 break-words text-xs leading-relaxed text-ink-muted">{error}</p>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-hover px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-hover-strong"
                >
                  <RotateCcw size={13} strokeWidth={2} />
                  重试
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
