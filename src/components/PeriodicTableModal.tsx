import { useEffect } from 'react';
import { X } from 'lucide-react';
import { getDefaultElementColor, getElementColors } from '../lib/elementColors';
import {
  PERIODIC_COLUMNS,
  PERIODIC_TABLE,
  type PeriodicCell,
} from '../lib/periodicTable';
import type { ThemeMode } from '../lib/settings';

interface PeriodicTableModalProps {
  open: boolean;
  theme: ThemeMode;
  /** Element to highlight, e.g. the atom that is being replaced. */
  selectedSymbol?: string | null;
  onPick: (symbol: string) => void;
  onClose: () => void;
}

interface CellProps {
  cell: PeriodicCell;
  color: string;
  selected: boolean;
  onPick: (symbol: string) => void;
}

function ElementCell({ cell, color, selected, onPick }: CellProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(cell.symbol)}
      title={`${cell.symbol} · 原子序数 ${cell.atomicNumber}`}
      aria-label={`${cell.symbol}，原子序数 ${cell.atomicNumber}`}
      className={`relative flex h-9 w-full items-center justify-center rounded-[5px] border text-[12.5px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        selected
          ? 'border-accent/70 bg-accent/15'
          : 'border-line/60 bg-canvas hover:border-line-strong hover:bg-hover'
      }`}
      style={{ color }}
    >
      <span className="absolute left-1 top-[2px] text-[8.5px] font-normal tabular-nums text-ink-faint">
        {cell.atomicNumber}
      </span>
      {cell.symbol}
    </button>
  );
}

const GRID_STYLE = { gridTemplateColumns: `repeat(${PERIODIC_COLUMNS}, minmax(0, 1fr))` };

/** Every cell is pinned to row 1 so the f-block markers stay beside their row. */
const cellStyle = (column: number) => ({ gridRow: 1, gridColumn: column });

type RowItem =
  | { kind: 'cell'; column: number; cell: PeriodicCell }
  | { kind: 'marker'; column: number; label: string };

export function PeriodicTableModal({
  open,
  theme,
  selectedSymbol = null,
  onPick,
  onClose,
}: PeriodicTableModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const colors = getElementColors(theme);
  const fallback = getDefaultElementColor(theme);
  const colorOf = (symbol: string) => colors[symbol] ?? fallback;

  return (
    <div className="fixed inset-0 z-[40000] flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-[var(--shell-scrim)] backdrop-blur-[2px]"
        onPointerDown={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="periodic-table-title"
        className="relative flex w-full max-w-[628px] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_28px_80px_var(--shell-shadow)]"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-baseline gap-3">
            <h2 id="periodic-table-title" className="text-[14px] font-semibold text-ink">
              元素周期表
            </h2>
            <span className="text-[11.5px] text-ink-muted">点击元素插入或替换当前原子</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭元素周期表"
            title="关闭元素周期表"
            className="-mr-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 px-4 py-3.5">
          {PERIODIC_TABLE.rows.map((row, index) => {
            const items: RowItem[] = [
              ...row.cells.map<RowItem>((cell) => ({ kind: 'cell', column: cell.column, cell })),
              ...row.markers.map<RowItem>((marker) => ({
                kind: 'marker',
                column: marker.column,
                label: marker.label,
              })),
            ].sort((a, b) => a.column - b.column);

            return (
              <div key={`row-${index}`} className="grid gap-[3px]" style={GRID_STYLE}>
                {items.map((item) =>
                  item.kind === 'cell' ? (
                    <div key={item.cell.atomicNumber} style={cellStyle(item.column)}>
                      <ElementCell
                        cell={item.cell}
                        color={colorOf(item.cell.symbol)}
                        selected={item.cell.symbol === selectedSymbol}
                        onPick={onPick}
                      />
                    </div>
                  ) : (
                    <div key={item.label} style={cellStyle(item.column)}>
                      <div className="flex h-9 w-full items-center justify-center rounded-[5px] border border-dashed border-line/70 text-[9px] text-ink-faint">
                        {item.label}
                      </div>
                    </div>
                  ),
                )}
              </div>
            );
          })}

          <div className="mt-1 flex flex-col gap-[3px]">
            {PERIODIC_TABLE.fBlock.map((row) => (
              <div key={row.label} className="grid gap-[3px]" style={GRID_STYLE}>
                <div
                  className="flex items-center justify-end pr-1 text-[9.5px] text-ink-faint"
                  style={{ gridRow: 1, gridColumn: '1 / span 3' }}
                >
                  {row.label}
                </div>
                {row.cells.map((cell) => (
                  <div key={cell.atomicNumber} style={cellStyle(cell.column + 3)}>
                    <ElementCell
                      cell={cell}
                      color={colorOf(cell.symbol)}
                      selected={cell.symbol === selectedSymbol}
                      onPick={onPick}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-2.5">
          <span className="text-[11px] text-ink-muted">
            元素颜色与画布上的原子标签一致
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-md border border-line-strong bg-hover px-3.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-hover-strong hover:text-ink"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
