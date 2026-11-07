import { useRef } from 'react';
import {
  Box,
  Download,
  FileUp,
  Keyboard,
  Redo2,
  Scan,
  Trash2,
  Undo2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
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
}: TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex h-[56px] shrink-0 items-center gap-1 border-b border-white/[0.08] bg-[#262626] px-3">
      <div className="flex items-center gap-0.5">
        <IconButton label="撤销 (Ctrl+Z)" onClick={onUndo} disabled={!ready}>
          <Undo2 size={17} strokeWidth={1.7} />
        </IconButton>
        <IconButton label="重做 (Ctrl+Shift+Z)" onClick={onRedo} disabled={!ready}>
          <Redo2 size={17} strokeWidth={1.7} />
        </IconButton>
      </div>

      <div className="mx-1.5 h-6 w-px bg-white/[0.1]" />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={!ready}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-[#d4d4d8] transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-40"
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
          className="h-9 w-full min-w-0 max-w-[560px] rounded-md border border-white/[0.13] bg-[#171717] px-3 text-[12.5px] text-[#e8e8ea] outline-none transition-colors placeholder:text-[#707077] focus:border-[#94a82a]/70 focus:ring-1 focus:ring-[#94a82a]/25 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!ready || smiles.trim().length === 0}
          className="h-9 shrink-0 rounded-md border border-white/[0.18] bg-white/[0.06] px-3 text-[12.5px] font-medium text-[#dedee2] transition-colors hover:bg-white/[0.1] disabled:pointer-events-none disabled:opacity-40"
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
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-[#d0d0d4] transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-40"
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
          className="inline-flex h-9 items-center gap-2.5 rounded-lg bg-[#758815] px-[18px] text-[13px] font-semibold text-[#14170a] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(0,0,0,0.3)] transition-colors hover:bg-[#84981b] active:bg-[#6b7c12] disabled:pointer-events-none disabled:opacity-40"
        >
          <Download size={16} strokeWidth={2} />
          <span>导出</span>
        </button>

        <button
          type="button"
          onClick={onView3D}
          disabled={!ready}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[#d0d0d4] transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-40"
        >
          <Box size={16} strokeWidth={1.7} />
          <span className="hidden xl:inline">在 3D 中查看</span>
        </button>

        <span className="mx-1 hidden h-6 w-px bg-white/[0.1] sm:block" />

        <IconButton label="快捷键" onClick={onShortcuts} disabled={!ready} className="text-[#8b8b92]">
          <Keyboard size={17} strokeWidth={1.6} />
        </IconButton>
      </div>
    </header>
  );
}
