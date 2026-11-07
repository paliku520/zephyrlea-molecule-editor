import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, Search, X } from 'lucide-react';
import { TopBar } from './TopBar';
import { LeftToolRail } from './LeftToolRail';
import { ElementStrip } from './ElementStrip';
import { waitForKekule } from '../lib/kekule';
import {
  createEditorBridge,
  type MoleculeEditorBridge,
  type ToolId,
} from '../lib/editorBridge';

interface ToastState {
  kind: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

function ToastIcon({ kind }: { kind: ToastState['kind'] }) {
  if (kind === 'success') {
    return <Check size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-accent" />;
  }

  if (kind === 'error') {
    return <AlertTriangle size={16} strokeWidth={1.9} className="mt-0.5 shrink-0 text-[#f07171]" />;
  }

  return <Info size={16} strokeWidth={1.9} className="mt-0.5 shrink-0 text-[#9ca3af]" />;
}

export function MoleculeEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<MoleculeEditorBridge | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [initAttempt, setInitAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [smilesInput, setSmilesInput] = useState('');
  const [activeTool, setActiveTool] = useState<ToolId>('single');
  const [hasContent, setHasContent] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((next: ToastState | null, duration = 5200) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast(next);

    if (next) {
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

        bridge = createEditorBridge(K, hostRef.current, {
          onContentChange: (nextHasContent) => setHasContent(nextHasContent),
        });

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
    const cleaned = (await bridgeRef.current?.cleanUp()) ?? 0;
    if (cleaned > 0) {
      showToast({ kind: 'success', title: '结构已整理' });
    } else {
      showToast({ kind: 'info', title: '画布上还没有结构' });
    }
  }, [showToast]);

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
    const smiles = bridgeRef.current?.exportSmiles() ?? '';
    console.log('[3D preview] Not implemented yet. Current SMILES:', smiles);
    showToast({
      kind: 'info',
      title: '3D 视图即将推出',
      detail: '当前阶段仅输出 SMILES，3D 渲染逻辑留待下一步接入。',
    });
  }, [showToast]);

  const handleShortcuts = useCallback(() => {
    showToast({
      kind: 'info',
      title: '快捷键',
      detail: 'Ctrl/⌘ + Z 撤销 · Ctrl/⌘ + Shift + Z 重做 · Enter 载入 SMILES',
    });
  }, [showToast]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#171717] text-[#e7e7e9] antialiased">
      <TopBar
        ready={ready}
        smiles={smilesInput}
        onSmilesChange={setSmilesInput}
        onSubmitSmiles={() => void handleLoadSmiles()}
        onOpenFile={(file) => void handleOpenFile(file)}
        onUndo={() => bridgeRef.current?.undo()}
        onRedo={() => bridgeRef.current?.redo()}
        onCleanUp={() => void handleCleanUp()}
        onZoomIn={() => bridgeRef.current?.zoomIn()}
        onZoomOut={() => bridgeRef.current?.zoomOut()}
        onResetZoom={() => bridgeRef.current?.resetZoom()}
        onClear={handleClear}
        onExport={handleExport}
        onView3D={handleView3D}
        onShortcuts={handleShortcuts}
      />

      <div className="flex min-h-0 flex-1">
        <LeftToolRail ready={ready} activeTool={activeTool} onSelectTool={handleSelectTool} />

        <div className="flex min-w-0 flex-1 flex-col">
          <ElementStrip
            ready={ready}
            activeTool={activeTool}
            onSelectElement={handleSelectElement}
          />

          <main className="dot-grid relative min-h-0 flex-1 overflow-hidden">
            <div ref={hostRef} className="kekule-host absolute inset-0" />

            {!ready && !initError && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-3 text-[13px] text-[#8f8f96]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/60" />
                  正在加载 Kekule.js…
                </div>
              </div>
            )}

            {initError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#171717]">
                <div className="max-w-md rounded-xl border border-white/[0.1] bg-[#262626] p-6 text-center shadow-2xl">
                  <AlertTriangle size={22} className="mx-auto text-[#f07171]" />
                  <p className="mt-3 text-sm font-medium text-white">Kekule.js 初始化失败</p>
                  <p className="mt-2 break-words text-xs leading-relaxed text-[#98989f]">{initError}</p>
                  <button
                    type="button"
                    onClick={() => setInitAttempt((attempt) => attempt + 1)}
                    className="mt-4 rounded-md border border-white/[0.14] bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.1]"
                  >
                    重试
                  </button>
                </div>
              </div>
            )}

            {ready && !hasContent && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 text-[13px] font-normal text-[#7b8794]">
                  <Search size={15} strokeWidth={1.7} />
                  点击开始绘制，粘贴 SMILES，或打开文件
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-7 z-[100] flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-[640px] items-start gap-3 rounded-xl border border-white/[0.11] bg-[#2a2a2c]/95 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur-md">
            <ToastIcon kind={toast.kind} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-5 text-[#f1f1f3]">{toast.title}</p>
              {toast.detail && (
                <p className="mt-1 break-all font-mono text-[11.5px] leading-relaxed text-[#a2a2a9]">
                  {toast.detail}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => showToast(null)}
              aria-label="关闭提示"
              className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#8c8c93] transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
