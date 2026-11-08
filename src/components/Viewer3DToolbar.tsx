import { Focus, Maximize2, Minimize2, Move, Rotate3d } from 'lucide-react';
import { IconRadioGroup, type IconRadioOption } from './ui/IconRadioGroup';
import { MODEL_3D_STYLE_CHOICES } from './Model3DSwitch';
import {
  VIEWER_3D_DRAG_OPTIONS,
  type Model3DStyle,
  type Viewer3DDragMode,
} from '../lib/settings';

interface Viewer3DToolbarProps {
  modelStyle: Model3DStyle;
  onModelStyleChange: (style: Model3DStyle) => void;
  dragMode: Viewer3DDragMode;
  onDragModeChange: (mode: Viewer3DDragMode) => void;
  onResetView: () => void;
  maximized: boolean;
  onToggleMaximized: () => void;
  /** Reset is only meaningful once the conformer is on screen. */
  ready: boolean;
}

const ACTION_BUTTON =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40';

const DRAG_ICONS: Record<Viewer3DDragMode, typeof Rotate3d> = {
  rotate: Rotate3d,
  pan: Move,
};

/** Rotate the structures, or move the camera past them. */
export const VIEWER_3D_DRAG_CHOICES: IconRadioOption<Viewer3DDragMode>[] =
  VIEWER_3D_DRAG_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    hint: option.hint,
    icon: DRAG_ICONS[option.value],
  }));

/** Single docked pill: model style, drag mode, divider, reset view, maximize. */
export function Viewer3DToolbar({
  modelStyle,
  onModelStyleChange,
  dragMode,
  onDragModeChange,
  onResetView,
  maximized,
  onToggleMaximized,
  ready,
}: Viewer3DToolbarProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-line bg-panel/92 p-1 shadow-[0_10px_30px_var(--shell-shadow)] backdrop-blur-md">
      <IconRadioGroup
        label="3D 模型样式"
        value={modelStyle}
        options={MODEL_3D_STYLE_CHOICES}
        onChange={onModelStyleChange}
      />

      <span className="mx-0.5 h-5 w-px bg-line" />

      <IconRadioGroup
        label="拖拽方式"
        value={dragMode}
        options={VIEWER_3D_DRAG_CHOICES}
        onChange={onDragModeChange}
      />

      <span className="mx-0.5 h-5 w-px bg-line" />

      <button
        type="button"
        onClick={onResetView}
        disabled={!ready}
        aria-label="重置视图"
        title="重置视图"
        className={ACTION_BUTTON}
      >
        <Focus size={15} strokeWidth={1.9} />
      </button>

      <button
        type="button"
        onClick={onToggleMaximized}
        aria-label={maximized ? '还原窗口' : '最大化窗口'}
        title={maximized ? '还原窗口 (Esc)' : '最大化窗口'}
        className={ACTION_BUTTON}
      >
        {maximized ? (
          <Minimize2 size={15} strokeWidth={1.9} />
        ) : (
          <Maximize2 size={15} strokeWidth={1.9} />
        )}
      </button>
    </div>
  );
}
