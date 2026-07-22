-- Attribution for the chosen hero image.
--
-- The vision pass (scripts/pick-plant-images.ts, docs/architecture.md §30)
-- originally chose only among Trefle/PlantNet candidates. Bringing in Wikimedia
-- Commons photos (Wikidata P18 + Commons category) makes attribution a real
-- obligation: CC-BY and CC-BY-SA both require a visible credit. This column
-- carries that credit for whatever image currently sits in image_url_curated.
--
-- Shape (nullable — a Trefle/PlantNet pick leaves it null, unchanged from
-- before; only credited sources populate it):
--   {
--     "artist":      "HitroMilanese",
--     "license":     "CC BY-SA 3.0",
--     "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
--     "source_url":  "https://commons.wikimedia.org/wiki/File:..."
--   }
--
-- Editorial-owned alongside image_url_curated: written only by the pass and the
-- Wikimedia feeder, never by upsert_trefle_plant, so a Trefle re-seed cannot
-- strip a credit off a photo that requires one.

alter table public.plants
  add column if not exists image_attribution jsonb;

comment on column public.plants.image_attribution is
  'Attribution for image_url_curated when the source requires a credit (e.g. Wikimedia CC-BY/CC-BY-SA): {artist, license, license_url, source_url}. Null for Trefle/PlantNet picks. Rendered in the plant detail drawer, not on browse cards.';
