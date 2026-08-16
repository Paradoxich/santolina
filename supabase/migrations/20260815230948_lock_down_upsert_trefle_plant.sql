-- Migration: lock down upsert_trefle_plant
--
-- The schema design review (docs/schema-design-review-2026-08-14.md, F-0)
-- found this function EXECUTE-granted to PUBLIC: SECURITY DEFINER, owned by
-- postgres (BYPASSRLS), so the anon key could insert catalog rows and flip
-- is_curated on existing ones (the OR-merge in the conflict branch changes
-- none of the columns the editorial trigger watches, so the flip survives).
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; 20260709210000
-- granted service_role but never revoked that default — the same miss
-- already fixed twice for other functions (20260729164307, 20260730082104),
-- and it reproduces from the migrations alone on a fresh replay, so every
-- restore reinstates it until this file exists.
--
-- Two changes:
--   1. search_path pinned to '' (SECURITY DEFINER hygiene). That alone
--      provably breaks an unqualified body, so the INSERT target and return
--      type are schema-qualified. The plants.* references inside ON CONFLICT
--      DO UPDATE are conflict-target aliases and are unaffected.
--   2. EXECUTE revoked from PUBLIC, anon and authenticated; service_role
--      keeps it (the seed scripts are the only caller).
--
-- Body semantics are otherwise byte-identical to 20260709210000.

CREATE OR REPLACE FUNCTION public.upsert_trefle_plant(
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
RETURNS SETOF public.plants
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.plants (
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
    -- Fill-only: the stored value always wins; Trefle only fills gaps.
    data_source        = plants.data_source,
    common_name        = plants.common_name,
    scientific_name    = COALESCE(plants.scientific_name,    EXCLUDED.scientific_name),
    family             = COALESCE(plants.family,              EXCLUDED.family),
    native_to          = COALESCE(plants.native_to,           EXCLUDED.native_to),
    description        = COALESCE(plants.description,         EXCLUDED.description),
    care_level         = COALESCE(plants.care_level,          EXCLUDED.care_level),
    height_min_cm      = COALESCE(plants.height_min_cm,       EXCLUDED.height_min_cm),
    height_max_cm      = COALESCE(plants.height_max_cm,       EXCLUDED.height_max_cm),
    hardiness_zone_min = COALESCE(plants.hardiness_zone_min,  EXCLUDED.hardiness_zone_min),
    hardiness_zone_max = COALESCE(plants.hardiness_zone_max,  EXCLUDED.hardiness_zone_max),
    image_url          = COALESCE(plants.image_url,           EXCLUDED.image_url),
    common_name_aliases = CASE
      WHEN array_length(plants.common_name_aliases, 1) > 0
        THEN plants.common_name_aliases
        ELSE EXCLUDED.common_name_aliases
      END,
    bloom_months        = CASE
      WHEN array_length(plants.bloom_months, 1) > 0
        THEN plants.bloom_months
        ELSE EXCLUDED.bloom_months
      END,
    peak_season         = CASE
      WHEN array_length(plants.bloom_months, 1) > 0
        THEN plants.peak_season
        ELSE EXCLUDED.peak_season
      END,
    sun_requirements    = CASE
      WHEN array_length(plants.sun_requirements, 1) > 0
        THEN plants.sun_requirements
        ELSE EXCLUDED.sun_requirements
      END,
    image_urls          = CASE
      WHEN array_length(plants.image_urls, 1) > 0
        THEN plants.image_urls
        ELSE EXCLUDED.image_urls
      END,
    is_curated          = plants.is_curated OR EXCLUDED.is_curated,
    updated_at          = now()
  RETURNING *;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_trefle_plant(
  int, text, text, text[], text, text, text, text, text, int[], text,
  int, int, int, int, text[], text, text[], boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_trefle_plant(
  int, text, text, text[], text, text, text, text, text, int[], text,
  int, int, int, int, text[], text, text[], boolean
) TO service_role;
