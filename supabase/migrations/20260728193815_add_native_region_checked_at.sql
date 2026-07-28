-- Stamp for the WCVP validation pass (scripts/cross-check-native-region.ts),
-- following the guard-stamp convention from 20260716120000: NULL = never
-- validated, which is what a --new-only sweep targets.
-- The pass shipped July 28 2026 writing no stamp at all, so there was no
-- per-row record of which rows Kew's checklist had actually seen — the same
-- gap the guard stamps were introduced to close, rebuilt from scratch, with a
-- ~575-row tail still to work.
-- Operational metadata, not catalog content (§20 flags-only still holds).
-- Inverse obligation: regenerate-native-region.ts nulls this on rows whose
-- native_region it actually changes, or the stamp would claim a validation of
-- a value that no longer exists.

alter table plants
  add column native_region_checked_at timestamptz;

comment on column plants.native_region_checked_at is
  'When scripts/cross-check-native-region.ts last validated this row''s native_region against WCVP (Kew, read through GBIF). NULL = never — targeted by --new-only. Rows GBIF returned no distribution data for are deliberately left NULL: a failed lookup must not read as a completed check. regenerate-native-region.ts nulls this when it changes native_region.';
