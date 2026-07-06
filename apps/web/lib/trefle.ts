const BASE_URL = 'https://trefle.io'

function getApiToken(): string {
  const token = process.env['TREFLE_API_KEY']
  if (!token) throw new Error('TREFLE_API_KEY is not set')
  return token
}

// ---------------------------------------------------------------------------
// Trefle API response shapes (confirmed against docs.trefle.io)
// ---------------------------------------------------------------------------

interface TrefleImage {
  id: number
  image_url: string | null
  copyright: string | null
}

// Named keys reflect the documented categories; the index signature captures
// undocumented keys Trefle occasionally returns (e.g. the empty-string "").
interface TrefleImages {
  flower?: TrefleImage[] | null
  leaf?: TrefleImage[] | null
  habit?: TrefleImage[] | null
  fruit?: TrefleImage[] | null
  bark?: TrefleImage[] | null
  other?: TrefleImage[] | null
  [key: string]: TrefleImage[] | null | undefined
}

// Returned by list/search endpoints — subset of fields
export interface TrefleListItem {
  id: number
  slug: string
  common_name: string | null
  scientific_name: string
  image_url: string | null
  family: string | null
  genus: string | null
  rank: string | null
  status: string | null
  links: {
    self: string
    plant: string
    genus: string
  }
}

interface TrefleHeightObject {
  cm: number | null
}

interface TrefleTemperature {
  deg_c: number | null
  deg_f: number | null
}

interface TrefleSpecifications {
  average_height: TrefleHeightObject | null
  maximum_height: TrefleHeightObject | null
  growth_rate: string | null
  growth_habit: string | null
  growth_form: string | null
  ligneous_type: string | null
  toxicity: string | null
}

interface TrefleGrowth {
  // 0 (no light) – 10 (full sun / 100 000 lux)
  light: number | null
  // 0 (dry / xerophile) – 10 (subaquatic)
  soil_humidity: number | null
  // 0 (<=10% RH) – 10 (>=90% RH)
  atmospheric_humidity: number | null
  // month abbreviations: 'jan' | 'feb' | ... | 'dec'
  bloom_months: string[] | null
  growth_months: string[] | null
  minimum_temperature: TrefleTemperature | null
  maximum_temperature: TrefleTemperature | null
  description: string | null
  sowing: string | null
  ph_minimum: number | null
  ph_maximum: number | null
  soil_nutriments: number | null
}

// Returned by species detail endpoint — full fields
export interface TrefleDetail extends TrefleListItem {
  images: TrefleImages | null
  specifications: TrefleSpecifications | null
  growth: TrefleGrowth | null
  flower: {
    color: string[] | null
    conspicuous: boolean | null
  } | null
  foliage: {
    texture: string | null
    color: string[] | null
    leaf_retention: boolean | null
  } | null
  synonyms: Array<{ id: number; name: string; author: string | null }> | null
  // common_names is keyed by ISO 639-3 language code, value is array of names
  common_names: Record<string, string[]> | null
  // distribution (singular, flat) has simple string arrays — easier to use
  // than the richer distributions (plural) object which has full zone objects
  distribution: {
    native: string[] | null
    introduced: string[] | null
  } | null
}

interface TrefleListResponse {
  data: TrefleListItem[]
  links: {
    self: string
    first: string | null
    last: string | null
    next: string | null
    prev: string | null
  }
  meta: { total: number }
}

interface TrefleDetailResponse {
  data: TrefleDetail
}

// ---------------------------------------------------------------------------
// Mapped type — what we store in our plants table
// ---------------------------------------------------------------------------

export interface MappedPlant {
  source_species_id: number
  data_source: 'trefle'
  common_name: string
  common_name_aliases: string[]
  scientific_name: string | null
  family: string | null
  native_to: string | null
  description: string | null
  // Trefle has no care_level equivalent; left null — do not fabricate
  care_level: null
  bloom_months: number[]
  peak_season: 'spring' | 'summer' | 'autumn' | 'winter' | null
  height_min_cm: number | null
  height_max_cm: number | null
  hardiness_zone_min: number | null
  // Trefle max temp doesn't cleanly map to max hardiness zone
  hardiness_zone_max: null
  sun_requirements: Array<'full_sun' | 'partial_sun' | 'shade'>
  image_url: string | null
  image_urls: string[]
  is_curated: false
}

// ---------------------------------------------------------------------------
// Field mappers
// ---------------------------------------------------------------------------

// Month abbreviation → 1-based month number
const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

function mapBloomMonths(raw: string[] | null | undefined): number[] {
  if (!raw?.length) return []
  const months = raw
    .map((abbr) => MONTH_ABBR[abbr.toLowerCase().trim()])
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)
  return [...new Set(months)]
}

type SeasonValue = 'spring' | 'summer' | 'autumn' | 'winter'

// Derive the peak season from which season has the most bloom months
const SEASON_FOR_MONTH: Record<number, SeasonValue> = {
  3: 'spring',
  4: 'spring',
  5: 'spring',
  6: 'summer',
  7: 'summer',
  8: 'summer',
  9: 'autumn',
  10: 'autumn',
  11: 'autumn',
  12: 'winter',
  1: 'winter',
  2: 'winter',
}

function derivePeakSeason(bloomMonths: number[]): SeasonValue | null {
  if (!bloomMonths.length) return null
  const counts = new Map<SeasonValue, number>()
  for (const m of bloomMonths) {
    const s = SEASON_FOR_MONTH[m]
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  if (!counts.size) return null
  // Return the season with the most bloom months; first entry wins on tie
  return [...counts.entries()].reduce((best, curr) =>
    curr[1] > best[1] ? curr : best
  )[0]
}

type SunValue = 'full_sun' | 'partial_sun' | 'shade'

/**
 * Trefle light is an integer 0–10:
 *   0–3  → shade
 *   4–6  → partial_sun
 *   7–10 → full_sun
 */
function mapLight(light: number | null | undefined): SunValue[] {
  if (light == null) return []
  if (light <= 3) return ['shade']
  if (light <= 6) return ['partial_sun']
  return ['full_sun']
}

/**
 * USDA Hardiness Zone lookup from minimum tolerable temperature (°C).
 * Zone boundaries (lower temp limit for each zone):
 * https://planthardiness.ars.usda.gov/
 */
const HARDINESS_ZONE_THRESHOLDS: Array<[number, number]> = [
  [-51.1, 1],
  [-45.6, 2],
  [-40.0, 3],
  [-34.4, 4],
  [-28.9, 5],
  [-23.3, 6],
  [-17.8, 7],
  [-12.2, 8],
  [-6.7, 9],
  [-1.1, 10],
  [4.4, 11],
  [10.0, 12],
]

function minTempToHardinessZone(tempC: number): number {
  for (const [threshold, zone] of HARDINESS_ZONE_THRESHOLDS) {
    if (tempC < threshold) return zone
  }
  return 13
}

function mapHardinessZoneMin(
  growth: TrefleGrowth | null | undefined
): number | null {
  const tempC = growth?.minimum_temperature?.deg_c
  if (tempC == null) return null
  return minTempToHardinessZone(tempC)
}

function mapHeight(specs: TrefleSpecifications | null | undefined): {
  height_min_cm: number | null
  height_max_cm: number | null
} {
  // Trefle provides average_height and maximum_height in centimetres.
  // We use average as a reasonable proxy for the "typical minimum" height.
  const avg = specs?.average_height?.cm ?? null
  const max = specs?.maximum_height?.cm ?? null
  return {
    height_min_cm: avg != null ? Math.round(avg) : null,
    height_max_cm: max != null ? Math.round(max) : null,
  }
}

// Priority order for selecting the single hero image_url.
// Categories not in this list (including undocumented ones) still end up in
// image_urls — they just don't win the hero slot.
const IMAGE_PRIORITY: string[] = [
  'flower',
  'habit',
  'leaf',
  'fruit',
  'bark',
  'other',
]

/**
 * Select a hero image_url (first image from the highest-priority category
 * present) and collect every URL from every category into image_urls.
 * Iterates Object.keys so undocumented categories (e.g. Trefle's empty-string
 * key "") are included rather than silently dropped.
 */
function mapImages(images: TrefleImages | null | undefined): {
  image_url: string | null
  image_urls: string[]
} {
  if (!images) return { image_url: null, image_urls: [] }

  // Collect all URLs keyed by category for priority resolution
  const byCategory: Record<string, string[]> = {}
  for (const cat of Object.keys(images)) {
    const imgs = images[cat]
    if (!imgs?.length) continue
    const urls = imgs
      .map((img) => img.image_url)
      .filter((u): u is string => u != null)
    if (urls.length) byCategory[cat] = urls
  }

  // Pick hero from preferred categories in order; fall back to any category
  let primary: string | null = null
  for (const cat of IMAGE_PRIORITY) {
    if (byCategory[cat]?.length) {
      primary = byCategory[cat]?.[0] ?? null
      break
    }
  }
  if (!primary) {
    const firstCat = Object.keys(byCategory)[0]
    primary = firstCat ? (byCategory[firstCat]?.[0] ?? null) : null
  }

  const all = Object.values(byCategory).flat()
  return {
    image_url: primary,
    image_urls: [...new Set(all)],
  }
}

/**
 * Extract English common name aliases, excluding the primary common_name
 * already stored in the common_name column.
 */
function mapCommonNameAliases(
  commonNames: Record<string, string[]> | null | undefined,
  primaryName: string
): string[] {
  const eng = commonNames?.['eng'] ?? []
  return eng.filter((n) => n.toLowerCase() !== primaryName.toLowerCase())
}

/**
 * Join the flat native distribution string array into a short phrase.
 * e.g. ["France", "Italy", "Spain"] → "France, Italy, Spain"
 */
function mapNativeTo(
  distribution: { native: string[] | null } | null | undefined
): string | null {
  const places = distribution?.native
  if (!places?.length) return null
  return places.join(', ')
}

// ---------------------------------------------------------------------------
// Main mapper
// ---------------------------------------------------------------------------

export function mapTrefleDetail(detail: TrefleDetail): MappedPlant {
  const bloomMonths = mapBloomMonths(detail.growth?.bloom_months)
  const { image_url, image_urls } = mapImages(detail.images)
  const { height_min_cm, height_max_cm } = mapHeight(detail.specifications)

  const commonName = detail.common_name ?? detail.scientific_name

  return {
    source_species_id: detail.id,
    data_source: 'trefle',
    common_name: commonName,
    common_name_aliases: mapCommonNameAliases(detail.common_names, commonName),
    scientific_name: detail.scientific_name ?? null,
    family: detail.family ?? null,
    native_to: mapNativeTo(detail.distribution),
    description: detail.growth?.description ?? null,
    care_level: null,
    bloom_months: bloomMonths,
    peak_season: derivePeakSeason(bloomMonths),
    height_min_cm,
    height_max_cm,
    hardiness_zone_min: mapHardinessZoneMin(detail.growth),
    hardiness_zone_max: null,
    sun_requirements: mapLight(detail.growth?.light),
    image_url,
    image_urls,
    is_curated: false,
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function trefleFetch<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `Trefle API error ${res.status} for ${path}: ${await res.text()}`
    )
  }
  return res.json() as Promise<T>
}

/**
 * Search plants by name. Uses /api/v1/plants/search which searches main
 * species only (no subspecies/varieties), giving cleaner results for
 * common name lookups.
 */
export async function searchSpeciesByName(
  name: string,
  page = 1
): Promise<TrefleListItem[]> {
  const token = getApiToken()
  const params = new URLSearchParams({
    token,
    q: name,
    page: String(page),
  })
  const data = await trefleFetch<TrefleListResponse>(
    `/api/v1/plants/search?${params}`
  )
  return data.data ?? []
}

/**
 * Fetch full species detail by slug (preferred, e.g. 'cocos-nucifera')
 * or numeric ID. Trefle recommends slugs over IDs where possible.
 */
export async function getSpeciesBySlug(
  slugOrId: string | number
): Promise<TrefleDetail> {
  const token = getApiToken()
  const params = new URLSearchParams({ token })
  const response = await trefleFetch<TrefleDetailResponse>(
    `/api/v1/species/${slugOrId}?${params}`
  )
  return response.data
}

/**
 * Convenience: fetch detail by slug/ID and map to our DB shape.
 */
export async function fetchAndMapSpecies(
  slugOrId: string | number
): Promise<MappedPlant> {
  const detail = await getSpeciesBySlug(slugOrId)
  return mapTrefleDetail(detail)
}
