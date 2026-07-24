-- Colour model revision (July 2026): "Colour" in Explore means plant colour,
-- not just bloom colour. Green-bucket membership needs an editorial judgment
-- ("is this plant considered greenery?") that cannot be derived from
-- foliage_color, since every plant has green foliage — boxwood and a rose
-- bush both carry "dark green" leaves, but only one is grown FOR them.
--
-- Curated by scripts/curate-greenery.ts. Editorial-owned: not referenced by
-- upsert_trefle_plant, so re-seeds cannot touch it.

alter table plants
  add column is_greenery boolean not null default false;

comment on column plants.is_greenery is
  'Greenery identity: grown for green mass/form rather than blooms (boxwood, laurel, ferns). Drives Green-bucket membership in the Explore colour filter alongside green blooms. Editorial-owned via scripts/curate-greenery.ts.';
