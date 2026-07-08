// Pure logic for the Dashboard's subtitle and Garden Insight copy.
// Client-safe. Composes short observations from the real forecast and
// palette instead of static sample strings — same spirit as care-tips.ts.
import type { PalettePlant } from '@/server/palette-actions'
import type { WeatherDay } from '@/types/dashboard'
import { getBloomStatus } from './bloom-status'
import { monthName } from './format-plant'

interface BloomGroups {
  blooming: PalettePlant[]
  preBloom: PalettePlant[]
  done: PalettePlant[]
}

function groupByBloomStatus(palette: PalettePlant[], today: Date): BloomGroups {
  const groups: BloomGroups = { blooming: [], preBloom: [], done: [] }
  for (const row of palette) {
    if (row.status !== 'planted') continue
    const status = getBloomStatus(row.plant.bloom_months ?? [], today)
    if (status === 'blooming') groups.blooming.push(row)
    else if (status === 'pre-bloom') groups.preBloom.push(row)
    else if (status === 'done') groups.done.push(row)
  }
  return groups
}

/** "Cool mornings this week." — one observation from the 3-day forecast. */
function weatherSentence(days: WeatherDay[] | null): string | null {
  if (!days || days.length === 0) return null
  const today = days[0]!
  const rainyDays = days.filter((d) => d.icon === 'rain').length

  if (rainyDays >= 2) return 'Rain on and off over the next few days.'
  if (today.icon === 'rain') return 'Rain expected today.'
  if (today.high >= 30) return 'Hot days ahead this week.'
  if (today.low <= 5) return 'Cold nights this week.'
  if (today.low <= 12) return 'Cool mornings this week.'
  if (days.every((d) => d.icon === 'sunny')) return 'Clear skies this week.'
  return 'Mild days this week.'
}

/** "Salvia is in full bloom." — what the garden is doing right now. */
function bloomSentence(groups: BloomGroups, hasPlants: boolean): string {
  const names = (rows: PalettePlant[]) =>
    rows.map((r) => r.plant.common_name).filter(Boolean)

  const blooming = names(groups.blooming)
  if (blooming.length >= 3)
    return `${blooming[0]}, ${blooming[1]} and more are in bloom.`
  if (blooming.length === 2)
    return `${blooming[0]} and ${blooming[1]} are in bloom.`
  if (blooming.length === 1) return `${blooming[0]} is in full bloom.`

  const preBloom = names(groups.preBloom)
  if (preBloom.length > 0) return `${preBloom[0]} is about to open.`

  const done = names(groups.done)
  if (done.length > 0) return `${done[0]} has finished flowering.`

  return hasPlants
    ? 'The garden is quietly growing.'
    : 'Your garden is ready for its first plants.'
}

/**
 * The one-line dashboard subtitle: a weather observation plus a bloom
 * observation, e.g. "Cool mornings this week. Foxgloves are beginning
 * to open."
 */
export function buildDashboardSubtitle(
  days: WeatherDay[] | null,
  palette: PalettePlant[],
  today: Date = new Date()
): string {
  const groups = groupByBloomStatus(palette, today)
  const weather = weatherSentence(days)
  const bloom = bloomSentence(
    groups,
    palette.some((p) => p.status === 'planted')
  )
  return weather ? `${weather} ${bloom}` : bloom
}

const POLLINATOR_PATTERN = /pollinator|bee|butterfly|wildlife/i

/**
 * The Garden Insight card: one garden-level observation derived from
 * the palette, picked in priority order.
 */
export function buildGardenInsight(
  palette: PalettePlant[],
  today: Date = new Date()
): string {
  const groups = groupByBloomStatus(palette, today)
  const { blooming, preBloom } = groups

  const supportsPollinators = blooming.some((r) =>
    POLLINATOR_PATTERN.test(r.plant.environment_benefits ?? '')
  )
  if (supportsPollinators && blooming.length >= 2)
    return 'Your garden is supporting local pollinators during one of its busiest bloom weeks.'
  if (supportsPollinators)
    return `${blooming[0]!.plant.common_name} is feeding local pollinators right now.`

  if (blooming.length >= 2)
    return `${blooming.length} of your plants are in bloom at once — one of your garden's busiest weeks.`

  if (blooming.length === 1) {
    const plant = blooming[0]!.plant
    const lastMonth = Math.max(...(plant.bloom_months ?? []))
    return Number.isFinite(lastMonth)
      ? `${plant.common_name} is at its peak — its bloom runs through ${monthName(lastMonth)}.`
      : `${plant.common_name} is at its peak right now.`
  }

  if (preBloom.length > 0)
    return `${preBloom[0]!.plant.common_name} is about to open — expect new color in the coming weeks.`

  const plannedCount = palette.filter((p) => p.status === 'planned').length
  if (plannedCount > 0)
    return `Nothing in bloom right now — a good moment to plant from your ${plannedCount} planned ${plannedCount === 1 ? 'pick' : 'picks'}.`

  return 'Your garden is resting — its evergreen structure is doing the quiet work this season.'
}
