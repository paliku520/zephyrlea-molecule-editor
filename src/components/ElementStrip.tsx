import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ToolId } from '../lib/editorBridge';

interface ElementStripProps {
  ready: boolean;
  activeTool: ToolId | null;
  onSelectElement: (symbol: string) => void;
}

const PRIMARY_ELEMENTS = [
  { symbol: 'C', color: '#f1f1f3' },
  { symbol: 'H', color: '#d1d1d6' },
  { symbol: 'N', color: '#7d93ff' },
  { symbol: 'O', color: '#ff7676' },
  { symbol: 'S', color: '#e6c84a' },
  { symbol: 'P', color: '#f4a34a' },
  { symbol: 'F', color: '#7bd6a0' },
  { symbol: 'Cl', color: '#4fd1a1' },
  { symbol: 'Br', color: '#cf8b6a' },
  { symbol: 'I', color: '#a78bfa' },
];

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

export function ElementStrip({ ready, activeTool, onSelectElement }: ElementStripProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapperRef = useRef<HTMLDivElement>(null);

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
    <div className="relative z-20 flex h-[52px] shrink-0 items-center gap-1 border-b border-white/[0.08] bg-[#262626] px-6">
      {PRIMARY_ELEMENTS.map(({ symbol, color }) => {
        const isActive = activeTool === `element:${symbol}`;

        return (
          <button
            key={symbol}
            type="button"
            disabled={!ready}
            onClick={() => onSelectElement(symbol)}
            title={`插入 ${symbol} 原子`}
            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[13px] font-semibold tracking-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-40 ${
              isActive ? 'bg-white/[0.11] ring-1 ring-white/[0.16]' : 'hover:bg-white/[0.06]'
            }`}
            style={{ color }}
          >
            {symbol}
          </button>
        );
      })}

      <div className="mx-2 h-5 w-px bg-white/[0.09]" />

      <div ref={moreWrapperRef} className="relative">
        <button
          type="button"
          disabled={!ready}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.14] px-3 text-[12px] font-medium text-[#c8c8cd] transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-40"
        >
          其他
          <ChevronDown size={12} strokeWidth={2} className={moreOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>

        {moreOpen && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[276px] rounded-lg border border-white/[0.12] bg-[#2e2e30] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
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
                    className={`h-8 rounded-md text-[12.5px] font-semibold text-[#d7d7dc] transition-colors ${
                      isActive ? 'bg-white/[0.11] text-white' : 'hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    {symbol}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
