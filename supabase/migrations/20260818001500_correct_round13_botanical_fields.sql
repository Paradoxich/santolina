-- Data correction: botanical fields flagged by the AI cross-check pass
-- (scripts/cross-check-plants.ts) during round 13, reviewed and authorized
-- 2026-08-18. Same shape and the same guards as
-- 20260709092512_correct_crosscheck_botanical_fields.sql.
--
-- This is a one-time record of corrections applied to the seeded catalog,
-- NOT schema. Every statement is guarded so it is idempotent and safe:
--   * matched on scientific_name (portable across environments, unlike the
--     per-row UUIDs, which are regenerated on a fresh seed),
--   * only touches rows still holding the exact pre-correction value, and
--   * only rows with is_curated = false, so a human-verified edit is never
--     overwritten.
-- On any row whose current value differs from the recorded "prior" value the
-- guard makes it a no-op.

-- ---------------------------------------------------------------------------
-- 1. Rohdea japonica — the wrong organ was recorded as the bloom.
--
-- The cross-check flagged bloom_months as a true disagreement: stored
-- [12,1,2] against checked [5,6,7], no shared months. It is right. Rohdea
-- flowers in late spring to early summer, a short cream spike sitting low
-- among the leaves; the RED BERRIES ripen in autumn and persist through
-- winter, and they are what the plant is grown for. The stored value is the
-- berry season written into the bloom field.
--
-- WHY THIS IS FOUR STATEMENTS AND NOT ONE. The false premise did not stay in
-- the column the guard watches. description and four of the six
-- seasonal_rhythm stages were drafted from "it flowers in winter", so
-- correcting bloom_months alone would leave the row contradicting itself in
-- the two fields a reader actually sees. The cross-check compares scalar
-- botanical fields and nothing blind-checks the prose, which is the general
-- lesson recorded with this round.
-- ---------------------------------------------------------------------------

update public.plants set bloom_months = '{5,6,7}'::integer[]
where scientific_name = 'Rohdea japonica'
  and is_curated = false and bloom_months = '{12,1,2}'::integer[];

-- The four stages that asserted winter flowering, plus the two that referred
-- back to it. Written out in full rather than patched key by key so the stored
-- object is readable as one corrected whole.
update public.plants set seasonal_rhythm = jsonb_build_object(
  'early_spring', 'Evergreen foliage stays glossy through the cold. The last red berries persist low in the clump.',
  'late_spring',  'A short cream flower spike opens among the leaves, close to the ground and easily missed.',
  'summer',       'Green berries swell behind the fading spike. Foliage holds its colour in deep shade.',
  'late_summer',  'Berries begin to turn. The clump stays dense and quietly ornamental.',
  'autumn',       'Berries ripen to bright red at the base of the plant, its main display of the year.',
  'winter',       'Red berries hold among the evergreen leaves, carrying colour through the coldest months.'
)
where scientific_name = 'Rohdea japonica'
  and is_curated = false
  and seasonal_rhythm->>'winter' like '%flowers appear%';

-- seasonal_care was distilled FROM the wrong seasonal_rhythm, so it is cleared
-- rather than corrected here: curate-seasonal-care is fill-only and will
-- re-derive it from the statement above on the next round-scoped run.
update public.plants set seasonal_care = null
where scientific_name = 'Rohdea japonica'
  and is_curated = false and seasonal_care is not null;

-- ---------------------------------------------------------------------------
-- 2. Two sun corrections, in opposite directions.
--
-- The catalog models sun as thrives + tolerates. Most of round 13's
-- sun_requirements flags are that split being flattened for comparison, so
-- stored reads wider than the check: noise, and left alone. These two are not.
--
-- Camellia sasanqua GAINS full sun as a tolerance. Taking more sun than
-- C. japonica is the distinction a buyer chooses sasanqua for, and the catalog
-- stored the two identically. Recorded as a TOLERANCE rather than promoted to
-- thrives on purpose: this catalog is Euro/Med first, and in a Dalmatian
-- summer a camellia still wants afternoon shade.
--
-- Fargesia murielae LOSES it. Umbrella bamboo scorches in hot full sun, which
-- is why the check returned partial_sun and shade only.
-- ---------------------------------------------------------------------------

update public.plants set sun_tolerates = '{shade,full_sun}'::text[]
where scientific_name = 'Camellia sasanqua'
  and is_curated = false and sun_tolerates = '{shade}'::text[];

update public.plants set sun_tolerates = '{shade}'::text[]
where scientific_name = 'Fargesia murielae'
  and is_curated = false and sun_tolerates = '{shade,full_sun}'::text[];
