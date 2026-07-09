-- Migration: fill-only Trefle upsert
--
-- Replaces upsert_trefle_plant with strictly fill-only UPDATE semantics.
--
-- Why: the previous version's comment said "prefer existing non-null value"
-- but the code did the opposite — COALESCE(EXCLUDED.x, plants.x) lets the
-- incoming Trefle value win whenever Trefle has data. The array CASE rules
-- had the same direction. In practice this meant any full re-seed silently
-- overwrote editorial/AI-owned values wherever Trefle supplies data: the
-- July 9 2026 round-3 re-seed reverted 49 of the 62 editorial
-- sun_requirements corrections this way (since restored).
--
-- New rule, uniform across every field: once a row exists, the stored value
-- always wins; Trefle may only fill gaps (NULL scalars, empty arrays).
-- This makes re-seeding idempotent against curated and editorially corrected
-- data by construction, not by convention. The catalog is headed for
-- 500-700 species; editorial passes must survive re-seeds.
--
-- Consequences to be aware of:
--   • A re-seed can no longer refresh names, images, or bloom data from
--     Trefle on existing rows. Refreshing from Trefle now requires explicit
--     tooling that states which fields it intends to overwrite.
--   • INSERT behavior is unchanged — new species get the full Trefle payload.
--   • is_curated stays monotonic (can only ever become true).
--   • Rows with source_species_id NULL (manual entries) never conflict here;
--     they are untouchable by the seed path by construction.

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
    -- Fill-only: the stored value always wins; Trefle only fills gaps.
    -- data_source records the row's original provenance — never rewritten.
    data_source        = plants.data_source,
    -- common_name is NOT NULL, so this always keeps the stored name.
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

    -- Array fields: keep the stored array whenever it is non-empty.
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
    -- peak_season is derived from bloom_months and follows its fill decision.
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

    -- Never flip a curated plant back to uncurated
    is_curated          = plants.is_curated OR EXCLUDED.is_curated,

    updated_at          = now()
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION upsert_trefle_plant TO service_role;
