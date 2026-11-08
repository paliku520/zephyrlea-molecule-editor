import { useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, Download, FileText, FileUp, Image as ImageIcon, Keyboard, LayoutGrid, Redo2, Scan, Settings, Spline, Trash2, Undo2, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { MAX_ZOOM, MIN_ZOOM } from '../lib/editorBoard';

type ExportFormat = 'png' | 'svg';

interface TopBarProps {
  ready: boolean;
  zoom: number;
  /** False when nothing is drawn, which disables the export menu. */
  hasContent?: boolean;
  /** True when RDKit reports a blocking chemistry problem (e.g. valence error). */
  blocked?: boolean;
  /** True while Clean Up / Relayout is running, so both cannot be queued twice. */
  busy?: boolean;
  /** `bottom` docks the bar along the bottom edge (border on top). */
  placement?: 'top' | 'bottom';
  smiles: string;
  onSmilesChange: (value: string) => void;
  onSubmitSmiles: () => void;
  onOpenFile: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCleanUp: () => void;
  onRelayout: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onClear: () => void;
  onExportSmiles: () => void;
  onExportImage: (format: ExportFormat) => void;
  onView3D: () => void;
  onShortcuts: () => void;
  onSettings: () => void;
}

interface ExportMenuItemProps {
  icon: typeof FileText;
  title: string;
  hint: string;
  onSelect: () => void;
}

function ExportMenuItem({ icon: Icon, title, hint, onSelect }: ExportMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <Icon size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-muted" />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-ink">{title}</span>
        <span className="block text-[10.5px] text-ink-faint">{hint}</span>
      </span>
    </button>
  );
}

export function TopBar({
  ready,
  zoom,
  hasContent = true,
  blocked = false,
  busy = false,
  placement = 'top',
  smiles,
  onSmilesChange,
  onSubmitSmiles,
  onOpenFile,
  onUndo,
  onRedo,
  onCleanUp,
  onRelayout,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onClear,
  onExportSmiles,
  onExportImage,
  onView3D,
  onShortcuts,
  onSettings,
}: TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const atMinZoom = zoom <= MIN_ZOOM + 1e-3;
  const atMaxZoom = zoom >= MAX_ZOOM - 1e-3;
  const borderClass = placement === 'bottom' ? 'border-t' : 'border-b';

  useEffect(() => {
    if (!exportOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportOpen]);

  // Clearing the board or a re-init makes the menu stale.
  useEffect(() => {
    if (!ready || !hasContent) setExportOpen(false);
  }, [ready, hasContent]);

  const selectExport = (action: () => void) => {
    setExportOpen(false);
    action();
  };

  return (
    <header
      className={`flex h-[56px] shrink-0 items-center gap-1 ${borderClass} border-line bg-panel px-3`}
    >
      <div className="flex items-center gap-0.5">
        <IconButton label="撤销 (Ctrl+Z)" onClick={onUndo} disabled={!ready}>
          <Undo2 size={17} strokeWidth={1.7} />
        </IconButton>
        <IconButton label="重做 (Ctrl+Shift+Z)" onClick={onRedo} disabled={!ready}>
          <Redo2 size={17} strokeWidth={1.7} />
        </IconButton>
      </div>

      <div className="mx-1.5 h-6 w-px bg-line" />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={!ready}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
      >
        <FileUp size={16} strokeWidth={1.7} />
        <span>打开</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".mol,.sdf,.smi,.smiles,.cml,.kcf,.kcj,.json,.rxn"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onOpenFile(file);
          event.target.value = '';
        }}
      />

      <form
        className="ml-1 flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitSmiles();
        }}
      >
        <input
          value={smiles}
          onChange={(event) => onSmilesChange(event.target.value)}
          disabled={!ready}
          spellCheck={false}
          autoComplete="off"
          placeholder="粘贴 SMILES，例如 CC(=O)Oc1ccccc1C(=O)O"
          aria-label="SMILES 输入"
          className="h-9 w-full min-w-0 max-w-[560px] rounded-md border border-line-strong bg-canvas px-3 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/70 focus:ring-1 focus:ring-accent/25 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!ready || smiles.trim().length === 0}
          className="h-9 shrink-0 rounded-md border border-line-strong bg-hover px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-hover-strong disabled:pointer-events-none disabled:opacity-40"
        >
          载入
        </button>
      </form>

      <div className="ml-1 flex items-center gap-0.5">
        <button
          type="button"
          onClick={onCleanUp}
          disabled={!ready || busy}
          title="整理视图：把零散结构排成整齐的行，并缩放到约占画布 75%（不改动结构本身）"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <Wand2 size={16} strokeWidth={1.7} />
          <span className="hidden xl:inline">整理视图</span>
        </button>

        <button
          type="button"
          onClick={onRelayout}
          disabled={!ready || blocked || busy}
          title={
            blocked
              ? '存在价键错误，无法整理结构'
              : '整理结构：重新生成 2D 坐标，规范键长与键角（不改变排布与缩放）'
          }
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <LayoutGrid size={16} strokeWidth={1.7} />
          <span className="hidden xl:inline">整理结构</span>
        </button>

        <IconButton label="放大" onClick={onZoomIn} disabled={!ready || atMaxZoom}>
          <ZoomIn size={17} strokeWidth={1.7} />
        </IconButton>
        <IconButton label="缩小" onClick={onZoomOut} disabled={!ready || atMinZoom}>
          <ZoomOut size={17} strokeWidth={1.7} />
        </IconButton>
        <IconButton label="适应画布 / 重置缩放" onClick={onResetZoom} disabled={!ready}>
          <Scan size={16} strokeWidth={1.7} />
        </IconButton>
        <IconButton label="清空画布" onClick={onClear} disabled={!ready}>
          <Trash2 size={16} strokeWidth={1.7} />
        </IconButton>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
        <div ref={exportMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setExportOpen((open) => !open)}
            disabled={!ready || !hasContent}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            title={hasContent ? '导出 SMILES 文本或分子图片' : '画布为空，暂无可导出的内容'}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.3)] transition-colors hover:bg-accent-strong active:bg-accent-deep disabled:pointer-events-none disabled:opacity-40"
          >
            <Download size={16} strokeWidth={2} />
            <span>导出</span>
            <ChevronDown
              size={14}
              strokeWidth={2.2}
              className={exportOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </button>

          {exportOpen && (
            <div
              role="menu"
              aria-label="导出格式"
              className={`absolute right-0 z-30 w-[236px] rounded-xl border border-line-strong bg-popover p-1 shadow-[0_18px_48px_var(--shell-shadow)] ${
                placement === 'bottom' ? 'bottom-full mb-2' : 'top-full mt-2'
              }`}
            >
              <ExportMenuItem
                icon={FileText}
                title="SMILES 文本"
                hint="复制到剪贴板"
                onSelect={() => selectExport(onExportSmiles)}
              />
              <ExportMenuItem
                icon={ImageIcon}
                title="PNG 图片"
                hint="2× 高清位图，透明背景"
                onSelect={() => selectExport(() => onExportImage('png'))}
              />
              <ExportMenuItem
                icon={Spline}
                title="SVG 矢量图"
                hint="透明背景，无限放大不失真"
                onSelect={() => selectExport(() => onExportImage('svg'))}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onView3D}
          disabled={!ready || blocked}
          title={blocked ? '存在价键错误，无法生成 3D 视图' : '在 3D 中查看'}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <Box size={16} strokeWidth={1.7} />
          <span className="hidden xl:inline">在 3D 中查看</span>
        </button>

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

        <IconButton label="设置" onClick={onSettings}>
          <Settings size={17} strokeWidth={1.6} />
        </IconButton>
        <IconButton label="快捷键" onClick={onShortcuts} disabled={!ready} className="text-ink-muted">
          <Keyboard size={17} strokeWidth={1.6} />
        </IconButton>
      </div>
    </header>
  );
}
