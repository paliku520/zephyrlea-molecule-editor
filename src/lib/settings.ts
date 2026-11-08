export type ThemeMode = 'dark' | 'light';
/** Where the control chrome is docked; bottom is friendlier on tall screens. */
export type ToolbarPlacement = 'top' | 'bottom';

export interface AppSettings {
  theme: ThemeMode;
  /** Skeletal style: carbons unlabelled and only required hydrogens shown. */
  hideCarbonHydrogenAtoms: boolean;
  toolbarPlacement: ToolbarPlacement;
}

export const SETTINGS_STORAGE_KEY = 'zephyrlea.settings';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  hideCarbonHydrogenAtoms: true,
  toolbarPlacement: 'bottom',
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
