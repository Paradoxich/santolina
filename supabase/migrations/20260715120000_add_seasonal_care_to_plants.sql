-- Migration: add seasonal_care to plants
--
-- Care Tips v2, Tier 1 replacement (spec locked July 15 2026). maintenance_notes
-- is the plant's care manual (several actions, permanent truths, no timeframe)
-- and leaves the tips system; seasonal_care replaces it as the Tier 1 source.
-- Where seasonal_rhythm DESCRIBES what the plant is doing, seasonal_care
-- PRESCRIBES what you do about it, per season. Only the current stage's line
-- surfaces, and only for planted plants.
alter table public.plants
  add column seasonal_care jsonb;

comment on column public.plants.seasonal_care is
  'jsonb object with keys: early_spring, late_spring, summer, late_summer, autumn, winter — each an imperative one-liner (<=12 words / ~90 chars) or null. null means "nothing to do this stage" (the expected value for most plants most stages). Prescriptive care actions (what you do), parallel to seasonal_rhythm (what the plant is doing). Editorial-owned, fill-only, survives re-seeds (not in the upsert_trefle_plant path). Feeds Care Tips v2 Tier 1 — current-stage line, planted plants only.';
