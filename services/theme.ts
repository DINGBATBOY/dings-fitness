/**
 * Appearance: light/dark mode + background tone.
 *
 * Every themed color is a CSS variable on <html> (see index.css). This file
 * only flips `data-theme` / `data-tone` and remembers the choice per device.
 * The profile also stores it (profile.appearance) so it follows the account.
 */
export type ThemeMode = 'dark' | 'light';
export type BgTone = 'charcoal' | 'midnight' | 'forest' | 'plum' | 'black';
export interface Appearance { mode: ThemeMode; tone: BgTone }

export const DEFAULT_APPEARANCE: Appearance = { mode: 'dark', tone: 'charcoal' };

export const TONES: { id: BgTone; label: string; swatch: string; card: string }[] = [
  { id: 'charcoal', label: 'Warm charcoal', swatch: '#161210', card: '#1d1815' },
  { id: 'midnight', label: 'Midnight', swatch: '#0f1218', card: '#171b23' },
  { id: 'forest', label: 'Forest', swatch: '#0f1512', card: '#16201a' },
  { id: 'plum', label: 'Plum', swatch: '#16101a', card: '#1e1724' },
  { id: 'black', label: 'True black', swatch: '#000000', card: '#0f0f0f' },
];

const KEY = 'ding-appearance';

export function readAppearance(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && (raw.mode === 'dark' || raw.mode === 'light') && TONES.some(t => t.id === raw.tone)) return raw;
  } catch { /* storage unavailable */ }
  return DEFAULT_APPEARANCE;
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = a.mode;
  root.dataset.tone = a.tone;
  // Native status bar / browser chrome color follows the background.
  const bg = getComputedStyle(root).getPropertyValue('--bg-dark').trim();
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  if (bg) meta.content = bg;
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* ignore */ }
}

export function isValidAppearance(a: unknown): a is Appearance {
  const v = a as Appearance | undefined;
  return !!v && (v.mode === 'dark' || v.mode === 'light') && TONES.some(t => t.id === v.tone);
}
