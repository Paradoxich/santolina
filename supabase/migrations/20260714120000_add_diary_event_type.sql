-- Care Tips v2 / Tier 3: typed diary events. Adds an opt-in event_type to
-- diary_entries — text + CHECK, matching house style (status, space_type,
-- peak_season are all text + CHECK). Nullable so freeform journaling is
-- untouched; note is already nullable, so an event-only entry (no note, no
-- photo) is valid. The table holds one throwaway seed row, so there is no
-- backfill. See the Care Tips v2 behavior spec.

alter table public.diary_entries
  add column event_type text
    check (event_type in ('planted', 'watered', 'fertilized', 'pruned'));

comment on column public.diary_entries.event_type is 'Optional typed care event: planted / watered / fertilized / pruned. Null for freeform notes. Powers Tier 3 event-relative Care Tips and the diary "did it" shortcut — see the Care Tips v2 behavior spec.';
