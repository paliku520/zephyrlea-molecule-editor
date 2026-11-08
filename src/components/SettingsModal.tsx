import { useEffect, type ReactNode } from 'react';
import { Moon, Sun, X } from 'lucide-react';
import type { AppSettings, ThemeMode } from '../lib/settings';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'light', label: '浅色', icon: Sun },
];

export function SettingsModal({ open, settings, onChange, onClose }: SettingsModalProps) {
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
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-[var(--shell-scrim)] backdrop-blur-[2px]"
        onPointerDown={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="relative flex w-full max-w-[452px] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_28px_80px_var(--shell-shadow)]"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id="settings-dialog-title" className="text-[14px] font-semibold text-ink">
            设置
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            title="关闭设置"
            className="-mr-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </div>

        <div className="flex flex-col gap-1 px-2.5 py-2.5">
          <SettingRow
            title="外观主题"
            description="深色适合长时间绘图，浅色更适合截图与打印预览。"
            control={
              <div
                role="radiogroup"
                aria-label="外观主题"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-canvas p-1"
              >
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                  const active = settings.theme === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onChange({ ...settings, theme: value })}
                      className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors ${
                        active
                          ? 'bg-pill text-pill-ink shadow-[0_1px_2px_var(--shell-shadow)]'
                          : 'text-ink-muted hover:bg-hover hover:text-ink'
                      }`}
                    >
                      <Icon size={13} strokeWidth={1.9} />
                      {label}
                    </button>
                  );
                })}
              </div>
            }
          />

          <div className="mx-3 h-px bg-line" />

          <SettingRow
            title="隐藏碳/氢原子"
            description="开启后按骨架式绘制：碳原子不标注，氢原子仅在需要时显示；关闭后显示全部原子与氢的数量。"
            control={
              <button
                type="button"
                role="switch"
                aria-checked={settings.hideCarbonHydrogenAtoms}
                aria-label="隐藏碳/氢原子"
                onClick={() =>
                  onChange({
                    ...settings,
                    hideCarbonHydrogenAtoms: !settings.hideCarbonHydrogenAtoms,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 ${
                  settings.hideCarbonHydrogenAtoms
                    ? 'border-transparent bg-accent'
                    : 'border-line-strong bg-hover-strong'
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-transform duration-150 ${
                    settings.hideCarbonHydrogenAtoms
                      ? 'translate-x-[25px] bg-white'
                      : 'translate-x-[3px] bg-ink-muted'
                  }`}
                />
              </button>
            }
          />
        </div>

        <div className="border-t border-line px-5 py-2.5 text-[11px] text-ink-faint">
          设置会自动保存在本地浏览器中。
        </div>
      </div>
    </div>
  );
}

interface SettingRowProps {
  title: string;
  description: string;
  control: ReactNode;
}

function SettingRow({ title, description, control }: SettingRowProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl px-2.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">{title}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{description}</p>
      </div>
      {control}
    </div>
  );
}
