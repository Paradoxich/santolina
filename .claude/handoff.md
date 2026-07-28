# Session handoff

Newest entry first. Read the top entry before starting work.

## 2026-07-28 — session/2026-07-28-cottage-tags

**Status:** merged to main (PR #118), branch and worktree deleted

**Done:**

- Style tags re-curated behind a signature bar: cottage 89.6% → 48.7%, classic 63% → 16%, wildflower 55% → 17%; all 595 plants judged and stamped (`style_checked_at`), 33 now style-neutral (`[]`)
- Shared definitions in `apps/web/lib/style-tags.ts`, imported by both `curate-plants.ts` and the new `curate-styles.ts` re-tag pass; run `curate-styles.ts --new-only` after every future seed round
- Migration `20260728150000_add_style_checked_at` applied to remote; full story in the July 28 style entry in `docs/database-log.md`
- Mid-pass the Anthropic API ran out of credits (fail-loud worked); Ana topped up same day, stragglers re-ran clean

**Decisions made:**

- `[]` is a valid style-neutral judgment; `curate-plants` treats only NULL `style_tags` as missing
- `garden_use_tags` is excluded from style judgments (loose-era anchor: all 57 rows saying "cottage gardens" carried the tag)
- Cottage stays at ~49% for now — the model reads half the catalog as genuinely cottage; going lower is Ana's editorial call, and `curate-styles.ts` warns above 40% on every full run so it resurfaces

**Next steps (from the July 28 backlog ordering, cottage now done):**

1. Editorial pass on round 8's 101 plants — agent work per Ana's ruling, including flipping `is_curated`
2. WCVP validation tail (~575 plants unvalidated, ~2% expected wrong; reviewed batches, never `--apply` on `--all`)
3. The colour rule follow-up

**Open questions:**

- Is ~290 plants behind the Cottage browse tile acceptable, or should the definition tighten further?
- Blocked items unchanged: local Supabase waits on disk cleanup; Pro-plan decision waits on real diary data
