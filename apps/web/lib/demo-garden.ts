// SERVER-ONLY — the content of the demo garden handed to a visitor who picks
// "Look around first" on /login.
//
// A demo visitor is an ordinary anonymous Supabase user (auth.users.is_anonymous),
// so the signup trigger has already given them a profile and an empty garden by
// the time we get here. This module fills that garden in: a location, a palette,
// and a short diary history, all written through the visitor's own session
// client so RLS scopes every row to them. Nothing here is shared between
// visitors — two people looking around at once each get their own garden.
//
// Why the garden is seeded rather than left empty: the app's own first-run gate
// sends a location-less garden to /welcome, and an empty palette shows every
// surface in its empty state. Neither is what someone came to look at.
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Opatija — chosen over Zadar because the Kvarner microclimate is mild and wet
 * enough that the demo palette isn't all drought survivors, and the garden has
 * something going on whatever month a visitor arrives. Coordinates are pinned
 * rather than geocoded at runtime: there are three Opatijas in Croatia, and the
 * demo should not depend on a network call to the geocoder to start.
 */
export const DEMO_LOCATION = {
  city: 'Opatija',
  country: 'Croatia',
  lat: 45.33658,
  lon: 14.30782,
} as const

interface DemoPaletteEntry {
  /** Matched against plants.scientific_name — never a hardcoded UUID, which
   *  would rot the first time a round re-seeds the catalog. */
  scientificName: string
  status: 'planted' | 'planned'
  /** Days before "now" the row was added, so the garden reads as established. */
  addedDaysAgo: number
}

/**
 * Eight plants: five planted, three planned. Every one has a real hero image
 * and both `seasonal_care` and `seasonal_rhythm` populated, so Care Tips and
 * the growing-card stage notes have something to say rather than falling back.
 *
 * The planted five all have something happening in high summer; the planned
 * three deliberately peak in other seasons, so the Planned list reads as a plan
 * rather than more of the same. Ornamental-first: the edible-leaning catalog
 * candidates (raspberry, Jerusalem artichoke, cardoon) are left out, and so is
 * trumpet creeper, which is a thug on a coastal wall and shouldn't be modelled
 * as a good idea.
 */
export const DEMO_PALETTE: DemoPaletteEntry[] = [
  { scientificName: 'Myrtus communis', status: 'planted', addedDaysAgo: 240 },
  {
    scientificName: 'Hydrangea paniculata',
    status: 'planted',
    addedDaysAgo: 240,
  },
  {
    scientificName: 'Vitex agnus-castus',
    status: 'planted',
    addedDaysAgo: 96,
  },
  { scientificName: 'Stipa gigantea', status: 'planted', addedDaysAgo: 96 },
  {
    scientificName: 'Jasminum officinale',
    status: 'planted',
    addedDaysAgo: 21,
  },
  { scientificName: 'Clematis cirrhosa', status: 'planned', addedDaysAgo: 9 },
  { scientificName: 'Cistus ladanifer', status: 'planned', addedDaysAgo: 4 },
  { scientificName: 'Rosa glauca', status: 'planned', addedDaysAgo: 4 },
]

interface DemoDiaryEntry {
  scientificName: string
  daysAgo: number
  eventTypes: string[]
  note: string | null
}

/**
 * A short diary history. Two jobs beyond looking lived-in:
 *
 *  - the jasmine's "planted" event sits 21 days back with no watering logged
 *    since, which lands inside the 14-60 day woody-plant window in
 *    CARE_EVENT_RULES — so the dashboard shows a real, earned Care Tip instead
 *    of only generic seasonal guidance.
 *  - the entries are garden+plant keyed (not palette-row keyed), matching the
 *    July 2026 schema change, so they survive a plant leaving the palette.
 *
 * No photos: the diary-photos bucket is private and signed-URL only, and a
 * seeded photo would mean shipping an image through storage on every demo
 * signup for very little payoff.
 */
export const DEMO_DIARY: DemoDiaryEntry[] = [
  {
    scientificName: 'Jasminum officinale',
    daysAgo: 21,
    eventTypes: ['planted'],
    note: 'Planted against the east wall, where it gets morning sun.',
  },
  {
    scientificName: 'Hydrangea paniculata',
    daysAgo: 12,
    eventTypes: ['pruned', 'watered'],
    note: 'Took out the spent heads. Flowering harder than last year.',
  },
  {
    scientificName: 'Vitex agnus-castus',
    daysAgo: 3,
    eventTypes: [],
    note: 'Covered in bees all afternoon.',
  },
]

/** An ISO timestamp `days` before `now`, for backdating seeded rows. */
function daysBefore(now: Date, days: number): string {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export interface SeedDemoGardenResult {
  paletteRows: number
  diaryRows: number
  /** Scientific names in DEMO_PALETTE with no matching catalog row. */
  missing: string[]
}

/**
 * Fills a freshly provisioned garden with the demo content. Runs through the
 * visitor's session client, so every insert is subject to the same RLS the real
 * app runs under — if this function can write it, the visitor owns it.
 *
 * Plants are resolved by scientific name in one query. A name that no longer
 * matches the catalog is skipped and reported rather than thrown: a demo that
 * opens with seven plants because a round renamed one is far better than a demo
 * that 500s. Callers should log `missing`.
 */
export async function seedDemoGarden(
  supabase: SupabaseClient,
  gardenId: string,
  now: Date = new Date()
): Promise<SeedDemoGardenResult> {
  const { error: locationError } = await supabase
    .from('gardens')
    .update({
      city: DEMO_LOCATION.city,
      country: DEMO_LOCATION.country,
      lat: DEMO_LOCATION.lat,
      lon: DEMO_LOCATION.lon,
    })
    .eq('id', gardenId)

  if (locationError)
    throw new Error(`Demo seed: location failed: ${locationError.message}`)

  const names = DEMO_PALETTE.map((entry) => entry.scientificName)
  const { data: plants, error: plantsError } = await supabase
    .from('plants')
    .select('id, scientific_name')
    .in('scientific_name', names)

  if (plantsError)
    throw new Error(`Demo seed: plant lookup failed: ${plantsError.message}`)

  const idByName = new Map<string, string>(
    (plants ?? []).map((p) => [p.scientific_name as string, p.id as string])
  )
  const missing = names.filter((name) => !idByName.has(name))

  const paletteRows = DEMO_PALETTE.flatMap((entry) => {
    const plantId = idByName.get(entry.scientificName)
    if (!plantId) return []
    return [
      {
        garden_id: gardenId,
        plant_id: plantId,
        status: entry.status,
        // Not 'generated': nothing generated this palette, and 'manual' is what
        // the app writes when a person adds a plant themselves — which is the
        // fiction the demo garden is telling.
        source: 'manual',
        added_at: daysBefore(now, entry.addedDaysAgo),
      },
    ]
  })

  if (paletteRows.length > 0) {
    const { error } = await supabase.from('palette_plants').insert(paletteRows)
    if (error) throw new Error(`Demo seed: palette failed: ${error.message}`)
  }

  const diaryRows = DEMO_DIARY.flatMap((entry) => {
    const plantId = idByName.get(entry.scientificName)
    if (!plantId) return []
    return [
      {
        garden_id: gardenId,
        plant_id: plantId,
        note: entry.note,
        event_types: entry.eventTypes,
        created_at: daysBefore(now, entry.daysAgo),
      },
    ]
  })

  if (diaryRows.length > 0) {
    const { error } = await supabase.from('diary_entries').insert(diaryRows)
    if (error) throw new Error(`Demo seed: diary failed: ${error.message}`)
  }

  return {
    paletteRows: paletteRows.length,
    diaryRows: diaryRows.length,
    missing,
  }
}
