import {
  BallStickModelIcon,
  SpaceFillModelIcon,
  StickModelIcon,
  WireframeModelIcon,
} from './icons/ChemIcons';
import { MODEL_3D_STYLE_OPTIONS, type Model3DStyle } from '../lib/settings';

const ICONS: Record<Model3DStyle, typeof BallStickModelIcon> = {
  'ball-stick': BallStickModelIcon,
  'space-fill': SpaceFillModelIcon,
  stick: StickModelIcon,
  wireframe: WireframeModelIcon,
};

interface Model3DSwitchProps {
  value: Model3DStyle;
  onChange: (style: Model3DStyle) => void;
  /** Floating over the 3D canvas: panel surface plus a shadow instead of the recessed canvas tone. */
  floating?: boolean;
  className?: string;
}

/**
 * Icon-only picker shared by the settings modal and the 3D viewer: names live in
 * `title` tooltips so the control stays compact in both places.
 */
export function Model3DSwitch({
  value,
  onChange,
  floating = false,
  className = '',
}: Model3DSwitchProps) {
  return (
    <div
      role="radiogroup"
      aria-label="3D 模型样式"
      className={`flex shrink-0 items-center gap-1 rounded-lg border border-line p-1 ${
        floating
          ? 'bg-panel/92 shadow-[0_10px_30px_var(--shell-shadow)] backdrop-blur-md'
          : 'bg-canvas'
      } ${className}`}
    >
      {MODEL_3D_STYLE_OPTIONS.map((option) => {
        const Icon = ICONS[option.value];
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              active
                ? 'bg-pill text-pill-ink shadow-[0_1px_2px_var(--shell-shadow)]'
                : 'text-ink-muted hover:bg-hover hover:text-ink'
            }`}
          >
            <Icon width={15} height={15} />
          </button>
        );
      })}
    </div>
  );
}
