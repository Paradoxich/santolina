-- Care Tips v2 follow-up: a single diary entry can log more than one care
-- event at once — you often water AND prune on the same visit — so the diary
-- composer chips became multi-select. event_type (single, nullable) becomes
-- event_types (text[]), where an empty array is a freeform note. Each element
-- is still constrained to the typed vocabulary, mirroring the old CHECK via
-- the "contained by" operator (<@).
--
-- Backfill: fold each existing non-null event_type into a one-element array;
-- freeform notes (null) become the empty array default. Then drop the old
-- column.

alter table public.diary_entries
  add column event_types text[] not null default '{}'
    check (
      event_types <@ array['planted', 'watered', 'fertilized', 'pruned']::text[]
    );

update public.diary_entries
  set event_types = array[event_type]
  where event_type is not null;

alter table public.diary_entries drop column event_type;

comment on column public.diary_entries.event_types is 'Typed care events this entry logged, e.g. {watered,pruned}. Empty array for freeform notes. Multi-select in the diary composer; powers Tier 3 event-relative Care Tips and the "did it" shortcut. Each element is one of planted / watered / fertilized / pruned.';
