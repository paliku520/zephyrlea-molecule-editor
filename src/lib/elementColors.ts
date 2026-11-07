/**
 * Element accent colors, tuned for the dark canvas. Used both by the element
 * strip in the shell and by the Kekule renderer, so an atom label always
 * matches the button that inserts it.
 */
export const ELEMENT_COLORS: Record<string, string> = {
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

/** Fallback for every element without an explicit accent. */
export const DEFAULT_ELEMENT_COLOR = '#e9e9eb';

export const ATOMIC_NUMBER_LIMIT = 119;
