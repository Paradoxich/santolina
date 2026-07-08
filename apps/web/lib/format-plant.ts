// Pure display formatters for plant data. Client-safe — no Supabase imports.
import type { DbPlant } from './plants-db'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? ''
}

/**
 * "Salvia nemorosa, the woodland sage, Balkan clary or blue sage."
 * Handles any number of aliases; caps at 4 to keep the line readable.
 */
export function formatPlantSubtitle(
  scientificName: string | null,
  aliases: string[]
): string | null {
  const shown = aliases.filter(Boolean).slice(0, 4)
  if (!scientificName && shown.length === 0) return null
  if (!scientificName) return `Also known as ${joinWithOr(shown)}.`
  if (shown.length === 0) return `${scientificName}.`
  return `${scientificName}, the ${joinWithOr(shown)}.`
}

function joinWithOr(items: string[]): string {
  if (items.length === 1) return items[0]!
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

/**
 * First and last month of a bloom window, treating the months as a
 * circular range (the window starts just after the largest gap, so
 * [11, 12, 1, 2] → [11, 2]). Returns null for an empty list.
 */
function bloomRangeEndpoints(
  months: number[] | null
): [first: number, last: number] | null {
  if (!months || months.length === 0) return null
  const unique = [...new Set(months)].sort((a, b) => a - b)
  if (unique.length === 1) return [unique[0]!, unique[0]!]

  // Find the largest circular gap; the range starts just after it.
  let gapStart = unique.length - 1
  let largestGap = unique[0]! + 12 - unique[unique.length - 1]!
  for (let i = 0; i < unique.length - 1; i++) {
    const gap = unique[i + 1]! - unique[i]!
    if (gap > largestGap) {
      largestGap = gap
      gapStart = i
    }
  }
  return [unique[(gapStart + 1) % unique.length]!, unique[gapStart]!]
}

/**
 * Derive a "May → July" range from bloom month integers. Handles a
 * single month ("May") and ranges that wrap the year boundary
 * ("November → February"). Returns null for an empty list.
 */
export function formatBloomRange(months: number[] | null): string | null {
  const endpoints = bloomRangeEndpoints(months)
  if (!endpoints) return null
  const [first, last] = endpoints
  if (first === last) return monthName(first)
  return `${monthName(first)} → ${monthName(last)}`
}

/** Compact "Apr–May" variant of formatBloomRange, for tight card rows. */
export function formatBloomRangeShort(months: number[] | null): string | null {
  const endpoints = bloomRangeEndpoints(months)
  if (!endpoints) return null
  const [first, last] = endpoints
  if (first === last) return monthName(first).slice(0, 3)
  return `${monthName(first).slice(0, 3)}–${monthName(last).slice(0, 3)}`
}

const SUN_LABELS: Record<string, string> = {
  full_sun: 'Full sun',
  partial_sun: 'Partial sun',
  shade: 'Shade',
}

/** ['full_sun', 'partial_sun'] → "Full sun/Partial sun" */
export function formatExposure(sun: string[] | null): string | null {
  if (!sun || sun.length === 0) return null
  return sun
    .map((s) => SUN_LABELS[s] ?? capitalize(s.replace(/_/g, ' ')))
    .join('/')
}

/** "30–90 cm", "Up to 90 cm", "From 30 cm", or null. */
export function formatCmRange(
  min: number | null,
  max: number | null
): string | null {
  if (min != null && max != null) {
    return min === max ? `${min} cm` : `${min}–${max} cm`
  }
  if (max != null) return `Up to ${max} cm`
  if (min != null) return `From ${min} cm`
  return null
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** plant_type_label with fallback to the capitalized plant_type enum. */
export function formatPlantType(plant: DbPlant): string | null {
  if (plant.plant_type_label) return plant.plant_type_label
  if (plant.plant_type) return capitalize(plant.plant_type)
  return null
}

/**
 * water_needs_summary with fallback to the first sentence of the
 * longer water_needs prose, truncated if that's still too long.
 */
export function formatWaterNeedsSummary(plant: DbPlant): string | null {
  if (plant.water_needs_summary) return plant.water_needs_summary
  if (!plant.water_needs) return null
  const firstSentence = plant.water_needs.split(/(?<=\.)\s/)[0]!
  if (firstSentence.length <= 60) return firstSentence
  return `${firstSentence.slice(0, 57).trimEnd()}…`
}

const LIGHT_SENTENCES: Record<string, string> = {
  full_sun: 'Performs best in full sun.',
  partial_sun: 'Happy in partial sun.',
  shade: 'Grows well in shade.',
}

/** light_needs prose with fallback derived from sun_requirements. */
export function formatLightNeeds(plant: DbPlant): string | null {
  if (plant.light_needs) return plant.light_needs
  if (!plant.sun_requirements || plant.sun_requirements.length === 0)
    return null
  return plant.sun_requirements
    .map((s) => LIGHT_SENTENCES[s])
    .filter(Boolean)
    .join(' ')
}

/** garden_use_tags → "Pollinator gardens, Gravel gardens, Sunny borders" */
export function formatGoodFor(tags: string[] | null): string | null {
  if (!tags || tags.length === 0) return null
  return tags.map(capitalize).join(', ')
}
