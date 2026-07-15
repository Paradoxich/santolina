-- Canonical hardiness field: RHS hardiness rating (H1a-H7). USDA zone is
-- derived from it at render time (apps/web/lib/hardiness.ts) — we do NOT store
-- both. hardiness_verified gates confident UI display and marks the value as
-- human-owned (editorial), so it is protected from the Trefle re-seed path
-- (upsert_trefle_plant never references these columns) and from re-drafts.
--
-- Applied to remote as version 20260714164514.

alter table plants
  add column hardiness_rating text
    check (hardiness_rating in ('H1a','H1b','H1c','H2','H3','H4','H5','H6','H7')),
  add column hardiness_verified boolean not null default false;

comment on column plants.hardiness_rating is
  'RHS hardiness rating (H1a-H7), canonical hardiness field. USDA zone is derived at render time (see lib/hardiness.ts) — do not store USDA zones alongside. AI-drafted by scripts/draft-hardiness.ts; confirmed by a human via hardiness_verified.';
comment on column plants.hardiness_verified is
  'True once a human confirmed hardiness_rating against RHS public plant pages. Gates confident UI display and protects the value from re-draft / re-seed (editorial-owned, like style_tags).';
