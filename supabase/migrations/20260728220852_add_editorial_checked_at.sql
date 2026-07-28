-- Stamp for the editorial pass (scripts/curate-editorial.ts), following the
-- guard-stamp convention from 20260716120000: NULL = never judged.
--
-- Why a stamp when `is_curated` already exists: is_curated records only the
-- APPROVALS. A row the pass judged and deliberately held back is
-- indistinguishable from a row nobody has looked at, so without this column
-- every run re-judges (and re-bills) the whole flagged remainder, and
-- --new-only can never narrow. That is trap 2 in its original form.
--
-- The two columns say different things and both are load-bearing:
--   editorial_checked_at NOT NULL  = the pass reached a verdict on this row
--   is_curated = true              = that verdict was "approve"
--
-- Operational metadata, not catalog content, so the flags-only rule (§20)
-- holds. Inverse obligation: a script that rewrites a field the editorial
-- judgment rests on (description, style_tags, space_types, the hero image)
-- must null this stamp, or it claims a review of copy that no longer exists.

alter table public.plants
  add column editorial_checked_at timestamptz;

comment on column public.plants.editorial_checked_at is
  'When scripts/curate-editorial.ts last reached an editorial verdict on this row (§3: the image shows the right plant, the description reads well and on-brand, the tags make product sense). Operational metadata, not catalog content. NULL = never judged. A NOT NULL stamp with is_curated = false means the pass looked and deliberately held the row back, which is why the stamp cannot be inferred from is_curated. Scripts that rewrite description, style_tags, space_types or the hero image must null this stamp.';
