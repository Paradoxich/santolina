// Pure logic + vocabularies for the Explore filter row. Client-safe.
//
// Semantics (Ana, July 13 2026): multi-select within an axis is OR, axes
// combine with AND. Sun matches `sun_thrives` only — a filter promises
// "thrives here", not "survives here"; the richer thrives-vs-tolerates
// presentation is a post-test item. Bloom season derives from `bloom_months`
// (never `peak_season`, which is only ~22% filled). Native-to-my-region is
// an optional discovery lens per the Region Data Model decision — the chip
// only renders when the garden's region resolves (see lib/native-to-me.ts).
// Colour semantics (Ana, July 24 2026): the colour axis matches plant colour
// across both axes — blooms OR distinctive foliage — via colorBucketsForPlant;
// Green additionally means curated greenery. See lib/plant-colors.ts.
import { BLOOM_COLOR_BUCKETS } from '@/lib/bloom-colors'
import { colorBucketsForPlant } from '@/lib/plant-colors'
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
 * Whether a facet label the catalog tags this plant with contains the query —
 * style, sun, type, colour or bloom season. This is what lets the plain search
 * box double as a lightweight single-facet filter (typing "modern" or "shade")
 * independent of the multi-select filter panel, and is how a browse-collection
 * tile is represented once clicked (its label is dropped straight into the
 * search box rather than the `filters` state — see ExploreClient).
 */
function matchesFacetLabel(plant: CatalogPlant, q: string): boolean {
  const facetMatches = (options: FilterOption[], values: string[]) =>
    options.some(
      (o) => o.label.toLowerCase().includes(q) && values.includes(o.value)
    )

  if (facetMatches(STYLE_OPTIONS, plant.styleTags)) return true
  if (facetMatches(SUN_OPTIONS, plant.sunThrives)) return true
  if (facetMatches(TYPE_OPTIONS, [plant.plantType])) return true

  const colorBuckets = colorBucketsForPlant(plant)
  if (
    BLOOM_COLOR_BUCKETS.some(
      (b) => b.label.toLowerCase().includes(q) && colorBuckets.includes(b.value)
    )
  )
    return true

  if (
    SEASON_OPTIONS.some(
      (s) =>
        s.label.toLowerCase().includes(q) &&
        plant.bloomMonths.some((m) =>
          (SEASON_MONTHS[s.value] ?? []).includes(m)
        )
    )
  )
    return true

  return false
}

/**
 * How well a plant matches typed search text, best first. Lower is better, so
 * these sort directly.
 *
 * The point of the ladder is that a name hit always beats a facet hit: before
 * ranking existed the results came back alphabetically, so searching "sage"
 * could put every summer-blooming plant in the catalog above Salvia itself.
 *
 * "Name" means any of the three things a person might type — common name,
 * botanical name, alias — because all three already match. Only the top tier
 * cares which one hit, and it cares for a measured reason: Lantana camara
 * carries the literal alias "sage", so on a single exact tier it tied Salvia
 * officinalis and won on alphabetical order. Searching "sage" and getting
 * lantana first is the kind of result that reads as broken, and an exact hit on
 * the plant's own primary name is the strongest signal in the catalog, so it
 * gets a tier of its own. Below that, which field matched stops mattering.
 */
export const SEARCH_RANK = {
  /** The plant's own common name is exactly the query. */
  EXACT_COMMON_NAME: 0,
  /** A botanical name or alias is exactly the query. */
  EXACT_OTHER_NAME: 1,
  /** A name starts with the query — "sage" finding "Sagebrush". */
  NAME_PREFIX: 2,
  /** A name contains the query — "sage" finding "Russian sage". */
  NAME_SUBSTRING: 3,
  /** No name matched; the plant is only here because a facet label did. */
  FACET: 4,
  /** Not a result at all. */
  NO_MATCH: 5,
} as const

export type SearchRank = (typeof SEARCH_RANK)[keyof typeof SEARCH_RANK]

export function searchRank(plant: CatalogPlant, query: string): SearchRank {
  const q = query.trim().toLowerCase()
  // No query: everything matches and nothing is more relevant than anything
  // else. The value only has to be uniform — a stable sort then leaves the
  // catalog's alphabetical order untouched.
  if (!q) return SEARCH_RANK.EXACT_COMMON_NAME

  const commonName = plant.commonName.toLowerCase()
  const otherNames = [plant.botanicalName, ...plant.aliases]
    .filter(Boolean)
    .map((n) => n.toLowerCase())
  const names = [commonName, ...otherNames]

  if (commonName === q) return SEARCH_RANK.EXACT_COMMON_NAME
  if (otherNames.some((n) => n === q)) return SEARCH_RANK.EXACT_OTHER_NAME
  if (names.some((n) => n.startsWith(q))) return SEARCH_RANK.NAME_PREFIX
  if (names.some((n) => n.includes(q))) return SEARCH_RANK.NAME_SUBSTRING
  if (matchesFacetLabel(plant, q)) return SEARCH_RANK.FACET

  return SEARCH_RANK.NO_MATCH
}

/**
 * Whether typed search text matches this plant at all. Derived from
 * `searchRank` rather than repeating its conditions, so the predicate and the
 * ranking can never disagree about what counts as a hit.
 */
export function matchesSearchTerm(plant: CatalogPlant, query: string): boolean {
  return searchRank(plant, query) !== SEARCH_RANK.NO_MATCH
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
    const buckets = colorBucketsForPlant(plant)
    if (!f.colors.some((c) => buckets.includes(c))) return false
  }

  if (f.nativeOnly) {
    if (gardenRegions.length === 0) return false
    if (!plant.nativeRegion.some((r) => gardenRegions.includes(r))) return false
  }

  return true
}

/**
 * The Explore results: everything passing the search text and the filter row,
 * best search match first.
 *
 * The sort is stable and `plants` arrives ordered by common name (see
 * getExplorePlants), so plants sharing a tier stay alphabetical — the ranking
 * only ever lifts a better match above a worse one, it never scrambles equals.
 * Ranks are computed once per plant here rather than inside the comparator,
 * which would re-derive colour buckets on every comparison.
 */
export function visiblePlants(
  plants: CatalogPlant[],
  query: string,
  filters: ExploreFilterState,
  gardenRegions: string[]
): CatalogPlant[] {
  return plants
    .map((plant) => ({ plant, rank: searchRank(plant, query) }))
    .filter(
      ({ plant, rank }) =>
        rank !== SEARCH_RANK.NO_MATCH &&
        matchesFilters(plant, filters, gardenRegions)
    )
    .sort((a, b) => a.rank - b.rank)
    .map(({ plant }) => plant)
}
