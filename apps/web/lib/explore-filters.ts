// Pure logic + vocabularies for the Explore filter row. Client-safe.
//
// Semantics (Ana, July 13 2026): multi-select within an axis is OR, axes
// combine with AND. Sun matches `sun_thrives` only — a filter promises
// "thrives here", not "survives here"; the richer thrives-vs-tolerates
// presentation is a post-test item. Bloom season derives from `bloom_months`
// (never `peak_season`, which is only ~22% filled). Native-to-my-region is
// an optional discovery lens per the Region Data Model decision — the chip
// only renders when the garden's region resolves (see lib/native-to-me.ts).
import { bucketsForPlant } from '@/lib/bloom-colors'
import type { CatalogPlant } from '@/types/garden'

export interface ExploreFilterState {
  /** plant_type values, e.g. "perennial" */
  types: string[]
  /** sun_thrives values: full_sun | partial_sun | shade */
  sun: string[]
  /** meteorological seasons: spring | summer | autumn | winter */
  seasons: string[]
  /** style_tags values, e.g. "cottage" */
  styles: string[]
  /** canonical bloom color buckets — see lib/bloom-colors.ts */
  colors: string[]
  /** limit to plants native to the garden's region(s) */
  nativeOnly: boolean
}

export const EMPTY_FILTERS: ExploreFilterState = {
  types: [],
  sun: [],
  seasons: [],
  styles: [],
  colors: [],
  nativeOnly: false,
}

export interface FilterOption {
  value: string
  label: string
}

// Ordered by catalog frequency so the common choices lead the row.
export const TYPE_OPTIONS: FilterOption[] = [
  { value: 'perennial', label: 'Perennial' },
  { value: 'shrub', label: 'Shrub' },
  { value: 'bulb', label: 'Bulb' },
  { value: 'grass', label: 'Grass' },
  { value: 'climber', label: 'Climber' },
  { value: 'tree', label: 'Tree' },
  { value: 'biennial', label: 'Biennial' },
  { value: 'annual', label: 'Annual' },
  { value: 'succulent', label: 'Succulent' },
]

export const SUN_OPTIONS: FilterOption[] = [
  { value: 'full_sun', label: 'Full sun' },
  { value: 'partial_sun', label: 'Partial sun' },
  { value: 'shade', label: 'Shade' },
]

export const SEASON_OPTIONS: FilterOption[] = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'winter', label: 'Winter' },
]

export const STYLE_OPTIONS: FilterOption[] = [
  { value: 'cottage', label: 'Cottage' },
  { value: 'classic', label: 'Classic' },
  { value: 'wildflower', label: 'Wildflower' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'lush', label: 'Lush' },
  { value: 'modern', label: 'Modern' },
]

const SEASON_MONTHS: Record<string, number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
}

/** How many filters are active — drives the icon indicator and clear button. */
export function countActiveFilters(f: ExploreFilterState): number {
  return (
    f.types.length +
    f.sun.length +
    f.seasons.length +
    f.styles.length +
    f.colors.length +
    (f.nativeOnly ? 1 : 0)
  )
}

/** Toggle one value in a multi-select axis. */
export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value]
}

/**
 * Whether a plant passes the active filters. `gardenRegions` is the garden's
 * resolved WGSRPD Level-2 region list (empty = region unknown; the native
 * chip shouldn't be reachable then, but an empty list fails closed).
 */
export function matchesFilters(
  plant: CatalogPlant,
  f: ExploreFilterState,
  gardenRegions: string[]
): boolean {
  if (f.types.length > 0 && !f.types.includes(plant.plantType)) return false

  if (f.sun.length > 0 && !f.sun.some((s) => plant.sunThrives.includes(s)))
    return false

  if (f.seasons.length > 0) {
    const months = new Set(f.seasons.flatMap((s) => SEASON_MONTHS[s] ?? []))
    if (!plant.bloomMonths.some((m) => months.has(m))) return false
  }

  if (f.styles.length > 0 && !f.styles.some((s) => plant.styleTags.includes(s)))
    return false

  if (f.colors.length > 0) {
    const buckets = bucketsForPlant(plant.bloomColor)
    if (!f.colors.some((c) => buckets.includes(c))) return false
  }

  if (f.nativeOnly) {
    if (gardenRegions.length === 0) return false
    if (!plant.nativeRegion.some((r) => gardenRegions.includes(r))) return false
  }

  return true
}
