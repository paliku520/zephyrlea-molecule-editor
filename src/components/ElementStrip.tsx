import { useEffect, useRef, useState } from 'react';
import { ChevronDown, TableProperties } from 'lucide-react';
import type { ToolId } from '../lib/editorBridge';
import { getDefaultElementColor, getElementColors } from '../lib/elementColors';
import type { ThemeMode } from '../lib/settings';

interface ElementStripProps {
  ready: boolean;
  theme: ThemeMode;
  activeTool: ToolId | null;
  onSelectElement: (symbol: string) => void;
  /** Open the full periodic table picker. */
  onOpenPeriodicTable: () => void;
  /** `bottom` docks the strip along the bottom edge; its menu opens upwards. */
  placement?: 'top' | 'bottom';
}

const PRIMARY_ELEMENT_SYMBOLS = ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I'];

const MORE_ELEMENTS = [
  'B',
  'Si',
  'Se',
  'Li',
  'Na',
  'K',
  'Mg',
  'Ca',
  'Al',
  'Zn',
  'Fe',
  'Cu',
  'Ag',
  'Au',
  'Pt',
  'Hg',
  'Pb',
  'Sn',
  'Ti',
  'Cr',
  'Mn',
  'Co',
  'Ni',
  'As',
  'Te',
];

export function ElementStrip({
  ready,
  theme,
  activeTool,
  onSelectElement,
  onOpenPeriodicTable,
  placement = 'top',
}: ElementStripProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapperRef = useRef<HTMLDivElement>(null);
  const docked = placement === 'bottom';

  const elementColors = getElementColors(theme);
  const defaultColor = getDefaultElementColor(theme);
  const primaryElements = PRIMARY_ELEMENT_SYMBOLS.map((symbol) => ({
    symbol,
    color: elementColors[symbol] ?? defaultColor,
  }));

  useEffect(() => {
    if (!moreOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!moreWrapperRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [moreOpen]);

  return (
    <div
      className={`relative z-20 flex h-[52px] shrink-0 items-center gap-1 ${
        docked ? 'border-t' : 'border-b'
      } border-line bg-panel px-6`}
    >
      {primaryElements.map(({ symbol, color }) => {
        const isActive = activeTool === `element:${symbol}`;

        return (
          <button
            key={symbol}
            type="button"
            disabled={!ready}
            onClick={() => onSelectElement(symbol)}
            title={`插入 ${symbol} 原子`}
            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[13px] font-semibold tracking-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-40 ${
              isActive ? 'bg-hover-strong ring-1 ring-line-strong' : 'hover:bg-hover'
            }`}
            style={{ color }}
          >
            {symbol}
          </button>
        );
      })}

      <div className="mx-2 h-5 w-px bg-line" />

      <div ref={moreWrapperRef} className="relative">
        <button
          type="button"
          disabled={!ready}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[12px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          其他
          <ChevronDown size={12} strokeWidth={2} className={moreOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>

        {moreOpen && (
          <div
            className={`absolute left-0 z-50 w-[276px] rounded-lg border border-line-strong bg-popover p-2 shadow-[0_18px_50px_var(--shell-shadow)] ${
              docked ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]'
            }`}
          >
            <div className="grid grid-cols-5 gap-1">
              {MORE_ELEMENTS.map((symbol) => {
                const isActive = activeTool === `element:${symbol}`;

                return (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => {
                      onSelectElement(symbol);
                      setMoreOpen(false);
                    }}
                    className={`h-8 rounded-md text-[12.5px] font-semibold text-ink-soft transition-colors ${
                      isActive ? 'bg-hover-strong text-ink' : 'hover:bg-hover hover:text-ink'
                    }`}
                  >
                    {symbol}
                  </button>
                );
              })}
            </div>

            <div className="mt-1.5 border-t border-line pt-1.5">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenPeriodicTable();
                }}
                title="打开元素周期表选择元素"
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[12px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
              >
                <TableProperties size={13} strokeWidth={1.8} />
                元素周期表…
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
