import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { desktopBridge } from '../lib/desktop';

/**
 * The desktop shell runs without a native frame (Windows / Linux), so this row
 * of self-drawn buttons replaces the system minimize / maximize / close.
 * macOS keeps its traffic lights, hence `showControls` is false there.
 */
export interface WindowChrome {
  /** True inside Electron, where the page has to draw its own window chrome. */
  isDesktop: boolean;
  /** True on macOS, where the header must stay clear of the traffic lights. */
  isMac: boolean;
  showControls: boolean;
}

export function useWindowChrome(): WindowChrome {
  const bridge = desktopBridge();
  const isDesktop = bridge !== null;
  const isMac = bridge?.platform === 'darwin';

  return { isDesktop, isMac, showControls: isDesktop && !isMac };
}

/** Tracks the real window state, including changes we did not initiate (snap, taskbar). */
function useWindowMaximized(): boolean {
  const bridge = desktopBridge();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!bridge) return;

    let active = true;
    const unsubscribe = bridge.window.onMaximizeChange(setMaximized);

    void bridge.window
      .isMaximized()
      .then((value) => {
        if (active) setMaximized(value);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  return maximized;
}

/** Windows 10/11 draws these glyphs in a 10×10 box with hairline strokes. */
const GLYPH_SIZE = 10;

function MinimizeGlyph() {
  return (
    <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function MaximizeGlyph() {
  return (
    <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreGlyph() {
  return (
    <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M6.5 3.5V0.5H0.5v6h3" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="3.5" y="3.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

interface ControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  danger?: boolean;
  children: ReactNode;
}

function ControlButton({ label, danger = false, className, children, ...props }: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-full w-[46px] items-center justify-center outline-none transition-colors duration-100 focus-visible:shadow-[inset_0_0_0_2px_var(--shell-accent)] ${
        danger
          ? 'text-ink-muted hover:bg-[#c42b1c] hover:text-white active:bg-[#b3261a]'
          : 'text-ink-muted hover:bg-hover-strong hover:text-ink active:bg-hover'
      } ${className ?? ''}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Self-drawn window buttons; renders nothing in a browser or on macOS. */
export function WindowControls() {
  const { showControls } = useWindowChrome();
  const bridge = desktopBridge();
  const maximized = useWindowMaximized();

  if (!bridge || !showControls) return null;

  return (
    <div className="window-no-drag flex h-full shrink-0 items-stretch">
      <ControlButton
        label="最小化"
        data-window-control="minimize"
        onClick={() => void bridge.window.minimize()}
      >
        <MinimizeGlyph />
      </ControlButton>

      <ControlButton
        label={maximized ? '向下还原' : '最大化'}
        data-window-control="maximize"
        onClick={() => void bridge.window.toggleMaximize()}
      >
        {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
      </ControlButton>

      <ControlButton
        label="关闭"
        danger
        data-window-control="close"
        onClick={() => void bridge.window.close()}
      >
        <CloseGlyph />
      </ControlButton>
    </div>
  );
}
