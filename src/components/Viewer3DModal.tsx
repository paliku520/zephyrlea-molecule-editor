import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AlertTriangle, Box, RotateCcw, X } from 'lucide-react';
import type { AtomStyleSpec, GLViewer } from '3dmol';
import { computeConformer, type Conformer3D } from '../lib/conformer3d';
import type {
  Model3DStyle,
  ThemeMode,
  Viewer3DDragMode,
  Viewer3DToolbarAlign,
} from '../lib/settings';
import { Viewer3DToolbar } from './Viewer3DToolbar';

type ThreeDmolModule = typeof import('3dmol');

interface Viewer3DModalProps {
  open: boolean;
  smiles: string;
  theme: ThemeMode;
  modelStyle: Model3DStyle;
  onModelStyleChange: (style: Model3DStyle) => void;
  toolbarAlign: Viewer3DToolbarAlign;
  onClose: () => void;
}

type Stage = 'loading' | 'ready' | 'error';

/** Deterministic so the same structure always yields the same conformer. */
const CONFORMER_SEED = 42;

/** Zoom applied per wheel notch; the reciprocal is used for zooming out. */
const ZOOM_STEP = 1.12;

/**
 * Thin sticks keep single bonds light; the raised multi-bond scaling stops the
 * double / triple bond cylinders from disappearing at that radius.
 */
const STICK_SPEC: AtomStyleSpec = {
  stick: { radius: 0.15, doubleBondScaling: 0.55, tripleBondScaling: 0.45 },
};

const MODEL_STYLE_SPECS: Record<Model3DStyle, AtomStyleSpec> = {
  'ball-stick': { ...STICK_SPEC, sphere: { scale: 0.3 } },
  'space-fill': { sphere: { scale: 1 } },
  stick: STICK_SPEC,
  // WebGL caps `line` width at 1px, which all but disappears on a dark canvas,
  // so the wireframe is drawn as hairline sticks instead.
  wireframe: {
    stick: { radius: 0.05, doubleBondScaling: 0.95, tripleBondScaling: 0.8 },
  },
};

/**
 * `zoomTo()` measures atom centres only, so the large space-filling spheres would
 * end up touching the frame; pull the camera back for that style.
 */
function fitView(viewer: GLViewer, style: Model3DStyle) {
  viewer.zoomTo();
  if (style === 'space-fill') viewer.zoom(0.75);
}

/**
 * "Move camera" drags shift the camera instead of the model, which `setView()`
 * cannot undo, so the camera is pointed back at the origin by hand.
 */
function resetCamera(viewer: GLViewer) {
  const internal = viewer as unknown as {
    lookingAt?: { set?: (x: number, y: number, z: number) => void };
    camera?: { lookAt?: (target: unknown) => void };
  };

  internal.lookingAt?.set?.(0, 0, 0);
  if (internal.lookingAt) internal.camera?.lookAt?.(internal.lookingAt);
}

/** Back to the default orientation, camera position and distance for the style. */
function resetView(viewer: GLViewer, style: Model3DStyle) {
  const view = viewer.getView();
  // Keep only the camera distance; the pan offsets and rotation go back to zero
  // (an identity quaternion) before the view is re-fitted.
  viewer.setView([0, 0, 0, view[3] ?? 0, 0, 0, 0, 1]);
  resetCamera(viewer);
  fitView(viewer, style);
  viewer.render();
}

const VIEWER_BACKGROUND: Record<ThemeMode, string> = {
  dark: '#171717',
  light: '#ffffff',
};

const TOOLBAR_ALIGN_CLASS: Record<Viewer3DToolbarAlign, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
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

export function Viewer3DModal({
  open,
  smiles,
  theme,
  modelStyle,
  onModelStyleChange,
  toolbarAlign,
  onClose,
}: Viewer3DModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<GLViewer | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const modelStyleRef = useRef(modelStyle);
  modelStyleRef.current = modelStyle;

  const [stage, setStage] = useState<Stage>('loading');
  const [conformer, setConformer] = useState<Conformer3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [maximized, setMaximized] = useState(false);
  const [dragMode, setDragMode] = useState<Viewer3DDragMode>('rotate');

  /** Pointer state of the "move camera" overlay; `null` when not dragging. */
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (open) {
      setMaximized(false);
      setDragMode('rotate');
    }
  }, [open]);

  const handlePanStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events have no active pointer; dragging still works without capture.
    }
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }, []);

  const handlePanMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panRef.current;
    const viewer = viewerRef.current;
    if (!drag || !viewer || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (dx === 0 && dy === 0) return;

    drag.x = event.clientX;
    drag.y = event.clientY;

    // `translate` moves the camera laterally while the structures stay put, so
    // this pans instead of rotating. Its y axis points up, hence the negation.
    viewer.translate(dx, -dy);
    viewer.render();
  }, []);

  const handlePanEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  /**
   * Wheel zoom in every drag mode, anchored on the pointer: the point under the
   * cursor stays under the cursor, so zooming works in whichever direction the
   * user is looking instead of only towards the middle of the view.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;

    const onWheel = (event: WheelEvent) => {
      const viewer = viewerRef.current;
      if (!viewer || event.deltaY === 0) return;

      // Capture phase: 3Dmol's own wheel handler would otherwise zoom as well.
      event.preventDefault();
      event.stopPropagation();

      const factor = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const rect = container.getBoundingClientRect();
      const offsetX = event.clientX - (rect.left + rect.width / 2);
      const offsetY = event.clientY - (rect.top + rect.height / 2);

      viewer.zoom(factor);

      if (offsetX !== 0 || offsetY !== 0) {
        // Scaling by `factor` pushes a point at `offset` out to `offset * factor`;
        // move the camera back by the difference so it stays put.
        viewer.translate(-(factor - 1) * offsetX, (factor - 1) * offsetY);
      }

      viewer.render();
    };

    container.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => container.removeEventListener('wheel', onWheel, { capture: true });
  }, [open, stage]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      // Escape leaves full-screen first so the dialog is not dismissed by accident.
      if (maximized) {
        setMaximized(false);
        return;
      }
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose, maximized]);

  const handleResetView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    resetView(viewer, modelStyleRef.current);
  }, []);

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
        viewer.addModel(result.molblock, 'sdf');
        viewer.setStyle({}, MODEL_STYLE_SPECS[modelStyleRef.current]);
        fitView(viewer, modelStyleRef.current);
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

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || stage !== 'ready') return;

    // Only the style and the camera distance change, so the angle the user
    // rotated to is kept; re-fitting stops space-filling spheres from clipping.
    viewer.setStyle({}, MODEL_STYLE_SPECS[modelStyle]);
    fitView(viewer, modelStyle);
    viewer.render();
  }, [modelStyle, stage]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[140] flex items-center justify-center ${
        maximized ? 'p-2' : 'p-6'
      }`}
    >
      <div
        className="absolute inset-0 bg-[var(--shell-scrim)] backdrop-blur-[2px]"
        onPointerDown={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="viewer3d-title"
        className={`relative flex w-full flex-col overflow-hidden border border-line-strong bg-panel shadow-[0_28px_80px_var(--shell-shadow)] ${
          maximized ? 'h-full max-w-none rounded-xl' : 'h-[min(78vh,720px)] max-w-[1080px] rounded-2xl'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Box size={16} strokeWidth={1.8} className="shrink-0 text-ink-muted" />
            <h2 id="viewer3d-title" className="shrink-0 text-[14px] font-semibold text-ink">
              3D 视图
            </h2>
            <span className="min-w-0 truncate font-mono text-[11.5px] text-ink-faint">{smiles}</span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {conformer && (
              <span className="mr-1.5 hidden text-[11px] text-ink-faint sm:inline">
                {conformer.fragmentCount > 1 && `${conformer.fragmentCount} 个结构 · `}
                {conformer.atomCount} 个原子 · {conformer.bondCount} 根键
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
            className={`absolute inset-0 ${
              dragMode === 'rotate' ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
            style={{ backgroundColor: VIEWER_BACKGROUND[theme] }}
          />

          {/*
            In "move camera" mode this layer takes the pointer events, so 3Dmol
            does not rotate the structures and the drag can pan the camera.
          */}
          {dragMode === 'pan' && (
            <div
              className="absolute inset-0 cursor-move touch-none select-none active:cursor-grabbing"
              onPointerDown={handlePanStart}
              onPointerMove={handlePanMove}
              onPointerUp={handlePanEnd}
              onPointerCancel={handlePanEnd}
            />
          )}

          {stage === 'ready' && (
            <p className="pointer-events-none absolute left-4 top-3 text-[11px] leading-relaxed text-ink-faint">
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

          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 flex p-3 ${
              TOOLBAR_ALIGN_CLASS[toolbarAlign]
            }`}
          >
            <Viewer3DToolbar
              modelStyle={modelStyle}
              onModelStyleChange={onModelStyleChange}
              dragMode={dragMode}
              onDragModeChange={setDragMode}
              onResetView={handleResetView}
              maximized={maximized}
              onToggleMaximized={() => setMaximized((value) => !value)}
              ready={stage === 'ready'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
