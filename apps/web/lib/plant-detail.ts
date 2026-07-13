// SERVER-ONLY — fetches plant detail data for the drawer.
import { getSupabase } from './supabase'
import { getSessionGardenContext } from './session-garden'
import type { DbPlant } from './plants-db'
import type { CatalogPlant, Garden } from '@/types/garden'

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
  const { data, error } = await supabase
    .from('plants')
    .select(
      'id, common_name, scientific_name, description, image_url, image_urls, common_name_aliases, plant_type, style_tags, sun_thrives, bloom_months, native_region'
    )
    .order('common_name')

  if (error) throw new Error(`Failed to load plants: ${error.message}`)

  return (data ?? []).map((p) => ({
    id: p.id,
    commonName: p.common_name,
    botanicalName: p.scientific_name ?? '',
    imageUrl: p.image_url ?? p.image_urls?.[0] ?? '',
    description: p.description ?? '',
    aliases: p.common_name_aliases ?? [],
    plantType: p.plant_type ?? '',
    styleTags: p.style_tags ?? [],
    sunThrives: p.sun_thrives ?? [],
    bloomMonths: p.bloom_months ?? [],
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
      .select('id, common_name, image_url')
      .in('id', companionIds)
    companions = (data ?? []).filter((c): c is CompanionPlant =>
      Boolean(c.image_url)
    )
  }

  return { plant: plantRes.data as DbPlant, companions, garden }
}
