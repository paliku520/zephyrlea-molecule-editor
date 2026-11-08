import { Fragment, type ReactNode } from 'react';
import { Eraser, Hand, Lasso, MousePointer2 } from 'lucide-react';
import type { ToolId } from '../lib/editorBridge';
import { IconButton } from './ui/IconButton';
import {
  BenzeneIcon,
  CyclobutaneIcon,
  CycloheptaneIcon,
  CyclooctaneIcon,
  CyclohexaneIcon,
  CyclopentaneIcon,
  CyclopropaneIcon,
  DativeBondIcon,
  DoubleBondIcon,
  HashedWedgeBondIcon,
  NegativeChargeIcon,
  PositiveChargeIcon,
  SingleBondIcon,
  TripleBondIcon,
  WavyBondIcon,
  WedgeBondIcon,
} from './icons/ChemIcons';

interface LeftToolRailProps {
  ready: boolean;
  activeTool: ToolId | null;
  onSelectTool: (tool: ToolId) => void;
  /** `horizontal` docks the rail as a strip along the bottom edge. */
  orientation?: 'vertical' | 'horizontal';
}

interface ToolDefinition {
  tool: ToolId;
  label: string;
  icon: ReactNode;
}

const TOOL_GROUPS: ToolDefinition[][] = [
  [
    { tool: 'select', label: '选择', icon: <MousePointer2 size={18} strokeWidth={1.7} /> },
    { tool: 'lasso', label: '套索选择', icon: <Lasso size={18} strokeWidth={1.6} /> },
    { tool: 'pan', label: '平移画布', icon: <Hand size={18} strokeWidth={1.6} /> },
  ],
  [
    { tool: 'erase', label: '橡皮擦', icon: <Eraser size={18} strokeWidth={1.6} /> },
  ],
  [
    { tool: 'single', label: '单键', icon: <SingleBondIcon width={19} height={19} /> },
    { tool: 'wedgeUp', label: '楔形键（向上）', icon: <WedgeBondIcon width={19} height={19} /> },
  ],
  [
    { tool: 'double', label: '双键', icon: <DoubleBondIcon width={19} height={19} /> },
    { tool: 'wedgeDown', label: '虚楔键（向下）', icon: <HashedWedgeBondIcon width={19} height={19} /> },
  ],
  [
    { tool: 'triple', label: '三键', icon: <TripleBondIcon width={19} height={19} /> },
    { tool: 'dative', label: '配位键', icon: <DativeBondIcon width={19} height={19} /> },
  ],
  [
    { tool: 'wavy', label: '未知立体键', icon: <WavyBondIcon width={19} height={19} /> },
  ],
  [
    { tool: 'chargePlus', label: '加正电荷', icon: <PositiveChargeIcon width={19} height={19} /> },
    { tool: 'chargeMinus', label: '加负电荷', icon: <NegativeChargeIcon width={19} height={19} /> },
  ],
  [
    { tool: 'benzene', label: '苯环', icon: <BenzeneIcon width={22} height={22} /> },
    { tool: 'ring3', label: '环丙烷', icon: <CyclopropaneIcon width={22} height={22} /> },
  ],
  [
    { tool: 'ring4', label: '环丁烷', icon: <CyclobutaneIcon width={22} height={22} /> },
    { tool: 'ring5', label: '环戊烷', icon: <CyclopentaneIcon width={22} height={22} /> },
  ],
  [
    { tool: 'ring6', label: '环己烷', icon: <CyclohexaneIcon width={22} height={22} /> },
    { tool: 'ring7', label: '环庚烷', icon: <CycloheptaneIcon width={22} height={22} /> },
  ],
  [
    { tool: 'ring8', label: '环辛烷', icon: <CyclooctaneIcon width={22} height={22} /> },
  ],
];

export function LeftToolRail({
  ready,
  activeTool,
  onSelectTool,
  orientation = 'vertical',
}: LeftToolRailProps) {
  const rButton = (
    <button
      type="button"
      aria-label="R 基团"
      aria-pressed={activeTool === 'element:R' || undefined}
      title="R 基团"
      onClick={() => onSelectTool('element:R')}
      disabled={!ready}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-35 ${
        activeTool === 'element:R'
          ? 'bg-pill text-pill-ink'
          : 'text-accent hover:bg-hover hover:text-accent-strong'
      }`}
    >
      <span className="text-[15px] font-semibold tracking-tight">R</span>
    </button>
  );

  if (orientation === 'horizontal') {
    return (
      <div
        className="flex w-full shrink-0 flex-wrap items-center border-t border-line bg-panel px-3 py-2"
        role="toolbar"
        aria-label="绘图工具"
      >
        {TOOL_GROUPS.map((group, groupIndex) => (
          <Fragment key={group.map((item) => item.tool).join('-')}>
            {(groupIndex === 2 || groupIndex === 7) && (
              <span className="mx-1.5 h-6 w-px shrink-0 bg-line" />
            )}
            <div className="flex shrink-0 items-center gap-0.5">
              {group.map(({ tool, label, icon }) => (
                <IconButton
                  key={tool}
                  label={label}
                  active={activeTool === tool}
                  onClick={() => onSelectTool(tool)}
                  disabled={!ready}
                >
                  {icon}
                </IconButton>
              ))}
            </div>
          </Fragment>
        ))}

        <span className="mx-1.5 h-6 w-px shrink-0 bg-line" />
        {rButton}
      </div>
    );
  }

  return (
    <aside className="flex w-[90px] shrink-0 flex-col items-center overflow-y-auto border-r border-line bg-panel px-2 py-4">
      <div className="flex w-full flex-col">
        {TOOL_GROUPS.map((group, groupIndex) => (
          <Fragment key={group.map((item) => item.tool).join('-')}>
            {(groupIndex === 2 || groupIndex === 7) && (
              <div className="my-2 h-px w-full bg-line" />
            )}
            <div
              className={`grid w-full grid-cols-2 gap-1 ${groupIndex > 0 ? 'mt-2' : ''}`}
            >
              {group.map(({ tool, label, icon }) => (
                <IconButton
                  key={tool}
                  label={label}
                  active={activeTool === tool}
                  onClick={() => onSelectTool(tool)}
                  disabled={!ready}
                  className="justify-self-center"
                >
                  {icon}
                </IconButton>
              ))}
            </div>
          </Fragment>
        ))}
      </div>

      <div className="mt-auto w-full pt-5">
        <div className="mb-3 h-px w-full bg-line" />
        <div className="flex justify-center">{rButton}</div>
      </div>
    </aside>
  );
}
