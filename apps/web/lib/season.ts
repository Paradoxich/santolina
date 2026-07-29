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

/** Display names for the six stages, in seasonal_rhythm key order. */
export const SEASON_LABELS: Record<Season, string> = {
  early_spring: 'Early spring',
  late_spring: 'Late spring',
  summer: 'Summer',
  late_summer: 'Late summer',
  autumn: 'Autumn',
  winter: 'Winter',
}

export interface SeasonSpan {
  season: Season
  /** 1-12, inclusive. */
  startMonth: number
  endMonth: number
}

/**
 * The same stages as contiguous calendar runs, January to December, derived
 * from MONTH_TO_SEASON so the two cannot drift. Winter yields two runs
 * because it wraps the year end (Jan-Feb, then Dec); a strip drawing the
 * calendar left to right has to show both rather than pretend it is one.
 */
export const SEASON_SPANS: SeasonSpan[] = (() => {
  const spans: SeasonSpan[] = []
  for (let month = 1; month <= 12; month++) {
    const season = MONTH_TO_SEASON[month]!
    const last = spans[spans.length - 1]
    if (last && last.season === season) last.endMonth = month
    else spans.push({ season, startMonth: month, endMonth: month })
  }
  return spans
})()
