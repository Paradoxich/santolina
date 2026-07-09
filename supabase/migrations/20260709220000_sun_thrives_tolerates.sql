-- Migration: model sun as "best + tolerated" (two fields), derive the flat list
--
-- Why: `sun_requirements` (one flat list) conflates where a plant THRIVES with
-- where it merely TOLERATES a given exposure. That ambiguity is the root cause
-- of the systematic first-draft under-reporting (a single list nudges the
-- drafter toward the optimum only) and of the endless correction sweeps. The
-- durable fix is to capture the two ideas separately.
--
-- Model:
--   sun_thrives    — exposures where the plant performs at its best
--   sun_tolerates  — ADDITIONAL exposures it accepts but isn't at its best in
--   sun_requirements (unchanged, app-facing) — kept in sync as the canonical
--                    union of the two, so every existing read site works as-is.
--
-- `sun_requirements` becomes a DERIVED mirror: a BEFORE trigger recomputes it
-- from the two fields whenever either is set. The app keeps reading
-- `sun_requirements`; editorial edits go to the two source fields. Rows not yet
-- split (both source fields empty) keep their existing `sun_requirements`
-- untouched, so this migration changes no app-visible data on its own — the
-- backfill (scripts/backfill-sun-split.ts) partitions existing values without
-- altering their union.

alter table public.plants
  add column if not exists sun_thrives   text[] not null default '{}',
  add column if not exists sun_tolerates text[] not null default '{}';

-- Integrity: only valid exposures, the two sets disjoint, and no "tolerates
-- an exposure but thrives nowhere" (a plant with any sun data must have a best).
alter table public.plants
  add constraint plants_sun_thrives_valid
    check (sun_thrives <@ array['full_sun', 'partial_sun', 'shade']::text[]),
  add constraint plants_sun_tolerates_valid
    check (sun_tolerates <@ array['full_sun', 'partial_sun', 'shade']::text[]),
  add constraint plants_sun_thrives_tolerates_disjoint
    check (not (sun_thrives && sun_tolerates)),
  add constraint plants_sun_tolerates_needs_thrives
    check (
      not (
        coalesce(array_length(sun_thrives, 1), 0) = 0
        and coalesce(array_length(sun_tolerates, 1), 0) > 0
      )
    );

-- Keep sun_requirements = canonical(full_sun, partial_sun, shade order) union
-- of the two source fields, but only once a plant has been split. Rows with
-- both source fields empty keep their existing sun_requirements.
create or replace function public.sync_sun_requirements()
returns trigger
language plpgsql
as $$
begin
  if coalesce(array_length(new.sun_thrives, 1), 0) > 0
     or coalesce(array_length(new.sun_tolerates, 1), 0) > 0 then
    new.sun_requirements := array(
      select e
      from unnest(array['full_sun', 'partial_sun', 'shade']::text[]) as e
      where e = any (new.sun_thrives) or e = any (new.sun_tolerates)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_sun_requirements on public.plants;
create trigger trg_sync_sun_requirements
  before insert or update on public.plants
  for each row execute function public.sync_sun_requirements();
