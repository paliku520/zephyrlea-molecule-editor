export type ThemeMode = 'dark' | 'light';
/** Where the control chrome is docked; bottom is friendlier on tall screens. */
export type ToolbarPlacement = 'top' | 'bottom';
/** How the 3D viewer draws the conformer. */
export type Model3DStyle = 'ball-stick' | 'space-fill' | 'stick' | 'wireframe';

export const MODEL_3D_STYLE_OPTIONS: {
  value: Model3DStyle;
  label: string;
  hint: string;
}[] = [
  { value: 'ball-stick', label: '球棍模型', hint: '球棍模型：原子球 + 化学键' },
  { value: 'space-fill', label: '空间填充模型', hint: '空间填充模型：按范德华半径铺满' },
  { value: 'stick', label: '棍状模型', hint: '棍状模型：只画化学键' },
  { value: 'wireframe', label: '线框模型', hint: '线框模型：最细的骨架线' },
];

export interface AppSettings {
  theme: ThemeMode;
  /** Skeletal style: carbons unlabelled and only required hydrogens shown. */
  hideCarbonHydrogenAtoms: boolean;
  toolbarPlacement: ToolbarPlacement;
  model3DStyle: Model3DStyle;
}

export const SETTINGS_STORAGE_KEY = 'zephyrlea.settings';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  hideCarbonHydrogenAtoms: true,
  toolbarPlacement: 'bottom',
  model3DStyle: 'ball-stick',
};

const THEME_BACKGROUND: Record<ThemeMode, string> = {
  dark: '#171717',
  light: '#f4f4f5',
};

export function normalizeSettings(value: unknown): AppSettings {
  const raw = (value ?? {}) as Partial<AppSettings>;

  return {
    theme: raw.theme === 'light' ? 'light' : 'dark',
    hideCarbonHydrogenAtoms:
      typeof raw.hideCarbonHydrogenAtoms === 'boolean'
        ? raw.hideCarbonHydrogenAtoms
        : DEFAULT_SETTINGS.hideCarbonHydrogenAtoms,
    toolbarPlacement:
      raw.toolbarPlacement === 'top' || raw.toolbarPlacement === 'bottom'
        ? raw.toolbarPlacement
        : DEFAULT_SETTINGS.toolbarPlacement,
    model3DStyle: MODEL_3D_STYLE_OPTIONS.some((option) => option.value === raw.model3DStyle)
      ? (raw.model3DStyle as Model3DStyle)
      : DEFAULT_SETTINGS.model3DStyle,
  };
}

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return stored ? normalizeSettings(JSON.parse(stored)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota: the editor keeps working with in-memory settings.
  }
}

/** Drive the CSS token set; every shell and Kekule popup color keys off it. */
export function applyThemeToDocument(theme: ThemeMode) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_BACKGROUND[theme]);
}
