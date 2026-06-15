/**
 * Cream/parchment theme palette — Mati-Watsā direction.
 *
 * Single source of truth for the warm cream aesthetic used across every
 * tab. Components import from here so a palette tweak in one place
 * propagates everywhere.
 *
 * Naming convention:
 *  - `bg*`   — surface backgrounds
 *  - `ink*`  — text colors, dark→light
 *  - `border*` — outlines
 *  - Accent names match Dusk Trail: `terracotta`, `ochre`, `fire`, `sage`
 *    so it's clear which colors are shared across themes.
 */

export const CREAM = {
  // Surfaces
  bg: '#f5ede1',          // warm cream/parchment background
  bgSoft: '#fbf6ec',      // slightly lighter — secondary surface
  card: '#ffffff',        // pure white card
  cardMuted: '#faf3e6',   // muted card alternative

  // Text
  ink: '#3a2818',         // dark warm brown — primary
  inkMid: '#7a6555',      // mid warm brown — secondary
  inkLight: '#a09080',    // light warm brown — tertiary / muted
  inkInverse: '#ffffff',  // for placing text on colored fills

  // Lines
  border: '#e8dcc5',      // soft beige
  borderStrong: '#d4c3a0',
  divider: '#efe5d2',     // subtle hairline

  // Accents (shared with Dusk Trail palette so themes feel related)
  terracotta: '#7a4a30',   // deeper terracotta — primary brand color on cream
  terracottaSoft: '#c97b6e', // softer rose-tone
  ochre: '#b88860',        // warm gold/ochre
  fire: '#d97757',         // brighter ember — for CTA buttons
  sage: '#7a9080',         // calm green — secondary metric color
  sky: '#6fa8c4',          // muted blue — informational
  alert: '#c0473a',        // warm dusty red

  // Semantic
  success: '#7a9080',
  warning: '#b88860',
  danger: '#c0473a',
} as const;

export type CreamTone = keyof typeof CREAM;

/**
 * Helper: produce a card-style className-friendly inline style object.
 * Use as `style={{ ...creamCard() }}` to get the standard cream card look.
 */
export const creamCard = (variant: 'default' | 'muted' = 'default') => ({
  background: variant === 'muted' ? CREAM.cardMuted : CREAM.card,
  border: `1px solid ${CREAM.border}`,
});
