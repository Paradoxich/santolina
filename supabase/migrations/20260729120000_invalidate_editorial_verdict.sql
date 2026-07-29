-- Make the editorial verdict invalidate itself when what it was made about
-- changes, instead of asking every script to remember to do it.
--
-- WHY THIS IS A TRIGGER AND NOT A CODE REVIEW NOTE. Migration 20260728220852
-- stated the obligation in a comment: "scripts that rewrite description,
-- style_tags, space_types or the hero image must null this stamp". Between
-- 2026-07-28 and 2026-07-29 THREE scripts needed it and none had it —
-- apply-image-reverts, apply-image-confirmations and pick-plant-images — and
-- all three predate the column, so each was a silent omission rather than a
-- decision. The last one left nine live rows carrying an editorial approval
-- made about a photograph that had since been replaced.
--
-- A rule that lives in a comment is a rule every new script gets a fresh
-- chance to miss. This is the July 28 audit's own finding applied to itself:
-- one home per fact, and the fact here is "this verdict is about these
-- fields". The database is the only place that sees every write.
--
-- WHAT COUNTS AS INVALIDATING. Exactly the three editorial criteria (§3, and
-- lib/editorial-standard.ts):
--   1. the image shows the right plant   → image_url_curated, image_pick_confidence
--   2. the description reads well        → description
--   3. the tags make product sense       → style_tags, space_types
-- Nothing else. A botanical cross-check correcting a bloom month does not
-- invalidate an editorial judgment, and sweeping more columns in would make
-- the flag impossible to keep.
--
-- THE ESCAPE HATCH IS DELIBERATE AND NARROW, AND IT IS ABOUT CHANGING THE
-- STAMP, NOT WRITING IT. If an UPDATE moves editorial_checked_at to a new
-- value, the trigger leaves the row alone; that is what lets curate-editorial
-- rewrite a description and sign it off in one statement.
--
-- Writing the OLD value back does not qualify, and cannot. Postgres cannot
-- distinguish "wrote the same value deliberately" from "did not write this
-- column" — PostgREST sends every column on an update either way — so value
-- equality is the only signal available, and an unchanged stamp has to read as
-- no claim. The first version of this comment said "writes editorial_checked_at
-- itself", and fix-oversized-heroes was built against that wording: it passed
-- the old stamp back inside the same update and was silently un-curating every
-- row it resized. Caught the day it shipped, by testing the trigger rather than
-- trusting its description.
--
-- A caller that genuinely knows better must therefore RE-ASSERT the verdict in
-- a second statement, where the old value is a change against the now-cleared
-- one. fix-oversized-heroes does exactly that: a smaller rendition of the SAME
-- photograph is not something a reviewer would judge differently, and losing
-- sign-offs to a resize would be the guard working against what it protects.
-- An exception has to be written down, in the same spirit as MANUAL_EXCLUSIONS
-- and the round scope waivers.
--
-- is_curated is cleared alongside the stamp. Leaving it true would produce the
-- one state that is definitely wrong: an approval with no verdict behind it.

create or replace function public.invalidate_editorial_verdict()
returns trigger
language plpgsql
as $$
begin
  -- The caller took responsibility for the verdict in this same statement.
  if new.editorial_checked_at is distinct from old.editorial_checked_at then
    return new;
  end if;

  -- Nothing to invalidate.
  if old.editorial_checked_at is null and old.is_curated is not true then
    return new;
  end if;

  if new.description        is distinct from old.description
     or new.style_tags      is distinct from old.style_tags
     or new.space_types     is distinct from old.space_types
     or new.image_url_curated     is distinct from old.image_url_curated
     or new.image_pick_confidence is distinct from old.image_pick_confidence
  then
    new.editorial_checked_at := null;
    new.is_curated := false;
  end if;

  return new;
end;
$$;

drop trigger if exists invalidate_editorial_verdict on public.plants;

create trigger invalidate_editorial_verdict
  before update on public.plants
  for each row
  execute function public.invalidate_editorial_verdict();

comment on function public.invalidate_editorial_verdict is
  'Clears editorial_checked_at and is_curated when an UPDATE changes something the editorial verdict rests on (description, style_tags, space_types, image_url_curated, image_pick_confidence). Skipped when the same UPDATE writes editorial_checked_at itself, which is how curate-editorial signs off a rewrite in one statement and how a caller declares a change editorially irrelevant. Added 2026-07-29 after three separate scripts omitted this by hand.';
