// SERVER-ONLY — never import this file in client components.
import { getSupabaseAdmin } from './supabase-admin'
import type { MappedPlant } from './trefle'

// ---------------------------------------------------------------------------
// DB row type — mirrors the Supabase plants table
// ---------------------------------------------------------------------------

export type PlantType =
  | 'annual'
  | 'perennial'
  | 'biennial'
  | 'shrub'
  | 'tree'
  | 'grass'
  | 'climber'
  | 'succulent'
  | 'bulb'

export interface SeasonalRhythm {
  early_spring: string
  late_spring: string
  summer: string
  late_summer: string
  autumn: string
  winter: string
}

export interface DbPlant {
  id: string
  source_species_id: number
  data_source: string
  // Trefle-sourced fields
  common_name: string
  common_name_aliases: string[]
  scientific_name: string | null
  family: string | null
  native_to: string | null
  description: string | null
  care_level: 'low' | 'medium' | 'high' | null
  bloom_months: number[] | null
  peak_season: 'spring' | 'summer' | 'autumn' | 'winter' | null
  height_min_cm: number | null
  height_max_cm: number | null
  hardiness_zone_min: number | null
  hardiness_zone_max: number | null
  sun_requirements: string[] | null
  image_url: string | null
  image_urls: string[] | null
  is_curated: boolean
  // AI-drafted curation fields — never overwrite with Trefle data
  plant_type: PlantType | null
  plant_type_label: string | null
  style_tags: string[] | null
  space_types: string[] | null
  bloom_color: string[] | null
  foliage_color: string | null
  spread_min_cm: number | null
  spread_max_cm: number | null
  water_needs: string | null
  water_needs_summary: string | null
  light_needs: string | null
  soil_needs: string | null
  maintenance_notes: string | null
  common_issues: string | null
  best_placement: string | null
  environment_benefits: string | null
  seasonal_rhythm: SeasonalRhythm | null
  garden_use_tags: string[] | null
  ai_drafted_at: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

/**
 * Upsert a plant record using source_species_id as the conflict target.
 *
 * Delegates to the `upsert_trefle_plant` Postgres function (see
 * supabase/migrations/20260706000000_upsert_trefle_plant.sql) which uses
 * COALESCE / CASE WHEN logic so that re-running the Trefle seed never
 * overwrites fields that were already populated by the AI curation pass or
 * a previous Trefle run that returned richer data.
 *
 * AI-only fields (style_tags, plant_type, etc.) are not referenced by the
 * function at all — they cannot be touched by this path.
 */
export async function upsertPlant(plant: MappedPlant): Promise<DbPlant> {
  const db = getSupabaseAdmin()

  const { data, error } = await db
    .rpc('upsert_trefle_plant', {
      source_species_id_arg: plant.source_species_id,
      data_source_arg: plant.data_source,
      common_name_arg: plant.common_name,
      common_name_aliases_arg: plant.common_name_aliases,
      scientific_name_arg: plant.scientific_name,
      family_arg: plant.family,
      native_to_arg: plant.native_to,
      description_arg: plant.description,
      care_level_arg: plant.care_level,
      bloom_months_arg: plant.bloom_months,
      peak_season_arg: plant.peak_season,
      height_min_cm_arg: plant.height_min_cm,
      height_max_cm_arg: plant.height_max_cm,
      hardiness_zone_min_arg: plant.hardiness_zone_min,
      hardiness_zone_max_arg: plant.hardiness_zone_max,
      sun_requirements_arg: plant.sun_requirements,
      image_url_arg: plant.image_url,
      image_urls_arg: plant.image_urls,
      is_curated_arg: plant.is_curated,
    })
    .single()

  if (error) {
    throw new Error(
      `Failed to upsert plant (source_species_id=${plant.source_species_id}): ${error.message}`
    )
  }

  return data as DbPlant
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * Find a plant by source species ID. Returns null if not found.
 */
export async function findPlantBySourceId(
  sourceSpeciesId: number
): Promise<DbPlant | null> {
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('plants')
    .select('*')
    .eq('source_species_id', sourceSpeciesId)
    .maybeSingle()

  if (error) throw new Error(`DB lookup failed: ${error.message}`)
  return (data as DbPlant | null) ?? null
}

/**
 * Find a plant by common name (case-insensitive). Returns the first match
 * or null if not found.
 */
export async function findPlantByName(name: string): Promise<DbPlant | null> {
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('plants')
    .select('*')
    .ilike('common_name', name)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`DB lookup failed: ${error.message}`)
  return (data as DbPlant | null) ?? null
}
