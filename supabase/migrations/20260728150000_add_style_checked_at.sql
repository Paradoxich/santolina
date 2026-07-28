-- Stamp for the style re-tag pass (scripts/curate-styles.ts), following the
-- guard-stamp convention from 20260716120000: NULL = never went through the
-- pass, which is what --new-only targets after future seed rounds.
-- Needed because style_tags predates the tightened style definitions
-- (lib/style-tags.ts) — the value alone can't say whether a row was judged
-- under the old anything-goes prompt or the new signature bar.
-- Operational metadata, not catalog content.

alter table plants
  add column style_checked_at timestamptz;

comment on column plants.style_checked_at is
  'When scripts/curate-styles.ts last judged this plant against the tightened style definitions. NULL = never — targeted by --new-only.';
