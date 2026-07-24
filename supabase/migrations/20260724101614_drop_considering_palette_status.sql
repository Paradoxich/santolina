-- The palette state machine is planned <-> planted only; the legacy
-- 'considering' status was never used by the product (0 rows). Tighten the
-- CHECK to match, so an invalid status can't be written.
--
-- Applied to remote via the Supabase API (version stamped 20260724101614);
-- this file is named to match so `supabase db push` treats it as applied.
alter table public.palette_plants drop constraint palette_plants_status_check;

alter table public.palette_plants add constraint palette_plants_status_check
  check (status in ('planned', 'planted'));
