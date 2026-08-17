-- Migration: common_name_checked_at, so "the name was judged" stops being
-- unanswerable
--
-- WHAT THIS IS FOR — trap 6, fixed upstream instead of downstream. Trefle is a
-- botanical source, so every seed batch lands names that are absent (the mapper
-- falls back to the scientific name, and an Explore card reads "Rodgersia
-- pinnata"), useless in a garden ("Cowflock" for the marsh marigold), or already
-- held by a different species. Three consecutive rounds paid for this with a
-- hand-written correction table — fix-round8-names.ts, fix-round11-names.ts,
-- fix-round12-names.ts — and round 7 paid before the pattern had a name.
--
-- WHY A STAMP AND NOT JUST A SCRIPT. Without one, a good name and an unexamined
-- name are the same value: `common_name` is never null, because the fallback
-- guarantees it. So nothing can distinguish "a pass read this and kept it" from
-- "nobody has ever looked", which is precisely the gap that let the defect
-- recur unnoticed for four rounds. Every other judging pass here stamps for the
-- same reason (style_checked_at, botanical_checked_at, image_checked_at), and
-- STEP_DEFS needs per-plant evidence or the runner cannot tell the step is done.
--
-- WHY NOT WATCHED BY invalidate_editorial_verdict. A name correction is
-- mechanical, not editorial voice — name-fixes.ts already skips is_curated rows
-- rather than overruling them (`onCurated: 'skip'`), so a finalised row's name
-- is frozen and no verdict can be affected. Adding common_name to the watched
-- set would retire verdicts for a change that cannot reach a curated row.
--
-- NULLABLE, NO BACKFILL, AND THAT IS THE HONEST STATE. 747 existing rows have
-- never had their name judged; 50 of them still show a Latin binomial. Stamping
-- them now would assert a judgement nobody made — the exact defect recorded
-- against backfill-guard-stamps.ts, whose confident header about rows that had
-- "already been judged" was the entire warrant for stamping 100 that had not.
-- The column reads NULL until a pass actually reads the row.

alter table public.plants
  add column if not exists common_name_checked_at timestamptz;

comment on column public.plants.common_name_checked_at is
  'When curate-common-names last judged this row''s common_name as a GARDEN name (trap 6). NULL means never judged, which is true of every row seeded before 2026-08-17 — it is not a backfill gap to be filled by stamping, only by judging.';
