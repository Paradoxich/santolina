-- Split the editorial verdict into one stamp per criterion.
--
-- THE PROBLEM. `is_curated` is a single yes/no over three separate judgments
-- (§3, lib/editorial-standard.ts): the image shows the right plant, the
-- description reads well, the tags make product sense. Because it is one flag,
-- changing any one of those re-opens all three — and re-opening the
-- description means the editorial pass may REWRITE THE COPY.
--
-- That is not hypothetical. On 2026-07-29 a single style tag was removed from
-- Rowan, nothing else, and its description came back rewritten. Nobody asked
-- for that. The blunt version of this: a tag fix can change words a person
-- wrote, and the invalidation trigger added earlier the same day makes it
-- happen MORE often, not less.
--
-- THE FIX. Three stamps instead of one. Each records when that criterion was
-- last cleared; NULL means it is not cleared. `is_curated` remains the
-- catalog's single "this row is finished" flag and is true exactly when all
-- three are set — it stays a real column rather than a generated one because
-- scripts, the app and the trigger all read it, and a generated column cannot
-- be written by the pass that decides it.
--
-- WHAT THIS BUYS. A photo swap now re-opens only the image criterion, and that
-- criterion costs nothing: it is decided mechanically from the
-- `image_pick_confidence` the vision pass already persisted, with no model
-- call. So the common case — a hero image changing — becomes free to re-clear
-- instead of a two-call re-judgment with a side effect on the copy.
--
-- BACKFILL. Every row currently `is_curated = true` had all three criteria
-- cleared by definition, so all three stamps take its existing
-- `editorial_checked_at`. Rows the pass held back get nothing: which criterion
-- failed was recorded only in the run report, and inventing a distribution
-- here would be worse than making the next run re-judge them. That is the same
-- reasoning that left the pre-July-16 guard stamps NULL rather than guessed
-- (trap 2).

alter table public.plants
  add column editorial_image_at timestamptz,
  add column editorial_description_at timestamptz,
  add column editorial_tags_at timestamptz;

comment on column public.plants.editorial_image_at is
  'When criterion 1 (the image shows the right plant) was last cleared. NULL = not cleared. Decided mechanically from image_pick_confidence, so re-clearing it costs nothing.';
comment on column public.plants.editorial_description_at is
  'When criterion 2 (the description reads well and on-brand) was last cleared. NULL = not cleared. This is the expensive one, and the one that can rewrite copy, which is why it is invalidated only by a change to the description itself.';
comment on column public.plants.editorial_tags_at is
  'When criterion 3 (the style and space tags make product sense) was last cleared. NULL = not cleared.';

-- A finished row had all three cleared, whatever the report said about how.
update public.plants
   set editorial_image_at       = editorial_checked_at,
       editorial_description_at = editorial_checked_at,
       editorial_tags_at        = editorial_checked_at
 where is_curated = true
   and editorial_checked_at is not null;

-- Now the trigger invalidates per criterion instead of wholesale.
--
-- The escape hatch is unchanged in spirit and now needs saying once per
-- criterion: an UPDATE that CHANGES that criterion's stamp is left alone,
-- which is how curate-editorial clears a criterion in the same statement that
-- rewrites the field. Writing the old value back still does not qualify and
-- still cannot — see the note in 20260729120000, and the day it cost us.
--
-- fix-oversized-heroes no longer needs its two-statement dance for the reason
-- it needed it: a resize touches image_url_curated, which now invalidates only
-- the image criterion, and the image criterion re-clears for free. The
-- re-assert is left in place because it is still correct and still cheaper
-- than a re-judgment.
create or replace function public.invalidate_editorial_verdict()
returns trigger
language plpgsql
as $$
declare
  cleared boolean := false;
begin
  -- Criterion 1 — the image.
  if new.editorial_image_at is not distinct from old.editorial_image_at
     and (new.image_url_curated     is distinct from old.image_url_curated
       or new.image_pick_confidence is distinct from old.image_pick_confidence)
  then
    new.editorial_image_at := null;
    cleared := true;
  end if;

  -- Criterion 2 — the description.
  if new.editorial_description_at is not distinct from old.editorial_description_at
     and new.description is distinct from old.description
  then
    new.editorial_description_at := null;
    cleared := true;
  end if;

  -- Criterion 3 — the tags.
  if new.editorial_tags_at is not distinct from old.editorial_tags_at
     and (new.style_tags  is distinct from old.style_tags
       or new.space_types is distinct from old.space_types)
  then
    new.editorial_tags_at := null;
    cleared := true;
  end if;

  -- is_curated is the AND of the three. Cleared here rather than left to the
  -- caller so the one state that is definitely wrong — approved with a
  -- criterion outstanding — cannot exist.
  if cleared then
    new.is_curated := false;
    -- editorial_checked_at means "the pass reached a verdict on this row", and
    -- it no longer has a complete one.
    if new.editorial_checked_at is not distinct from old.editorial_checked_at then
      new.editorial_checked_at := null;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.invalidate_editorial_verdict is
  'Clears the editorial stamp for each criterion whose underlying fields an UPDATE changed — image (image_url_curated, image_pick_confidence), description, tags (style_tags, space_types) — and clears is_curated if any criterion was cleared. Per criterion since 2026-07-29 so that changing a tag no longer re-opens the description, which let the editorial pass rewrite copy nobody asked it to touch. Skipped per criterion when the same UPDATE CHANGES that criterion stamp; writing the old value back does not qualify and cannot, see migration 20260729120000.';
