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
