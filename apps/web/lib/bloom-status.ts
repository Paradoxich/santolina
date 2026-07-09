import { monthName } from './format-plant'

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
 * Known limitation: assumes bloomMonths is a single contiguous window.
 * Bloom periods that cross the December→January boundary (e.g. [11, 12, 1, 2])
 * will get the wrong min/max, and therefore the wrong pre-bloom/done month.
 * None of the currently curated plants hit this, so it's an accepted v1
 * limitation, not a bug to fix now.
 */
export function getBloomStatus(
  bloomMonths: number[],
  today: Date = new Date()
): BloomStatus {
  if (bloomMonths.length === 0) return 'evergreen'

  const currentMonth = today.getMonth() + 1
  if (bloomMonths.includes(currentMonth)) return 'blooming'

  const minMonth = Math.min(...bloomMonths)
  const maxMonth = Math.max(...bloomMonths)

  if (currentMonth === normalizeMonth(minMonth - 1)) return 'pre-bloom'
  if (currentMonth === normalizeMonth(maxMonth + 1)) return 'done'

  return 'resting'
}

/**
 * A terse field note (≤7 words, no trailing punctuation) about where the
 * plant sits *within* its current stage, or what's next for it. It always
 * says something the status chip alone can't — position (early/peak/late), a
 * recent event, or the next flowering — and never describes the plant or
 * restates the stage. Pure function of bloom_months and a reference date.
 *
 * Resting plants (dormant, but they flower) look forward to their next bloom
 * month; the 2 catalog plants with no bloom_months at all fall to the
 * evergreen line. Position within blooming compares the current month to the
 * window's first/last month, so it shares getBloomStatus's wrap-around
 * limitation. Always returns a string — the card line is never blank.
 */
export function getStageNote(
  bloomMonths: number[],
  today: Date = new Date()
): string {
  const status = getBloomStatus(bloomMonths, today)
  const currentMonth = today.getMonth() + 1

  if (status === 'evergreen') return 'Year-round structure'
  if (status === 'pre-bloom') return 'Buds forming now'
  if (status === 'done') return 'Flowering just finished'

  const minMonth = Math.min(...bloomMonths)
  const maxMonth = Math.max(...bloomMonths)

  if (status === 'resting') return `Blooms again in ${monthName(minMonth)}`

  // blooming — position within the window
  if (minMonth === maxMonth) return 'Peak flowering now'
  if (currentMonth === minMonth) return 'First flowers opening'
  if (currentMonth === maxMonth) return 'Bloom ending soon'
  return 'Peak flowering now'
}
