// Pure logic for the "native to my area" discovery lens. Client-safe.
//
// A plant's `native_region` carries WGSRPD Level-2 tags (Option A — see
// scripts/regenerate-native-region.ts). This resolves a garden's location to
// the same Level-2 vocabulary and tells you whether a plant is native there.
//
// Framing (locked in the Region Data Model decision): native is an OPTIONAL
// discovery lens, never the default axis. There is no filter UI yet — this is
// the capability a filter element will call once designed.
//
// Location→region uses the garden's `country`. That is exact for the European
// users v1 targets (Croatia → Southeastern Europe) and needs no bundled
// geodata. A few trans-region countries (USA, Russia, Canada) map to several
// regions; refining those with lat/lon via point-in-polygon is a later upgrade.
import type { DbPlant } from './plants-db'
import type { Garden } from '@/types/garden'

// WGSRPD Level-2 region names (must match the plant tag vocabulary exactly).
export type L2Region =
  | 'Northern Europe'
  | 'Middle Europe'
  | 'Southwestern Europe'
  | 'Southeastern Europe'
  | 'Eastern Europe'
  | 'Northern Africa'
  | 'Macaronesia'
  | 'Caucasus'
  | 'Western Asia'
  | 'Arabian Peninsula'
  | 'Middle Asia'
  | 'Siberia'
  | 'Russian Far East'
  | 'China'
  | 'Mongolia'
  | 'Eastern Asia'
  | 'Indian Subcontinent'
  | 'Indo-China'
  | 'Malesia'
  | 'Australia'
  | 'New Zealand'
  | 'Subarctic America'
  | 'Western Canada'
  | 'Eastern Canada'
  | 'Northwestern U.S.A.'
  | 'North-Central U.S.A.'
  | 'Northeastern U.S.A.'
  | 'Southwestern U.S.A.'
  | 'South-Central U.S.A.'
  | 'Southeastern U.S.A.'
  | 'Mexico'
  | 'Southern Africa'
  | 'Brazil'
  | 'Southern South America'

// Country (as Open-Meteo returns garden.country) → WGSRPD Level-2 region(s).
// Europe / the Mediterranean / Western Asia are covered exactly; the rest is
// best-effort. An uncovered country returns [] and the caller shows a "we can't
// tell your region yet" state rather than a wrong or empty result grid.
const COUNTRY_TO_REGIONS: Record<string, L2Region[]> = {
  // --- Southeastern Europe (WGSRPD 13 — includes the ex-Yugoslav "YUG" unit) ---
  Croatia: ['Southeastern Europe'],
  Slovenia: ['Southeastern Europe'],
  'Bosnia and Herzegovina': ['Southeastern Europe'],
  Serbia: ['Southeastern Europe'],
  Montenegro: ['Southeastern Europe'],
  'North Macedonia': ['Southeastern Europe'],
  Macedonia: ['Southeastern Europe'],
  Kosovo: ['Southeastern Europe'],
  Albania: ['Southeastern Europe'],
  Greece: ['Southeastern Europe'],
  Italy: ['Southeastern Europe'],
  Bulgaria: ['Southeastern Europe'],
  Romania: ['Southeastern Europe'],
  Malta: ['Southeastern Europe'],
  'San Marino': ['Southeastern Europe'],
  'Vatican City': ['Southeastern Europe'],
  // --- Southwestern Europe (12) ---
  Spain: ['Southwestern Europe'],
  Portugal: ['Southwestern Europe'],
  France: ['Southwestern Europe'],
  Andorra: ['Southwestern Europe'],
  Monaco: ['Southwestern Europe'],
  // --- Middle Europe (11) ---
  Germany: ['Middle Europe'],
  Austria: ['Middle Europe'],
  Switzerland: ['Middle Europe'],
  Liechtenstein: ['Middle Europe'],
  Belgium: ['Middle Europe'],
  Netherlands: ['Middle Europe'],
  Luxembourg: ['Middle Europe'],
  Poland: ['Middle Europe'],
  Czechia: ['Middle Europe'],
  'Czech Republic': ['Middle Europe'],
  Slovakia: ['Middle Europe'],
  Hungary: ['Middle Europe'],
  // --- Northern Europe (10) ---
  'United Kingdom': ['Northern Europe'],
  Ireland: ['Northern Europe'],
  Denmark: ['Northern Europe'],
  Norway: ['Northern Europe'],
  Sweden: ['Northern Europe'],
  Finland: ['Northern Europe'],
  Iceland: ['Northern Europe'],
  // --- Eastern Europe (14) ---
  Estonia: ['Eastern Europe'],
  Latvia: ['Eastern Europe'],
  Lithuania: ['Eastern Europe'],
  Belarus: ['Eastern Europe'],
  Ukraine: ['Eastern Europe'],
  Moldova: ['Eastern Europe'],
  // --- Caucasus (33) ---
  Georgia: ['Caucasus'],
  Armenia: ['Caucasus'],
  Azerbaijan: ['Caucasus'],
  // --- Western Asia (34) ---
  Turkey: ['Western Asia', 'Southeastern Europe'],
  Cyprus: ['Western Asia'],
  Syria: ['Western Asia'],
  Lebanon: ['Western Asia'],
  Israel: ['Western Asia'],
  Palestine: ['Western Asia'],
  Jordan: ['Western Asia'],
  Iraq: ['Western Asia'],
  Iran: ['Western Asia'],
  Afghanistan: ['Western Asia'],
  // --- Northern Africa (20) ---
  Morocco: ['Northern Africa'],
  Algeria: ['Northern Africa'],
  Tunisia: ['Northern Africa'],
  Libya: ['Northern Africa'],
  Egypt: ['Northern Africa'],
  // --- Middle Asia (32) ---
  Kazakhstan: ['Middle Asia'],
  Kyrgyzstan: ['Middle Asia'],
  Tajikistan: ['Middle Asia'],
  Turkmenistan: ['Middle Asia'],
  Uzbekistan: ['Middle Asia'],
  // --- trans-region countries (coarse until lat/lon refinement) ---
  Russia: ['Eastern Europe', 'Siberia', 'Russian Far East', 'Caucasus'],
  'United States': [
    'Northwestern U.S.A.',
    'North-Central U.S.A.',
    'Northeastern U.S.A.',
    'Southwestern U.S.A.',
    'South-Central U.S.A.',
    'Southeastern U.S.A.',
  ],
  Canada: ['Subarctic America', 'Western Canada', 'Eastern Canada'],
  Mexico: ['Mexico'],
  China: ['China'],
  Mongolia: ['Mongolia'],
  Japan: ['Eastern Asia'],
  'South Korea': ['Eastern Asia'],
  'North Korea': ['Eastern Asia'],
  Taiwan: ['Eastern Asia'],
  India: ['Indian Subcontinent'],
  Pakistan: ['Indian Subcontinent'],
  Nepal: ['Indian Subcontinent'],
  Australia: ['Australia'],
  'New Zealand': ['New Zealand'],
  'South Africa': ['Southern Africa'],
  Brazil: ['Brazil'],
  Argentina: ['Southern South America'],
  Chile: ['Southern South America'],
}

/**
 * The WGSRPD Level-2 region(s) a garden's location maps to. Empty when the
 * garden has no country yet, or the country isn't in the table — callers should
 * treat [] as "region unknown", not "no natives".
 */
export function regionsForGarden(garden: Pick<Garden, 'country'>): L2Region[] {
  if (!garden.country) return []
  return COUNTRY_TO_REGIONS[garden.country.trim()] ?? []
}

/**
 * Whether we can place the garden in a region at all — drives the difference
 * between an honest "few natives in our catalog for your area yet" empty state
 * and a "tell us where you garden" prompt.
 */
export function canResolveRegion(garden: Pick<Garden, 'country'>): boolean {
  return regionsForGarden(garden).length > 0
}

/** Whether a plant is native to the garden's region(s). */
export function isNativeToMyArea(
  plant: Pick<DbPlant, 'native_region'>,
  garden: Pick<Garden, 'country'>
): boolean {
  const regions = regionsForGarden(garden)
  if (regions.length === 0) return false
  const tags = plant.native_region ?? []
  return tags.some((t) => (regions as string[]).includes(t))
}

/** Filter a loaded plant list down to those native to the garden's area. */
export function filterNativeToMyArea<T extends Pick<DbPlant, 'native_region'>>(
  plants: T[],
  garden: Pick<Garden, 'country'>
): T[] {
  const regions = regionsForGarden(garden)
  if (regions.length === 0) return []
  return plants.filter((p) =>
    (p.native_region ?? []).some((t) => (regions as string[]).includes(t))
  )
}
