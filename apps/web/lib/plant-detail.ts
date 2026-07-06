// SERVER-ONLY — fetches plant detail data for the drawer.
import { getSupabase } from './supabase'
import { DEFAULT_GARDEN } from './default-garden'
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

/** All catalog plants, shaped for the explore grid/list. */
export async function getExplorePlants(): Promise<CatalogPlant[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('plants')
    .select(
      'id, common_name, scientific_name, description, image_url, image_urls'
    )
    .order('common_name')

  if (error) throw new Error(`Failed to load plants: ${error.message}`)

  return (data ?? []).map((p) => ({
    id: p.id,
    commonName: p.common_name,
    botanicalName: p.scientific_name ?? '',
    imageUrl: p.image_url ?? p.image_urls?.[0] ?? '',
    description: p.description ?? '',
  }))
}

/**
 * A single plant with its resolved companions and the user's garden.
 * Companions come from plant_combinations in both directions; entries
 * without an image are dropped (the thumbnails need one). Falls back
 * to DEFAULT_GARDEN while onboarding/auth don't exist yet.
 */
export async function getPlantDetail(
  plantId: string
): Promise<PlantDetail | null> {
  const supabase = getSupabase()
  const [plantRes, combosRes, gardenRes] = await Promise.all([
    supabase.from('plants').select('*').eq('id', plantId).maybeSingle(),
    supabase
      .from('plant_combinations')
      .select('plant_id_a, plant_id_b')
      .or(`plant_id_a.eq.${plantId},plant_id_b.eq.${plantId}`),
    supabase.from('gardens').select('*').limit(1).maybeSingle(),
  ])

  if (plantRes.error)
    throw new Error(`Failed to load plant: ${plantRes.error.message}`)
  if (!plantRes.data) return null

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

  const garden: Garden = gardenRes.data ?? DEFAULT_GARDEN

  return { plant: plantRes.data as DbPlant, companions, garden }
}
