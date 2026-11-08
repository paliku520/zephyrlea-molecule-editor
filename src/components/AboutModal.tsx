import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, Cpu, ExternalLink, FileText, Scale, Sparkles, User, X } from 'lucide-react';
import licenseText from '../../LICENSE?raw';
import { REPO_URL, DOCS_URL } from '../lib/site';
import { GitHubMark } from './icons/GitHubMark';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

const TECH_STACK: { name: string; role: string }[] = [
  { name: 'React 19 · TypeScript', role: '界面与交互' },
  { name: 'Vite', role: '构建与静态部署' },
  { name: 'Tailwind CSS 4', role: '主题与布局' },
  { name: 'Kekule.js 1.0.4', role: '2D 绘图与图片渲染' },
  { name: 'RDKit.js（WASM）', role: '分子分析与价键校验' },
  { name: 'OpenChemLib', role: '2D 坐标生成' },
  { name: 'sci-form-wasm', role: '3D 构象生成' },
  { name: '3Dmol.js', role: '三维渲染' },
];

/** Short capability list: the things a new user should know it can do. */
const HIGHLIGHTS: { title: string; detail: string }[] = [
  { title: '绘制', detail: '元素、键型、电荷、R 基团与环模板' },
  { title: '分析', detail: '分子式、描述符与价键校验，实时更新' },
  { title: '导出', detail: 'SMILES 文本、透明背景 PNG / SVG' },
  { title: '三维', detail: '本地生成构象，可旋转、截图' },
];

function SectionLabel({ icon: Icon, children }: { icon: typeof Cpu; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-ink-muted uppercase">
      <Icon size={12.5} strokeWidth={1.9} />
      {children}
    </div>
  );
}

function FactRow({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Cpu;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
        <Icon size={13} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-ink">{title}</p>
        <div className="mt-0.5 text-[11.5px] leading-5 text-ink-muted">{children}</div>
      </div>
    </div>
  );
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const [showLicense, setShowLicense] = useState(false);

  useEffect(() => {
    if (!open) setShowLicense(false);
  }, [open]);

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
        aria-labelledby="about-dialog-title"
        className="relative flex max-h-[90vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_28px_80px_var(--shell-shadow)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-1.5">
            {showLicense && (
              <button
                type="button"
                onClick={() => setShowLicense(false)}
                aria-label="返回关于信息"
                title="返回关于信息"
                className="-ml-2 mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink"
              >
                <ArrowLeft size={15} strokeWidth={1.9} />
              </button>
            )}
            <div className="min-w-0">
              <h2 id="about-dialog-title" className="text-[15px] font-semibold text-ink">
                {showLicense ? 'MIT License' : "ZephyrLea's Molecular Editor"}
              </h2>
              <p className="mt-1 text-[11.5px] text-ink-muted">
                {showLicense ? '本项目的开源协议全文' : '轻量化小分子结构编辑器 · v0.1.0'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭关于窗口"
            title="关闭关于窗口"
            className="-mr-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </div>

        {showLicense ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
            <pre className="rounded-lg border border-line bg-canvas px-3.5 py-3 font-mono text-[10.5px] leading-[1.7] break-words whitespace-pre-wrap text-ink-soft">
              {licenseText.trim()}
            </pre>
            <p className="text-[10.5px] leading-4 text-ink-faint">
              同一份协议原文也以 <span className="font-mono">LICENSE</span> 文件随源码发布，可在 GitHub
              仓库中查看与下载。
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <p className="text-[12.5px] leading-[1.75] text-ink-soft">
              一个轻量化的小分子结构编辑器，基于 Kekule.js
              构建，专为中学化学的课堂演示、练习与作业设计。
              点选元素与键型即可逐笔搭建结构，也支持 SMILES 导入导出、结构整理、RDKit
              分子分析与价键校验，并能随时切换到 3D 构象查看——全部计算都在浏览器本地完成，无需安装、不上传数据。
            </p>

            <section>
              <SectionLabel icon={Sparkles}>主要能力</SectionLabel>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {HIGHLIGHTS.map((item) => (
                  <li key={item.title} className="rounded-md border border-line bg-canvas px-2.5 py-1.5">
                    <p className="text-[11.5px] font-semibold text-ink-soft">{item.title}</p>
                    <p className="mt-0.5 text-[10.5px] leading-4 text-ink-faint">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <SectionLabel icon={Cpu}>核心技术栈</SectionLabel>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {TECH_STACK.map((tech) => (
                  <li
                    key={tech.name}
                    className="flex items-baseline justify-between gap-2 rounded-md border border-line bg-canvas px-2.5 py-1.5"
                  >
                    <span className="truncate text-[11.5px] font-semibold text-ink-soft">
                      {tech.name}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-ink-faint">{tech.role}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-3">
              <FactRow icon={Scale} title="开源协议 · MIT License">
                <p>
                  本项目基于 MIT License
                  发布，可自由使用、修改与分发，仅需保留原始版权声明；所用第三方库分别遵循各自的开源协议。
                </p>
                <button
                  type="button"
                  onClick={() => setShowLicense(true)}
                  className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent transition-colors hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <FileText size={12} strokeWidth={1.9} />
                  查看完整协议
                </button>
              </FactRow>
              <FactRow icon={User} title="作者">
                paliku520（云野风云 ZephyrLea.）——设计与开发。
              </FactRow>
            </section>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-[11.5px] font-medium text-accent transition-colors hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <GitHubMark className="h-[15px] w-[15px] shrink-0" />
              <span className="truncate">paliku520/zephyrlea-molecule-editor</span>
              <ExternalLink size={12} strokeWidth={1.8} className="shrink-0 opacity-70" />
            </a>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer noopener"
              title="使用说明、实现细节与部署 / 托管教程"
              className="inline-flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-[11.5px] font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <BookOpen size={13.5} strokeWidth={1.9} className="shrink-0" />
              <span className="truncate">使用说明与部署教程</span>
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-line-strong bg-hover px-3.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-hover-strong hover:text-ink"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
