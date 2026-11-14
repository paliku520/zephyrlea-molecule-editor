import type { ComponentType, ReactNode, SVGProps } from 'react';

export interface IconRadioOption<T extends string> {
  value: T;
  label: string;
  /** Tooltip text; falls back to `label`. */
  hint?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface IconRadioGroupProps<T extends string> {
  label: string;
  value: T;
  options: IconRadioOption<T>[];
  onChange: (value: T) => void;
}

/** Icon-only radio row; names live in tooltips so the control stays compact. */
export function IconRadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: IconRadioGroupProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.hint ?? option.label}
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

interface IconRadioFrameProps {
  children: ReactNode;
  /** Floating over a canvas: panel surface plus a shadow instead of the recessed tone. */
  floating?: boolean;
  className?: string;
}

/** The bordered container the icon rows sit in. */
export function IconRadioFrame({ children, floating = false, className = '' }: IconRadioFrameProps) {
  return (
    <div
      className={`flex shrink-0 items-center rounded-lg border border-line p-1 ${
        floating
          ? 'bg-panel/92 shadow-[0_10px_30px_var(--shell-shadow)] backdrop-blur-md'
          : 'bg-canvas'
      } ${className}`}
    >
      {children}
    </div>
  );
}
