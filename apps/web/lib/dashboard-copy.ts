// Pure logic for the Dashboard's subtitle and Garden Impact copy.
// Client-safe. Composes short observations from the real forecast and
// palette instead of static sample strings — same spirit as care-tips.ts.
import type { PalettePlant } from '@/server/palette-actions'
import type { WeatherDay } from '@/types/dashboard'
import { getBloomStatus } from './bloom-status'
import { monthName } from './format-plant'
import { getCurrentSeason } from './season'

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

// Ecosystem-benefit buckets for the Garden Impact card, keyword-matched
// against the AI-curated environment_benefits prose. A structured
// ecosystem_tags column is the post-test upgrade (see the Build Backlog);
// these buckets are the v1.
const POLLINATOR_PATTERN = /pollinator|bee|butterfl|hoverfl|nectar/i
const BIRD_PATTERN = /bird/i
const SHELTER_PATTERN = /shelter|habitat|overwinter/i
const EARLY_NECTAR_PATTERN = /early pollinator|few other (flower|source)/i
const LATE_NECTAR_PATTERN = /late-season|late season|sources are declining/i

/**
 * The Garden Impact card: one sentence about what the garden is giving
 * back to the local ecosystem right now, picked in priority order.
 *
 * Deliberately NOT bloom status - the subtitle, Bloom Timeline, and tile
 * chips already carry that. Bloom only appears here as the mechanism of a
 * benefit ("X is feeding..." requires X to be in bloom). Ecosystem framing
 * also keeps the card alive year-round: berries feed birds in autumn,
 * evergreens shelter insects in winter.
 */
export function buildGardenImpact(
  palette: PalettePlant[],
  today: Date = new Date()
): string {
  const planted = palette.filter((p) => p.status === 'planted')
  if (planted.length === 0)
    return 'Every plant you add becomes part of the local ecosystem.'

  const benefits = (row: PalettePlant) => row.plant.environment_benefits ?? ''
  const groups = groupByBloomStatus(palette, today)
  const season = getCurrentSeason(today)

  // Active benefit: pollinator plants in bloom right now.
  const feeding = groups.blooming.filter((r) =>
    POLLINATOR_PATTERN.test(benefits(r))
  )
  if (feeding.length >= 2)
    return 'Your garden is feeding bees and butterflies right when they need it most.'
  if (feeding.length === 1) {
    const row = feeding[0]!
    if (EARLY_NECTAR_PATTERN.test(benefits(row)))
      return `${row.plant.common_name} is one of the first reliable nectar sources of the season.`
    if (LATE_NECTAR_PATTERN.test(benefits(row)))
      return `${row.plant.common_name} is helping carry pollinators into autumn, when fewer flowers remain.`
    return `${row.plant.common_name} is supporting bees and butterflies while it's in bloom.`
  }

  // Seasonal benefits that don't need anything in bloom.
  const forBirds = planted.filter((r) => BIRD_PATTERN.test(benefits(r)))
  if (forBirds.length > 0 && (season === 'late_summer' || season === 'autumn'))
    return `${forBirds[0]!.plant.common_name} will provide food for garden birds well into autumn.`

  const sheltering = planted.filter(
    (r) =>
      SHELTER_PATTERN.test(benefits(r)) ||
      (r.plant.bloom_months ?? []).length === 0
  )
  if (sheltering.length > 0 && season === 'winter')
    return 'Your evergreens are giving birds and overwintering insects a place to shelter through winter.'

  // Upcoming benefit: a pollinator plant with a bloom window ahead.
  const upcoming = [...groups.preBloom, ...planted].find(
    (r) =>
      POLLINATOR_PATTERN.test(benefits(r)) &&
      getBloomStatus(r.plant.bloom_months ?? [], today) !== 'blooming' &&
      (r.plant.bloom_months ?? []).length > 0
  )
  if (upcoming) {
    const nextMonth = nextBloomMonth(upcoming.plant.bloom_months ?? [], today)
    return `When ${upcoming.plant.common_name} blooms in ${monthName(nextMonth)}, it'll become an important nectar source for bees and butterflies.`
  }

  // "Resting" only when nothing is in bloom; a garden can reach here while
  // blooming if none of its plants carry ecosystem keywords (rare: 177/201
  // catalog plants mention pollinators).
  return groups.blooming.length > 0
    ? 'Your garden is quietly supporting more life than it lets on.'
    : 'Even at rest, your garden still provides habitat for local wildlife.'
}

/** The next month (1-12) a bloom window opens, relative to today. */
function nextBloomMonth(bloomMonths: number[], today: Date): number {
  const currentMonth = today.getMonth() + 1
  const ahead = bloomMonths.filter((m) => m > currentMonth)
  return ahead.length > 0 ? Math.min(...ahead) : Math.min(...bloomMonths)
}
