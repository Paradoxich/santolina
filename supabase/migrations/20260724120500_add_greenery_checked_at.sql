-- Stamp for the greenery/foliage curation pass (scripts/curate-greenery.ts),
-- following the guard-stamp convention from 20260716120000: NULL = never went
-- through the pass, which is what --new-only targets after future seed rounds.
-- Needed because is_greenery's false default is indistinguishable from a
-- judged "not greenery". Operational metadata, not catalog content.

alter table plants
  add column greenery_checked_at timestamptz;

comment on column plants.greenery_checked_at is
  'When scripts/curate-greenery.ts last judged this plant (greenery identity + foliage colour re-ask). NULL = never — targeted by --new-only.';
