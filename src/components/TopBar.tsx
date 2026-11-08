import { useRef } from 'react';
import { Box, Download, FileUp, Keyboard, Redo2, Scan, Settings, Trash2, Undo2, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from './ui/IconButton';

interface TopBarProps {
  ready: boolean;
  smiles: string;
  onSmilesChange: (value: string) => void;
  onSubmitSmiles: () => void;
  onOpenFile: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCleanUp: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onClear: () => void;
  onExport: () => void;
  onView3D: () => void;
  onShortcuts: () => void;
  onSettings: () => void;
}

export function TopBar({
  ready,
  smiles,
  onSmilesChange,
  onSubmitSmiles,
  onOpenFile,
  onUndo,
  onRedo,
  onCleanUp,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onClear,
  onExport,
  onView3D,
  onShortcuts,
  onSettings,
}: TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex h-[56px] shrink-0 items-center gap-1 border-b border-line bg-panel px-3">
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
          disabled={!ready}
          title="整理结构 (Clean Up)"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <Wand2 size={16} strokeWidth={1.7} />
          <span className="hidden xl:inline">整理</span>
        </button>

        <IconButton label="放大" onClick={onZoomIn} disabled={!ready}>
          <ZoomIn size={17} strokeWidth={1.7} />
        </IconButton>
        <IconButton label="缩小" onClick={onZoomOut} disabled={!ready}>
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
        <button
          type="button"
          onClick={onExport}
          disabled={!ready}
          className="inline-flex h-9 items-center gap-2.5 rounded-lg bg-accent px-[18px] text-[13px] font-semibold text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.3)] transition-colors hover:bg-accent-strong active:bg-accent-deep disabled:pointer-events-none disabled:opacity-40"
        >
          <Download size={16} strokeWidth={2} />
          <span>导出</span>
        </button>

        <button
          type="button"
          onClick={onView3D}
          disabled={!ready}
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
