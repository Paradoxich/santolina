import { monthName } from './format-plant'
import { getCurrentSeason, type Season } from './season'

export type BloomStatus =
  | 'blooming'
  | 'pre-bloom'
  | 'done'
  | 'resting'
  | 'evergreen'

function normalizeMonth(month: number): number {
  return ((month - 1 + 12) % 12) + 1
}

/**
 * Derives a plant's current bloom status from its bloom_months array
 * (1–12, no ordering guaranteed). Pure function of the plant's data and
 * a reference date — no stored status, no external API.
 *
 * The window is circular: [12, 1, 2, 3] is one window running December→March,
 * so winter bloomers get the right pre-bloom/done months. Assumes a single
 * contiguous window per year (wrapping or not); a plant with two separate
 * windows gets the boundary nearest the end of the array's iteration, which
 * no catalog plant currently exercises. All 12 months = always 'blooming'.
 */
export function getBloomStatus(
  bloomMonths: number[],
  today: Date = new Date()
): BloomStatus {
  if (bloomMonths.length === 0) return 'evergreen'

  const currentMonth = today.getMonth() + 1
  if (bloomMonths.includes(currentMonth)) return 'blooming'

  const bounds = windowBounds(bloomMonths)
  if (!bounds) return 'blooming' // all 12 months; unreachable past the includes check

  if (currentMonth === normalizeMonth(bounds.start - 1)) return 'pre-bloom'
  if (currentMonth === normalizeMonth(bounds.end + 1)) return 'done'

  return 'resting'
}

/**
 * First and last month of the bloom window, treating the year as circular:
 * the start is the bloom month whose previous month is not a bloom month,
 * so [12, 1, 2] starts in December, not January. Null when the plant blooms
 * all 12 months — no boundary exists.
 */
function windowBounds(
  bloomMonths: number[]
): { start: number; end: number } | null {
  const set = new Set(bloomMonths)
  if (set.size >= 12) return null

  let start = Math.min(...bloomMonths)
  let end = Math.max(...bloomMonths)
  for (const m of set) {
    if (!set.has(normalizeMonth(m - 1))) start = m
    if (!set.has(normalizeMonth(m + 1))) end = m
  }
  return { start, end }
}

// The UI merges 'done' into Resting (a five-way status vocabulary wasn't
// earning its keep, and "Done" reads ambiguously on a card). The internal
// status keeps the distinction — dashboard copy and stage notes rely on it —
// so anything user-facing maps through here first.
export type DisplayBloomStatus = Exclude<BloomStatus, 'done'>

export function toDisplayStatus(status: BloomStatus): DisplayBloomStatus {
  return status === 'done' ? 'resting' : status
}

// Evergreens have no bloom window, so their note is anchored to the moment —
// what the plant is doing this season, not what it definitionally is. Keyed by
// the 6-stage season vocabulary for a Mediterranean-adjacent climate.
const EVERGREEN_NOTES: Record<Season, string> = {
  early_spring: 'Fresh backdrop as spring starts',
  late_spring: 'Lush behind the spring blooms',
  summer: 'Holding well in summer heat',
  late_summer: 'Still green as summer fades',
  autumn: 'Structure as the borders fade',
  winter: 'Good winter structure',
}

/**
 * A terse field note (≤7 words, no trailing punctuation) about where the
 * plant sits *within* its current stage, or what's next for it. It always
 * says something the status chip alone can't — position (early/peak/late), a
 * recent event, or the next flowering — and never describes the plant or
 * restates the stage. Pure function of bloom_months and a reference date.
 *
 * Resting plants (dormant, but they flower) look forward to their next bloom
 * month; plants with no bloom_months at all (ferns, conifers, foliage
 * evergreens — count them live, do not write the number down here) get a
 * season-keyed evergreen line. The window is circular, matching
 * getBloomStatus, so a December→March bloomer resting in August looks
 * forward to December. Always returns a string — the card line is never
 * blank.
 */
export function getStageNote(
  bloomMonths: number[],
  today: Date = new Date()
): string {
  const status = getBloomStatus(bloomMonths, today)
  const currentMonth = today.getMonth() + 1

  if (status === 'evergreen') return EVERGREEN_NOTES[getCurrentSeason(today)]
  if (status === 'pre-bloom') return 'Buds forming now'
  if (status === 'done') return 'Flowering just finished'

  const bounds = windowBounds(bloomMonths)
  if (!bounds) return 'Flowering all year' // blooms all 12 months

  if (status === 'resting') return `Blooms again in ${monthName(bounds.start)}`

  // blooming — position within the window
  if (bounds.start === bounds.end) return 'Peak flowering now'
  if (currentMonth === bounds.start) return 'First flowers opening'
  if (currentMonth === bounds.end) return 'Bloom ending soon'
  return 'Peak flowering now'
}
