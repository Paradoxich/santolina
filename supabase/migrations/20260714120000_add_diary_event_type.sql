-- Care Tips v2 / Tier 3: typed diary events. Adds an opt-in event_type to
-- diary_entries — text + CHECK, matching house style (status, space_type,
-- peak_season are all text + CHECK). Nullable so freeform journaling is
-- untouched; note is already nullable, so an event-only entry (no note, no
-- photo) is valid. The table holds one throwaway seed row, so there is no
-- backfill. See the Care Tips v2 behavior spec.

-- REVERTED 2026-08-17 to the SQL this migration actually applied, which is the
-- ALTER alone. The `comment on column` that used to sit below it was added to
-- the file after the fact and never ran — and can no longer run at all:
-- `event_type` was replaced by `event_types` (text[]) three days later by
-- 20260724081741, which carries its own column comment. So the orphaned comment
-- is dropped rather than re-applied. Found by the content half of
-- `pnpm migrations:check`, added the same day.

ALTER TABLE public.diary_entries ADD COLUMN event_type text CHECK (event_type = ANY (ARRAY['planted'::text, 'watered'::text, 'fertilized'::text, 'pruned'::text]));
