-- Editorial-owned hero image selection for catalog plants.
--
-- Trefle picks plants.image_url by category priority alone (first image of the
-- highest-priority category present), which is why so many catalog heroes are
-- herbarium sheets, potted nursery shots, or hands holding a leaf — roughly 89%
-- of candidate URLs are PlantNet user photos. This adds an editorial layer on
-- top: an AI vision pass picks the nicest, most representative photo and writes
-- it here, leaving Trefle's own pick in image_url untouched.
--
-- Same ownership model as hardiness_rating (see 20260714164514): these columns
-- are written only by the editorial pass, never by upsert_trefle_plant, so a
-- re-seed can refresh botanical facts without discarding a reviewed image.
--
-- image_candidates exists because lib/trefle.ts flattens Trefle's per-category
-- image map into a bare image_urls text[], discarding the flower/habit/leaf/
-- bark/fruit label on each URL. That label is the single best prefilter signal
-- available (a "flower" shot is a bloom shot by construction), so we recover it
-- from Trefle and persist it rather than throwing it away every seed.

alter table public.plants
  add column if not exists image_candidates jsonb,
  add column if not exists image_url_curated text,
  add column if not exists image_pick_confidence text,
  add column if not exists image_pick_reason text,
  add column if not exists image_checked_at timestamptz;

comment on column public.plants.image_candidates is
  'Trefle image candidates with their category label: [{"url": "...", "category": "flower"}]. Recovered by scripts/recover-image-categories.ts; image_urls keeps the flat list for backwards compatibility.';

comment on column public.plants.image_url_curated is
  'Editorial hero image chosen by the AI vision pass (scripts/pick-plant-images.ts). Read paths prefer this over image_url. Never written by upsert_trefle_plant.';

comment on column public.plants.image_pick_confidence is
  'Vision pass confidence in the pick: high | medium | low. Low-confidence picks are queued for Ana''s review, same model as native_to QA.';

comment on column public.plants.image_pick_reason is
  'One-line rationale for the pick, so a reviewer can judge it without reopening every candidate.';

comment on column public.plants.image_checked_at is
  'When the vision pass last ran for this row. State-based guard for --new-only (exact and resumable), same pattern as botanical_checked_at / native_checked_at.';

alter table public.plants
  drop constraint if exists plants_image_pick_confidence_check;

alter table public.plants
  add constraint plants_image_pick_confidence_check
  check (image_pick_confidence is null
         or image_pick_confidence in ('high', 'medium', 'low'));

-- Partial index for the reviewer queue: low-confidence picks awaiting a look.
create index if not exists plants_image_pick_review_idx
  on public.plants (image_pick_confidence)
  where image_pick_confidence in ('low', 'medium');
