-- Migration: add structured native_region provenance tags to plants
--
-- Why: some users want to browse/plant only species native to their own
-- region. `native_to` is a free-text modern-geography phrase (good for reading,
-- not for filtering). This adds a controlled, array-valued tag so a future
-- "regional / local plants only" filter is a pure array-contains query.
--
-- Vocabulary (independently assigned — a plant carries every tag that applies,
-- no auto-cascade despite the nesting):
--   mediterranean — native to the Mediterranean basin
--   balkans       — native to the Balkan Peninsula
--   croatia       — occurs natively in Croatia
--
-- Follows the existing text[]-tag convention (style_tags, garden_use_tags,
-- sun_thrives, ...): NOT NULL DEFAULT '{}'. Existing rows keep '{}' until a
-- backfill pass tags the pre-existing catalog.

-- REVERTED 2026-08-17 to the SQL this migration actually applied. It had been
-- edited afterwards — schema-qualified, and `if not exists` added — harmless in
-- effect, and exactly what an applied migration may never be: a file that
-- describes something the database never ran. Found by the content half of
-- `pnpm migrations:check`, added the same day.

alter table plants
  add column native_region text[] not null default '{}';

comment on column plants.native_region is
  'Controlled provenance tags for a "native to my region" filter. Vocabulary: mediterranean (Mediterranean Basin), balkans (Balkan Peninsula), croatia (occurs natively in Croatia). Independently assigned per species; a plant may carry any combination.';
