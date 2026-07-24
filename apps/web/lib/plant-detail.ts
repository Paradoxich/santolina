// SERVER-ONLY — fetches plant detail data for the drawer.
import { getSupabase } from './supabase'
import { fetchAllRows } from './paginate'
import { getSessionGardenContext } from './session-garden'
import { heroImageUrl } from './plant-image'
import type { DbPlant } from './plants-db'
import type { CatalogPlant, Garden } from '@/types/garden'

// Re-exported for existing importers; the definition now lives in the pure
// lib/plant-image.ts so it can be shared with client-safe modules.
export { heroImageUrl }

export interface CompanionPlant {
  id: string
  common_name: string
  image_url: string
}

export interface PlantDetail {
  plant: DbPlant
  companions: CompanionPlant[]
  garden: Garden
}

/** All catalog plants, shaped for the explore grid/list and its filter row. */
export async function getExplorePlants(): Promise<CatalogPlant[]> {
  const supabase = getSupabase()
  const data = await fetchAllRows<{
    id: string
    common_name: string
    scientific_name: string | null
    description: string | null
    image_url: string | null
    image_url_curated: string | null
    image_urls: string[] | null
    common_name_aliases: string[] | null
    plant_type: string | null
    style_tags: string[] | null
    sun_thrives: string[] | null
    bloom_months: number[] | null
    bloom_color: string[] | null
    foliage_color: string | null
    is_greenery: boolean
    native_region: string[] | null
  }>((from, to) =>
    supabase
      .from('plants')
      .select(
        'id, common_name, scientific_name, description, image_url, image_url_curated, image_urls, common_name_aliases, plant_type, style_tags, sun_thrives, bloom_months, bloom_color, foliage_color, is_greenery, native_region'
      )
      .order('common_name')
      // common_name isn't unique — the id tiebreak keeps paging stable
      .order('id')
      .range(from, to)
  )

  return data.map((p) => ({
    id: p.id,
    commonName: p.common_name,
    botanicalName: p.scientific_name ?? '',
    imageUrl: heroImageUrl(p),
    description: p.description ?? '',
    aliases: p.common_name_aliases ?? [],
    plantType: p.plant_type ?? '',
    styleTags: p.style_tags ?? [],
    sunThrives: p.sun_thrives ?? [],
    bloomMonths: p.bloom_months ?? [],
    bloomColor: p.bloom_color ?? [],
    foliageColor: p.foliage_color,
    greenery: p.is_greenery ?? false,
    nativeRegion: p.native_region ?? [],
  }))
}

/**
 * A single plant with its resolved companions and the signed-in user's
 * garden (used for the "good for your garden" matching). Companions come
 * from plant_combinations in both directions; entries without an image are
 * dropped (the thumbnails need one). Plants/combinations are public catalog
 * data read via the anon client; only the garden needs the session.
 */
export async function getPlantDetail(
  plantId: string
): Promise<PlantDetail | null> {
  const supabase = getSupabase()
  const [plantRes, combosRes, ctx] = await Promise.all([
    supabase.from('plants').select('*').eq('id', plantId).maybeSingle(),
    supabase
      .from('plant_combinations')
      .select('plant_id_a, plant_id_b')
      .or(`plant_id_a.eq.${plantId},plant_id_b.eq.${plantId}`),
    getSessionGardenContext(),
  ])

  if (plantRes.error)
    throw new Error(`Failed to load plant: ${plantRes.error.message}`)
  if (!plantRes.data) return null
  const garden = ctx?.garden
  if (!garden) throw new Error('No garden for the signed-in user')

  const companionIds = (combosRes.data ?? [])
    .map((c) => (c.plant_id_a === plantId ? c.plant_id_b : c.plant_id_a))
    .filter((id): id is string => Boolean(id))

  let companions: CompanionPlant[] = []
  if (companionIds.length > 0) {
    const { data } = await supabase
      .from('plants')
      .select('id, common_name, image_url, image_url_curated, image_urls')
      .in('id', companionIds)
    // Resolve to the editorial pick before the has-an-image filter, so a plant
    // whose only usable photo is the curated one still shows as a companion.
    companions = (data ?? [])
      .map((c) => ({
        id: c.id,
        common_name: c.common_name,
        image_url: heroImageUrl(c),
      }))
      .filter((c) => Boolean(c.image_url))
  }

  // Resolve the hero once, here, rather than asking every drawer section to
  // remember the curated-then-Trefle precedence. Consumers read plant.image_url
  // and get the editorial pick; image_url_curated stays on the row for anyone
  // who needs to know whether a pick exists.
  const plant = plantRes.data as DbPlant
  return {
    plant: { ...plant, image_url: heroImageUrl(plant) },
    companions,
    garden,
  }
}
