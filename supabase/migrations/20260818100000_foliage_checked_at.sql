-- Migration: foliage_checked_at, so "typical green" stops being
-- indistinguishable from "nobody asked"
--
-- WHAT THIS IS FOR. `curate-plants` asks for `foliage_color` whenever it is
-- NULL, and NULL is also its legitimate answer — the field spec says "null if
-- typical green". So the question can never be satisfied: the row is selected,
-- the model is paid, it answers "typical green", the patch writes NULL into a
-- column that is already NULL, and the next run asks again. Forever.
--
-- Measured 2026-08-18: 587 of 780 drafted rows hold NULL, 538 of them
-- uncurated and therefore selected by every `curate-plants` run. Round 13's
-- retry re-billed all 33 of its rows for this reason.
--
-- This is trap 26's shape a third time, after `style_tags` `[]` and
-- `is_greenery` `false` — a legitimate answer that looks exactly like an
-- unasked question — and it closes the same way those did, with a stamp.
--
-- ─────────────────────────────────────────────────────────────────────────
-- THE BACKFILL IS DERIVED FROM EVIDENCE, AND HERE IS THE EVIDENCE
--
-- Every other stamp column in this schema shipped with NO backfill, because
-- stamping a row asserts a judgement someone made and evidence cannot be
-- invented (trap 28; the backfill-guard-stamps.ts incident, whose confident
-- header about rows "already judged" was the whole warrant for stamping 100
-- that had not been). This one backfills, and the difference is that the claim
-- is checkable rather than remembered:
--
--   1. The prompt has asked for foliage_color since the FIRST commit of
--      curate-plants.ts — 57b1090, 2026-07-06. `git log -S "missing.push(
--      'foliage_color')" -- apps/web/scripts/curate-plants.ts` returns that one
--      commit and no other, so the line was added once and never removed.
--
--   2. No row predates it. Counted 2026-08-18 against production:
--        rows                        780
--        drafted (ai_drafted_at set) 780
--        earliest ai_drafted_at      2026-07-09T21:39:39.793+00:00
--        drafted BEFORE 2026-07-06     0
--        foliage_color NULL          587
--          of which undrafted           0
--
-- So for every row in the table, foliage_color was in the prompt at the moment
-- that row was drafted. It was asked, and it was answered. The stamp records
-- WHEN it was asked, which is why the value is `ai_drafted_at` and not `now()`
-- — now() would claim a check that happened today, and no check happened today.
--
-- If either premise had failed — a row drafted before the line existed, or the
-- line having been removed and restored — the honest column would have been
-- NULL everywhere, and 587 rows would have owed one more (real) pass.

alter table public.plants
  add column if not exists foliage_checked_at timestamptz;

update public.plants
  set foliage_checked_at = ai_drafted_at
  where ai_drafted_at is not null
    and foliage_checked_at is null;

comment on column public.plants.foliage_checked_at is
  'When curate-plants last ASKED whether this plant''s foliage is notably coloured. Distinguishes foliage_color = NULL meaning "typical green" (asked, answered) from "never asked" — without it the question is re-billed on every run, since NULL is both the gap and the answer. Backfilled from ai_drafted_at on 2026-08-18: the field has been in the prompt since the script''s first commit (2026-07-06) and no row was drafted before that, so every existing row was genuinely asked.';
