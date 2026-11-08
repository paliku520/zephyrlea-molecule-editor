import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, LoaderCircle, Search, X } from 'lucide-react';
import { AppHeader } from './AppHeader';
import { AboutModal } from './AboutModal';
import { TopBar } from './TopBar';
import { LeftToolRail } from './LeftToolRail';
import { ElementStrip } from './ElementStrip';
import { SelectionToolbar } from './SelectionToolbar';
import { SettingsModal } from './SettingsModal';
import { PeriodicTableModal } from './PeriodicTableModal';
import { Viewer3DModal } from './Viewer3DModal';
import { AnalysisPanel, type EngineState, type ValidationState } from './AnalysisPanel';
import { ValidationOverlay, type ValidationMark } from './ValidationOverlay';
import { waitForKekule } from '../lib/kekule';
import {
  createEditorBridge,
  type MoleculeEditorBridge,
  type SelectionSnapshot,
  type ToolId,
} from '../lib/editorBridge';
import { loadRDKit } from '../lib/rdkit';
import { applyThemeToDocument, loadSettings, saveSettings, type AppSettings } from '../lib/settings';
import {
  validateStructure,
  type StructureValidation,
  type ValidationTarget,
} from '../lib/structureValidation';

interface ToastState {
  /** `pending` is a blocking-progress note: it stays until it is replaced. */
  kind: 'success' | 'error' | 'info' | 'pending';
  title: string;
  detail?: string;
}

/** Height of the docked bottom chrome: element strip (52) + tool rail (53) + action bar (56). */
const BOTTOM_CHROME_PX = 161;

function ToastIcon({ kind }: { kind: ToastState['kind'] }) {
  if (kind === 'success') {
    return <Check size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-accent" />;
  }

  if (kind === 'error') {
    return <AlertTriangle size={16} strokeWidth={1.9} className="mt-0.5 shrink-0 text-danger" />;
  }

  if (kind === 'pending') {
    return <LoaderCircle size={16} strokeWidth={2} className="mt-0.5 shrink-0 animate-spin text-accent" />;
  }

  return <Info size={16} strokeWidth={1.9} className="mt-0.5 shrink-0 text-ink-muted" />;
}

/**
 * Resolve after the browser painted the current state. Clean Up blocks the main
 * thread, so the progress toast has to reach the screen before it starts.
 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

/** Maps RDKit atom indexes back to the Kekule atoms drawn on the canvas. */
function buildValidationMarks(
  validation: StructureValidation,
  targets: ValidationTarget[],
): ValidationMark[] {
  const marks: ValidationMark[] = [];

  for (const issue of validation.issues) {
    if (issue.atomIndex === null) continue;

    const atom = targets[issue.moleculeIndex]?.atoms[issue.atomIndex];
    if (!atom) continue;

    marks.push({ key: issue.key, atom });
  }

  return marks;
}

export function MoleculeEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<MoleculeEditorBridge | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const relayoutBusyRef = useRef(false);

  const [initAttempt, setInitAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [smilesInput, setSmilesInput] = useState('');
  const [activeTool, setActiveTool] = useState<ToolId>('single');
  const [hasContent, setHasContent] = useState(false);
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [zoom, setZoom] = useState(1);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [viewer3DOpen, setViewer3DOpen] = useState(false);
  const [viewer3DSmiles, setViewer3DSmiles] = useState('');
  const [contentRevision, setContentRevision] = useState(0);
  const [engine, setEngine] = useState<EngineState>('loading');
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineAttempt, setEngineAttempt] = useState(0);
  const [validationStatus, setValidationStatus] = useState<ValidationState>('idle');
  const [validation, setValidation] = useState<StructureValidation | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationMarks, setValidationMarks] = useState<ValidationMark[]>([]);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [busyTask, setBusyTask] = useState<'cleanUp' | 'relayout' | null>(null);
  /** Open periodic table request: `apply` writes the element back where it came from. */
  const [elementPick, setElementPick] = useState<{
    apply: (symbol: string) => void;
    current: string | null;
  } | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /** Any duration of 0 or less keeps the toast until it is replaced. */
  const showToast = useCallback((next: ToastState | null, duration = 5200) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast(next);

    if (next && duration > 0) {
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, duration);
    }
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let bridge: MoleculeEditorBridge | null = null;

    setReady(false);
    setInitError(null);

    const initialize = async () => {
      try {
        const K = await waitForKekule();
        if (cancelled || !hostRef.current) return;

        bridge = createEditorBridge(
          K,
          hostRef.current,
          {
            onContentChange: (nextHasContent, revision) => {
              setHasContent(nextHasContent);
              setContentRevision(revision);
            },
            onSelectionChange: setSelection,
            onZoomChange: setZoom,
            onRequestElementPick: (apply, currentSymbol) => {
              setElementPick({ apply, current: currentSymbol });
              return true;
            },
          },
          settingsRef.current,
        );

        bridgeRef.current = bridge;
        bridge.setTool('single');
        setActiveTool('single');
        setHasContent(bridge.hasContent());
        setReady(true);
      } catch (error) {
        if (cancelled) return;

        const message = error instanceof Error ? error.message : String(error);
        setInitError(message);
        console.error('[Kekule] Initialization failed', error);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      bridgeRef.current = null;
      setSelection(null);
      bridge?.destroy();
      if (window.__zephyrleaEditor === bridge) {
        delete window.__zephyrleaEditor;
      }
    };
  }, [initAttempt]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        bridgeRef.current?.handleResize();
      });
    });

    observer.observe(host);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    applyThemeToDocument(settings.theme);
    saveSettings(settings);
    bridgeRef.current?.applySettings(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    setEngine('loading');
    setEngineError(null);

    loadRDKit()
      .then(() => {
        if (!cancelled) setEngine('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[RDKit] Failed to load', error);
        setEngine('error');
        setEngineError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [engineAttempt]);

  useEffect(() => {
    if (!ready) {
      setValidation(null);
      setValidationStatus('idle');
      setValidationMarks([]);
      return;
    }

    const bridge = bridgeRef.current;
    if (!bridge) return;

    if (!hasContent) {
      setValidation(null);
      setValidationError(null);
      setValidationStatus('done');
      setValidationMarks([]);
      return;
    }

    if (engine !== 'ready') {
      setValidationStatus('checking');
      return;
    }

    let cancelled = false;
    setValidationStatus('checking');

    const timer = window.setTimeout(() => {
      const targets = bridge.collectValidationTargets();

      if (targets.length === 0) {
        setValidation(null);
        setValidationError(null);
        setValidationStatus('done');
        setValidationMarks([]);
        return;
      }

      validateStructure(targets)
        .then((result) => {
          if (cancelled) return;

          setValidation(result);
          setValidationError(null);
          setValidationStatus('done');
          setValidationMarks(buildValidationMarks(result, targets));
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.error('[Validation] Check failed', error);
          setValidationError(error instanceof Error ? error.message : String(error));
          setValidationStatus('error');
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ready, hasContent, contentRevision, engine]);

  const structureBlocked = validation?.issues.some((issue) => issue.blocking) ?? false;

  useEffect(() => {
    if (structureBlocked) setPanelCollapsed(false);
  }, [structureBlocked]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;

      const key = event.key.toLowerCase();

      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          bridgeRef.current?.redo();
        } else {
          bridgeRef.current?.undo();
        }
      } else if (key === 'y') {
        event.preventDefault();
        bridgeRef.current?.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectTool = useCallback((tool: ToolId) => {
    const applied = bridgeRef.current?.setTool(tool) ?? false;
    if (applied) {
      setActiveTool(tool);
    }
  }, []);

  const handleSelectElement = useCallback(
    (symbol: string) => {
      handleSelectTool(`element:${symbol}`);
    },
    [handleSelectTool],
  );

  const handleLoadSmiles = useCallback(async () => {
    const value = smilesInput.trim();
    if (!value) {
      showToast({ kind: 'error', title: '请输入 SMILES' });
      return;
    }

    const loaded = (await bridgeRef.current?.importSmiles(value)) ?? false;
    if (loaded) {
      showToast({ kind: 'success', title: 'SMILES 已载入' });
    } else {
      showToast({
        kind: 'error',
        title: '无法解析 SMILES',
        detail: '请检查语法后重试，例如 CC(=O)Oc1ccccc1C(=O)O。',
      });
    }
  }, [showToast, smilesInput]);

  const handleOpenFile = useCallback(
    async (file: File) => {
      const bridge = bridgeRef.current;
      if (!bridge) return;

      const loaded = await bridge.loadFile(file);
      if (loaded) {
        showToast({ kind: 'success', title: `已打开 ${file.name}` });
      } else {
        showToast({ kind: 'error', title: '文件打开失败', detail: file.name });
      }
    },
    [showToast],
  );

  const handleCleanUp = useCallback(async () => {
    if (relayoutBusyRef.current) return;
    relayoutBusyRef.current = true;
    setBusyTask('cleanUp');
    showToast({ kind: 'pending', title: '正在整理视图…' }, 0);

    // Clean Up is synchronous, so give the progress toast a frame to paint.
    await nextPaint();

    try {
      const zoomed = bridgeRef.current?.cleanUp() ?? 0;
      if (zoomed > 0) {
        showToast({ kind: 'success', title: '视图已整理', detail: '结构已排布并缩放到约占画布 75%。' });
      } else {
        showToast({ kind: 'info', title: '画布上还没有结构' });
      }
    } catch (error) {
      console.error('[Clean Up] Failed', error);
      showToast({ kind: 'error', title: '整理视图失败', detail: String(error) });
    } finally {
      relayoutBusyRef.current = false;
      setBusyTask(null);
    }
  }, [showToast]);

  const handleRelayout = useCallback(async () => {
    if (structureBlocked) {
      showToast({ kind: 'error', title: '存在价键错误，无法整理结构', detail: '请先修正红圈标记的原子。' });
      return;
    }

    if (relayoutBusyRef.current) return;
    relayoutBusyRef.current = true;
    setBusyTask('relayout');
    showToast({ kind: 'pending', title: '正在整理结构…' }, 0);

    await nextPaint();

    try {
      const relaidOut = (await bridgeRef.current?.relayout()) ?? 0;
      if (relaidOut > 0) {
        showToast({ kind: 'success', title: '结构已整理', detail: '已重新生成 2D 坐标并规范键长键角。' });
      } else {
        showToast({ kind: 'info', title: '画布上还没有结构' });
      }
    } catch (error) {
      console.error('[Relayout] Failed', error);
      showToast({ kind: 'error', title: '整理结构失败', detail: String(error) });
    } finally {
      relayoutBusyRef.current = false;
      setBusyTask(null);
    }
  }, [showToast, structureBlocked]);

  const handleClear = useCallback(() => {
    bridgeRef.current?.clear();
    bridgeRef.current?.setTool('single');
    setActiveTool('single');
    setSmilesInput('');
  }, []);

  const handleExport = useCallback(() => {
    const smiles = bridgeRef.current?.exportSmiles() ?? '';
    console.log('[Kekule SMILES]', smiles);

    if (!smiles) {
      showToast({ kind: 'error', title: '画布为空', detail: '请先绘制结构或载入 SMILES。' });
      return;
    }

    setSmilesInput(smiles);

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(smiles).catch((error) => {
        console.warn('[Clipboard] Copy failed', error);
      });
    }

    showToast(
      {
        kind: 'success',
        title: 'SMILES 已导出并复制到剪贴板',
        detail: smiles,
      },
      9000,
    );
  }, [showToast]);

  const handleView3D = useCallback(() => {
    if (structureBlocked) {
      showToast({ kind: 'error', title: '存在价键错误，无法生成 3D 视图', detail: '请先修正红圈标记的原子。' });
      return;
    }

    const smiles = bridgeRef.current?.exportSmiles() ?? '';
    if (!smiles) {
      showToast({ kind: 'error', title: '画布为空', detail: '请先绘制结构或载入 SMILES。' });
      return;
    }

    setViewer3DSmiles(smiles);
    setViewer3DOpen(true);
  }, [showToast, structureBlocked]);

  const handleShortcuts = useCallback(() => {
    showToast({
      kind: 'info',
      title: '快捷键',
      detail: 'Ctrl/⌘ + Z 撤销 · Ctrl/⌘ + Shift + Z 重做 · Enter 载入 SMILES',
    });
  }, [showToast]);

  const handleSettingsChange = useCallback((next: AppSettings) => {
    setSettings(next);
  }, []);

  const bottomDocked = settings.toolbarPlacement === 'bottom';

  const renderElementStrip = (placement: 'top' | 'bottom') => (
    <ElementStrip
      ready={ready}
      theme={settings.theme}
      activeTool={activeTool}
      onSelectElement={handleSelectElement}
      onOpenPeriodicTable={() =>
        setElementPick({
          apply: (symbol) => handleSelectElement(symbol),
          current: activeTool?.startsWith('element:') ? activeTool.slice('element:'.length) : null,
        })
      }
      placement={placement}
    />
  );

  const renderTopBar = (placement: 'top' | 'bottom') => (
    <TopBar
      ready={ready}
      zoom={zoom}
      placement={placement}
      blocked={structureBlocked}
      busy={busyTask !== null}
      smiles={smilesInput}
      onSmilesChange={setSmilesInput}
      onSubmitSmiles={() => void handleLoadSmiles()}
      onOpenFile={(file) => void handleOpenFile(file)}
      onUndo={() => bridgeRef.current?.undo()}
      onRedo={() => bridgeRef.current?.redo()}
      onCleanUp={handleCleanUp}
      onRelayout={() => void handleRelayout()}
      onZoomIn={() => bridgeRef.current?.zoomIn()}
      onZoomOut={() => bridgeRef.current?.zoomOut()}
      onResetZoom={() => bridgeRef.current?.resetZoom()}
      onClear={handleClear}
      onExport={handleExport}
      onView3D={handleView3D}
      onShortcuts={handleShortcuts}
      onSettings={() => setSettingsOpen(true)}
    />
  );

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-canvas text-ink antialiased ${
        busyTask ? 'cursor-progress' : ''
      }`}
    >
      <AppHeader onOpenAbout={() => setAboutOpen(true)} />

      {!bottomDocked && renderTopBar('top')}

      <div className={bottomDocked ? 'flex min-h-0 flex-1 flex-col' : 'flex min-h-0 flex-1'}>
        {!bottomDocked && (
          <LeftToolRail ready={ready} activeTool={activeTool} onSelectTool={handleSelectTool} />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!bottomDocked && renderElementStrip('top')}

          <div className="flex min-h-0 flex-1">
            <main className="dot-grid relative min-h-0 flex-1 overflow-hidden">
              <div ref={hostRef} className="kekule-host absolute inset-0" />

              {ready && (
                <SelectionToolbar
                  bridge={bridgeRef.current}
                  selection={selection}
                  bottomInset={bottomDocked ? BOTTOM_CHROME_PX : 0}
                />
              )}

              {ready && <ValidationOverlay bridge={bridgeRef.current} marks={validationMarks} />}

              {!ready && !initError && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center gap-3 text-[13px] text-ink-muted">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-ink/60" />
                    正在加载 Kekule.js…
                  </div>
                </div>
              )}

              {initError && (
                <div className="absolute inset-0 flex items-center justify-center bg-canvas">
                  <div className="max-w-md rounded-xl border border-line bg-panel p-6 text-center shadow-2xl">
                    <AlertTriangle size={22} className="mx-auto text-danger" />
                    <p className="mt-3 text-sm font-medium text-ink">Kekule.js 初始化失败</p>
                    <p className="mt-2 break-words text-xs leading-relaxed text-ink-muted">{initError}</p>
                    <button
                      type="button"
                      onClick={() => setInitAttempt((attempt) => attempt + 1)}
                      className="mt-4 rounded-md border border-line-strong bg-hover px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-hover-strong"
                    >
                      重试
                    </button>
                  </div>
                </div>
              )}

              {ready && !hasContent && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-[13px] font-normal text-ink-muted">
                    <Search size={15} strokeWidth={1.7} />
                    点击开始绘制，粘贴 SMILES，或打开文件
                  </div>
                </div>
              )}
            </main>

            <AnalysisPanel
              collapsed={panelCollapsed}
              onToggle={() => setPanelCollapsed((collapsed) => !collapsed)}
              engine={engine}
              engineError={engineError}
              onReloadEngine={() => setEngineAttempt((attempt) => attempt + 1)}
              status={validationStatus}
              validation={validation}
              error={validationError}
              hasContent={hasContent}
            />
          </div>
        </div>
      </div>

      {bottomDocked && renderElementStrip('bottom')}
      {bottomDocked && (
        <LeftToolRail
          ready={ready}
          activeTool={activeTool}
          onSelectTool={handleSelectTool}
          orientation="horizontal"
        />
      )}
      {bottomDocked && renderTopBar('bottom')}

      {toast && (
        <div
          className="pointer-events-none fixed inset-x-0 z-[100] flex justify-center px-4"
          style={{ bottom: bottomDocked ? BOTTOM_CHROME_PX + 20 : 28 }}
        >
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex max-w-[640px] items-start gap-3 rounded-xl border border-line-strong bg-raised/95 px-4 py-3 shadow-[0_20px_60px_var(--shell-shadow)] backdrop-blur-md"
          >
            <ToastIcon kind={toast.kind} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-5 text-ink">{toast.title}</p>
              {toast.detail && (
                <p className="mt-1 break-all font-mono text-[11.5px] leading-relaxed text-ink-muted">
                  {toast.detail}
                </p>
              )}
            </div>
            {toast.kind !== 'pending' && (
              <button
                type="button"
                onClick={() => showToast(null)}
                aria-label="关闭提示"
                className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover-strong hover:text-ink"
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      )}

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={handleSettingsChange}
        onClose={() => setSettingsOpen(false)}
      />

      <PeriodicTableModal
        open={elementPick !== null}
        theme={settings.theme}
        selectedSymbol={elementPick?.current ?? null}
        onPick={(symbol) => {
          const request = elementPick;
          setElementPick(null);
          request?.apply(symbol);
        }}
        onClose={() => setElementPick(null)}
      />

      <Viewer3DModal
        open={viewer3DOpen}
        smiles={viewer3DSmiles}
        theme={settings.theme}
        modelStyle={settings.model3DStyle}
        onModelStyleChange={(model3DStyle) => setSettings((current) => ({ ...current, model3DStyle }))}
        toolbarAlign={settings.viewer3DToolbarAlign}
        onClose={() => setViewer3DOpen(false)}
      />
    </div>
  );
}
