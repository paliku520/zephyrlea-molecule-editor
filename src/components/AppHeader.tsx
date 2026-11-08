import { Info } from 'lucide-react';
import { GitHubMark } from './icons/GitHubMark';
import { REPO_URL } from '../lib/site';

interface AppHeaderProps {
  onOpenAbout: () => void;
}

export function AppHeader({ onOpenAbout }: AppHeaderProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line bg-panel px-4">
      <h1 className="min-w-0 truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
        ZephyrLea&apos;s Molecular Editor
      </h1>

      <button
        type="button"
        onClick={onOpenAbout}
        title="关于 ZephyrLea's Molecular Editor"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-line-strong px-2.5 text-[11.5px] font-medium text-ink-muted transition-colors hover:bg-hover-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Info size={12} strokeWidth={2.1} />
        关于
      </button>

      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer noopener"
        title="在 GitHub 上查看源码：paliku520/zephyrlea-molecule-editor"
        className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-hover px-3 text-[12px] font-medium text-ink-soft transition-colors hover:bg-hover-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <GitHubMark className="h-[15px] w-[15px]" />
        <span>GitHub</span>
      </a>
    </header>
  );
}
