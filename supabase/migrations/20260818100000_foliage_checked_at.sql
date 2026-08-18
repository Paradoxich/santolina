-- foliage_checked_at: distinguishes foliage_color = NULL meaning "typical
-- green" (asked, answered) from "never asked".
--
-- Without it the question can never be satisfied, so curate-plants re-asks it
-- on every run: 587 of 780 drafted rows held NULL when this was written, 538 of
-- them uncurated and therefore selected every time.
--
-- The backfill is derived, not invented. Two facts, both checked 2026-08-18:
--   1. `git log -S "missing.push('foliage_color')" -- apps/web/scripts/
--      curate-plants.ts` returns one commit, 57b1090 (2026-07-06), the script's
--      first. The line was added once and never removed.
--   2. Counted against production: 780 rows, 780 drafted, earliest
--      ai_drafted_at 2026-07-09T21:39:39.793+00:00, 0 drafted before
--      2026-07-06, 587 with foliage_color NULL, 0 of those undrafted.
-- So the field was in the prompt when every existing row was drafted. The stamp
-- records when it was asked, which is why it is ai_drafted_at and not now().

alter table public.plants
  add column if not exists foliage_checked_at timestamptz;

update public.plants
  set foliage_checked_at = ai_drafted_at
  where ai_drafted_at is not null
    and foliage_checked_at is null;

comment on column public.plants.foliage_checked_at is
  'When curate-plants last ASKED whether this plant''s foliage is notably coloured. Distinguishes foliage_color = NULL meaning "typical green" (asked, answered) from "never asked" — without it the question is re-billed on every run, since NULL is both the gap and the answer. Backfilled from ai_drafted_at on 2026-08-18: the field has been in the prompt since the script''s first commit (2026-07-06) and no row was drafted before that, so every existing row was genuinely asked.';
