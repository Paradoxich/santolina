// Maps the calendar onto the 6-stage seasonal vocabulary (Mediterranean/European
// climate). Client-safe — no framework or Supabase imports. Shared by the
// dashboard Care Tips and the growing cards' stage notes.
import type { SeasonalRhythm } from './plants-db'

export type Season = keyof SeasonalRhythm

const MONTH_TO_SEASON: Record<number, Season> = {
  12: 'winter',
  1: 'winter',
  2: 'winter',
  3: 'early_spring',
  4: 'early_spring',
  5: 'late_spring',
  6: 'late_spring',
  7: 'summer',
  8: 'summer',
  9: 'late_summer',
  10: 'autumn',
  11: 'autumn',
}

/** Maps a calendar month onto the 6-stage seasonal_rhythm vocabulary. */
export function getCurrentSeason(today: Date = new Date()): Season {
  return MONTH_TO_SEASON[today.getMonth() + 1]!
}
