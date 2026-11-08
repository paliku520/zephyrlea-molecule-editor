import { useEffect, useRef, type ReactNode } from 'react';
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import type { MoleculeEditorBridge, SelectionSnapshot } from '../lib/editorBridge';

const ROTATE_STEP = Math.PI / 12;

interface SelectionToolbarProps {
  bridge: MoleculeEditorBridge | null;
  selection: SelectionSnapshot | null;
}

export function SelectionToolbar({ bridge, selection }: SelectionToolbarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bridge || !selection) return;

    let frame = 0;
    const place = () => {
      const bar = barRef.current;
      const snapshot = bridge.readSelection();

      if (bar && snapshot) {
        const width = bar.offsetWidth;
        const height = bar.offsetHeight;
        const { left, top, width: boxWidth, height: boxHeight } = snapshot.box;

        const maxLeft = Math.max(window.innerWidth - width - 12, 12);
        const nextLeft = Math.min(Math.max(left + boxWidth / 2 - width / 2, 12), maxLeft);

        const above = top - height - 12;
        const nextTop =
          above >= 12 ? above : Math.min(top + boxHeight + 12, window.innerHeight - height - 12);

        bar.style.left = `${nextLeft}px`;
        bar.style.top = `${Math.max(nextTop, 12)}px`;
        bar.style.visibility = 'visible';
      }

      frame = window.requestAnimationFrame(place);
    };

    frame = window.requestAnimationFrame(place);
    return () => window.cancelAnimationFrame(frame);
  }, [bridge, selection]);

  if (!selection) return null;

  const label =
    selection.bondCount > 0 && selection.atomCount === 0
      ? `${selection.bondCount} 个键`
      : selection.atomCount === selection.count
        ? `${selection.atomCount} 个原子`
        : `${selection.atomCount} 个原子 · ${selection.bondCount} 个键`;
  const canTransform = selection.transformable;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="选中结构操作"
      style={{ visibility: 'hidden' }}
      className="fixed left-0 top-0 z-40 flex items-center gap-0.5 rounded-xl border border-line-strong bg-raised/95 px-1.5 py-1 shadow-[0_14px_40px_var(--shell-shadow)] backdrop-blur-md"
    >
      <span className="max-w-[132px] truncate px-1.5 text-[11.5px] font-medium text-ink-muted">
        {label}
      </span>
      <span className="mx-1 h-4 w-px bg-line-strong" />
      <SelectionButton
        label="逆时针旋转 15°"
        disabled={!canTransform}
        onClick={() => bridge?.rotateSelection(-ROTATE_STEP)}
      >
        <RotateCcw size={15} strokeWidth={1.8} />
      </SelectionButton>
      <SelectionButton
        label="顺时针旋转 15°"
        disabled={!canTransform}
        onClick={() => bridge?.rotateSelection(ROTATE_STEP)}
      >
        <RotateCw size={15} strokeWidth={1.8} />
      </SelectionButton>
      <SelectionButton
        label="水平镜像"
        disabled={!canTransform}
        onClick={() => bridge?.mirrorSelection('horizontal')}
      >
        <FlipHorizontal2 size={15} strokeWidth={1.8} />
      </SelectionButton>
      <SelectionButton
        label="垂直镜像"
        disabled={!canTransform}
        onClick={() => bridge?.mirrorSelection('vertical')}
      >
        <FlipVertical2 size={15} strokeWidth={1.8} />
      </SelectionButton>
      <SelectionButton label="删除选中对象" onClick={() => bridge?.deleteSelection()}>
        <Trash2 size={15} strokeWidth={1.8} />
      </SelectionButton>
    </div>
  );
}

interface SelectionButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function SelectionButton({ label, disabled = false, onClick, children }: SelectionButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors duration-150 hover:bg-hover-strong hover:text-ink disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
