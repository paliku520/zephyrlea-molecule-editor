import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
  size?: 'sm' | 'md';
}

export function IconButton({
  label,
  active = false,
  size = 'md',
  className = '',
  children,
  ...props
}: IconButtonProps) {
  const dimension = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={`inline-flex ${dimension} shrink-0 items-center justify-center rounded-lg border border-transparent transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-35 ${
        active
          ? 'bg-pill text-pill-ink shadow-[0_1px_0_var(--shell-line)]'
          : 'text-ink-soft hover:bg-hover hover:text-ink'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
