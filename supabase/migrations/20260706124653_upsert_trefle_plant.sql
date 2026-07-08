-- Migration: safe Trefle upsert function
--
-- Replaces the plain .upsert() call in plants-db.ts with a COALESCE-based
-- SQL function so that re-running the Trefle seed never overwrites fields
-- that were populated by the AI curation pass (or by a previous Trefle run
-- that returned richer data).
--
-- Rules encoded here:
--   • Scalar fields where Trefle is authoritative (always overwrite):
--       data_source, common_name, scientific_name
--   • Scalar fields that use COALESCE (keep existing non-null DB value):
--       family, native_to, description, care_level,
--       height_min_cm, height_max_cm, hardiness_zone_min, hardiness_zone_max,
--       image_url
--   • Array fields — COALESCE won't help (empty array != NULL), so use
--     CASE WHEN array_length > 0 (keep existing when Trefle sends nothing):
--       common_name_aliases, bloom_months, sun_requirements, image_urls
--   • peak_season is derived from bloom_months, so it follows the same rule:
--     only update when the incoming bloom_months is non-empty.
--   • is_curated: INSERT with the Trefle value (false), but NEVER flip it
--     back on UPDATE — preserve whatever is already in the row.
--   • AI-only fields are not referenced at all:
--       plant_type, style_tags, space_types, bloom_color, foliage_color,
--       spread_min_cm, spread_max_cm, water_needs, soil_needs,
--       maintenance_notes, common_issues, best_placement,
--       environment_benefits, seasonal_rhythm, garden_use_tags, ai_drafted_at

CREATE OR REPLACE FUNCTION upsert_trefle_plant(
  source_species_id_arg   int,
  data_source_arg         text,
  common_name_arg         text,
  common_name_aliases_arg text[],
  scientific_name_arg     text,
  family_arg              text,
  native_to_arg           text,
  description_arg         text,
  care_level_arg          text,
  bloom_months_arg        int[],
  peak_season_arg         text,
  height_min_cm_arg       int,
  height_max_cm_arg       int,
  hardiness_zone_min_arg  int,
  hardiness_zone_max_arg  int,
  sun_requirements_arg    text[],
  image_url_arg           text,
  image_urls_arg          text[],
  is_curated_arg          boolean
)
RETURNS SETOF plants
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO plants (
    source_species_id,
    data_source,
    common_name,
    common_name_aliases,
    scientific_name,
    family,
    native_to,
    description,
    care_level,
    bloom_months,
    peak_season,
    height_min_cm,
    height_max_cm,
    hardiness_zone_min,
    hardiness_zone_max,
    sun_requirements,
    image_url,
    image_urls,
    is_curated
  )
  VALUES (
    source_species_id_arg,
    data_source_arg,
    common_name_arg,
    common_name_aliases_arg,
    scientific_name_arg,
    family_arg,
    native_to_arg,
    description_arg,
    care_level_arg,
    bloom_months_arg,
    peak_season_arg,
    height_min_cm_arg,
    height_max_cm_arg,
    hardiness_zone_min_arg,
    hardiness_zone_max_arg,
    sun_requirements_arg,
    image_url_arg,
    image_urls_arg,
    is_curated_arg
  )
  ON CONFLICT (source_species_id) DO UPDATE SET
    -- Always authoritative from Trefle
    data_source        = EXCLUDED.data_source,
    common_name        = EXCLUDED.common_name,
    scientific_name    = EXCLUDED.scientific_name,

    -- Prefer existing non-null value; only update when Trefle provides data
    family             = COALESCE(EXCLUDED.family,             plants.family),
    native_to          = COALESCE(EXCLUDED.native_to,          plants.native_to),
    description        = COALESCE(EXCLUDED.description,        plants.description),
    care_level         = COALESCE(EXCLUDED.care_level,         plants.care_level),
    height_min_cm      = COALESCE(EXCLUDED.height_min_cm,      plants.height_min_cm),
    height_max_cm      = COALESCE(EXCLUDED.height_max_cm,      plants.height_max_cm),
    hardiness_zone_min = COALESCE(EXCLUDED.hardiness_zone_min, plants.hardiness_zone_min),
    hardiness_zone_max = COALESCE(EXCLUDED.hardiness_zone_max, plants.hardiness_zone_max),
    image_url          = COALESCE(EXCLUDED.image_url,          plants.image_url),

    -- Array fields: keep existing when incoming array is empty
    common_name_aliases = CASE
      WHEN array_length(EXCLUDED.common_name_aliases, 1) > 0
        THEN EXCLUDED.common_name_aliases
        ELSE plants.common_name_aliases
      END,
    bloom_months        = CASE
      WHEN array_length(EXCLUDED.bloom_months, 1) > 0
        THEN EXCLUDED.bloom_months
        ELSE plants.bloom_months
      END,
    -- peak_season is derived from bloom_months — update only when bloom_months updates
    peak_season         = CASE
      WHEN array_length(EXCLUDED.bloom_months, 1) > 0
        THEN EXCLUDED.peak_season
        ELSE plants.peak_season
      END,
    sun_requirements    = CASE
      WHEN array_length(EXCLUDED.sun_requirements, 1) > 0
        THEN EXCLUDED.sun_requirements
        ELSE plants.sun_requirements
      END,
    image_urls          = CASE
      WHEN array_length(EXCLUDED.image_urls, 1) > 0
        THEN EXCLUDED.image_urls
        ELSE plants.image_urls
      END,

    -- Never flip a curated plant back to uncurated
    is_curated          = plants.is_curated OR EXCLUDED.is_curated,

    updated_at          = now()
  RETURNING *;
$$;

-- Grant execute to the service role so plants-db.ts (supabase-admin) can call it.
-- Adjust the role name if your Supabase project uses a different service role.
GRANT EXECUTE ON FUNCTION upsert_trefle_plant TO service_role;
