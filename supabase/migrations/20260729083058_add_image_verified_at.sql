-- Stamp for the hero-image verification pass
-- (scripts/pick-plant-images.ts --verify), following the guard-stamp
-- convention from 20260716120000: NULL = never verified.
--
-- Why a second stamp when `image_checked_at` already exists: they record two
-- different questions, asked of two different things.
--
--   image_checked_at   the PICK ran — "which of these candidates is best?",
--                      a comparative judgment over a shortlist
--   image_verified_at  the CHECK ran — "is this specific photo the right
--                      species and good enough to be the hero?", an absolute
--                      judgment over the one image that won
--
-- A `medium` pick is an unresolved question, not a failure (see
-- lib/editorial-standard.ts): often it means two candidates were close, or the
-- winner carried a small flaw. Neither is answerable by re-running the pick,
-- which would just re-stage the same comparison. Without this column a
-- verified-and-still-medium row is indistinguishable from a never-verified
-- one, so every run re-bills the whole medium remainder — trap 2 again.
--
-- The verification writes its verdict back into `image_pick_confidence`,
-- which stays the catalog's single home for "how sure are we about this
-- hero?" (the one-home-per-fact rule). This column records only that the
-- second, absolute look happened.

alter table public.plants
  add column image_verified_at timestamptz;

comment on column public.plants.image_verified_at is
  'When scripts/pick-plant-images.ts --verify last re-judged this row''s existing hero image on its own merits (right species, usable as a hero), as opposed to picking it out of a shortlist. Operational metadata, not catalog content. NULL = never verified. The verdict itself lands in image_pick_confidence; a NOT NULL stamp still reading medium means the doubt survived a second look and needs a new candidate image or a human, not another re-check.';
