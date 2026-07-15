-- Migration: add guard checked-at stamps to plants
--
-- Pipeline hardening, piece 4. The two Claude-billed per-row guards
-- (cross-check-plants, cross-check-native-to) previously scoped their
-- --new-only mode by the newest calendar day (created_at). That splits a seed
-- batch across a UTC midnight — silently under-checking half of it — and can't
-- resume a run that was killed partway (cross-check-native-to was once killed
-- at 279/494). These columns replace that heuristic: a guard stamps a row when
-- it checks it, so --new-only becomes "WHERE <col> IS NULL" — exact and
-- resumable.
--
-- Operational metadata, NOT catalog content. A guard writing its own
-- checked-at does not break the flags-only rule (§20) — it never touches a
-- botanical or editorial field. The inverse obligation: any script that
-- MUTATES a guard-checked field must null the matching stamp on the rows it
-- changes, or the stamp lies (regenerate-native-to does this for native_to →
-- native_checked_at). Timestamps, not booleans, so a prompt revision can
-- invalidate by date: WHERE <col> IS NULL OR <col> < '<revision date>'.
--
-- check-bloom-colors gets no stamp on purpose: it's a free local validator
-- (no Claude call), so it always runs over the whole catalog. seasonal_care's
-- guard is name-keyed and its track is complete — no stamp until it reopens.
alter table public.plants
  add column botanical_checked_at timestamptz,
  add column native_checked_at timestamptz;

comment on column public.plants.botanical_checked_at is
  'When cross-check-plants.ts last blind-fact-checked this row''s botanical fields (plant_type, hardiness, sun, bloom_months). Operational metadata, not catalog content — the guard stamps it, never edits data. NULL = never checked (what --new-only targets). A script that re-mutates a checked botanical field should null this so the guard re-checks.';

comment on column public.plants.native_checked_at is
  'When cross-check-native-to.ts last checked this row''s native_to phrase (GBIF + Claude continent-level guard). Operational metadata, not catalog content. NULL = never checked (--new-only targets these). regenerate-native-to.ts nulls this on rows whose native_to it rewrites, so the guard re-checks. (Note: regenerate-native-region writes native_region, a different field, and does not affect this.)';
