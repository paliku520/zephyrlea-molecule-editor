import { Info } from 'lucide-react';
import { AppMark } from './icons/AppMark';
import { GitHubMark } from './icons/GitHubMark';
import { WindowControls, useWindowChrome } from './WindowControls';
import { REPO_URL } from '../lib/site';
import { APP_VERSION } from '../lib/version';

interface AppHeaderProps {
  onOpenAbout: () => void;
}

export function AppHeader({ onOpenAbout }: AppHeaderProps) {
  const { isDesktop, isMac } = useWindowChrome();

  // 桌面版没有系统标题栏，这一行同时充当窗口标题栏：空白处可拖动窗口，
  // 右侧换成自绘的窗口按钮；浏览器版保持原来的页眉。
  const layoutClass = !isDesktop ? 'px-4' : isMac ? 'pl-[88px] pr-4' : 'pl-4 pr-0';

  return (
    <header
      className={`flex h-11 shrink-0 select-none items-center gap-2.5 border-b border-line bg-panel ${layoutClass} ${
        isDesktop ? 'window-drag' : ''
      }`}
    >
      <AppMark className="h-[18px] w-[18px] shrink-0 rounded-[5px]" />

      <h1 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
        ZephyrLea&apos;s Molecular Editor
      </h1>

      <span
        title={`当前版本 v${APP_VERSION}`}
        className="window-no-drag shrink-0 rounded-full border border-line-strong px-1.5 py-[1px] text-[10px] font-medium tabular-nums text-ink-muted"
      >
        v{APP_VERSION}
      </span>

      <button
        type="button"
        onClick={onOpenAbout}
        title="关于 ZephyrLea's Molecular Editor"
        className="window-no-drag inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-line-strong px-2.5 text-[11.5px] font-medium text-ink-muted transition-colors hover:bg-hover-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Info size={12} strokeWidth={2.1} />
        关于
      </button>

      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer noopener"
        title="在 GitHub 上查看源码：paliku520/zephyrlea-molecule-editor"
        className="window-no-drag inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-hover px-3 text-[12px] font-medium text-ink-soft transition-colors hover:bg-hover-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <GitHubMark className="h-[15px] w-[15px]" />
        <span>GitHub</span>
      </a>

      <WindowControls />
    </header>
  );
}
