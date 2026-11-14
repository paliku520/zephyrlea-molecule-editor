import type { ThemeMode } from './settings';

/**
 * Element accent colors, tuned per canvas theme. Used both by the element strip
 * in the shell and by the Kekule renderer, so an atom label always matches the
 * button that inserts it.
 */
const ELEMENT_COLORS_DARK: Record<string, string> = {
  H: '#d1d1d6',
  B: '#f6a6a6',
  C: '#e9e9eb',
  N: '#7d93ff',
  O: '#ff7676',
  F: '#7bd6a0',
  Si: '#c8b48a',
  P: '#f4a34a',
  S: '#e6c84a',
  Cl: '#4fd1a1',
  Se: '#e0a94a',
  Br: '#cf8b6a',
  Te: '#c9a24a',
  I: '#a78bfa',
};

/** Darker counterparts so the same labels stay legible on a light canvas. */
const ELEMENT_COLORS_LIGHT: Record<string, string> = {
  H: '#4b4b53',
  B: '#b03a3a',
  C: '#1b1b1f',
  N: '#2f52c4',
  O: '#c9302c',
  F: '#12805a',
  Si: '#7a6234',
  P: '#a85400',
  S: '#8a7000',
  Cl: '#0d7a52',
  Se: '#8a6400',
  Br: '#8c452a',
  Te: '#7a6200',
  I: '#5b3ea8',
};

/** Fallback for every element without an explicit accent. */
const DEFAULT_ELEMENT_COLOR_DARK = '#e9e9eb';
const DEFAULT_ELEMENT_COLOR_LIGHT = '#1b1b1f';

export function getElementColors(theme: ThemeMode): Record<string, string> {
  return theme === 'light' ? ELEMENT_COLORS_LIGHT : ELEMENT_COLORS_DARK;
}

export function getDefaultElementColor(theme: ThemeMode): string {
  return theme === 'light' ? DEFAULT_ELEMENT_COLOR_LIGHT : DEFAULT_ELEMENT_COLOR_DARK;
}

export const ATOMIC_NUMBER_LIMIT = 119;
