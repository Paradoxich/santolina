/**
 * The muted chart swatches, named by hue rather than by meaning.
 *
 * Shared by the dashboard's bloom timeline (which keys them off curated
 * bloom_color names) and the plant page's year timeline (which keys them off
 * the six seasonal stages). One home for the values: they were only in
 * lib/bloom-timeline.ts, and a second chart would otherwise have retyped
 * them and drifted the first time one was adjusted.
 *
 * Client-safe: plain constants, no imports.
 */
export const CHART_COLORS = {
  violet: '#a38eb8',
  lavender: '#b3a3c8',
  blue: '#9aa4c4',
  pink: '#c9a6b8',
  red: '#c48a8a',
  apricot: '#d6a987',
  gold: '#d1c187',
  sand: '#c8c2a4',
  sage: '#a8b0a4',
  /** Spent blooms on the dashboard chart — grey, not a hue. */
  spent: '#afafaf',
} as const

export type ChartColor = keyof typeof CHART_COLORS
