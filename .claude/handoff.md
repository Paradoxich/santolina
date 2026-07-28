# Session handoff

Newest entry first. Read the top entry before starting work.

## 2026-07-28 — fix/phase-0-guard-drift + fix/phase-2-structural-guards

**Status:** merged to main (PR #119). Both branches merged; safe to delete.

**Done:**

- Audited why each database pass keeps finding problems. Of ~77 incidents across rounds 1-8, only **six** are recurrences of an already-fixed failure mode, and all six share one anatomy: the first fix targeted the _instance_, not the _mode_. Most incidents are novel and cluster by integration, not by round.
- Found the 27-28 July guard layer already broken, by querying the live DB rather than reading docs: `verify-round` was **red on main** (33 style-neutral plants failing for being correct), and `curate-greenery` + the image pass had **never run for round 8's 101 plants** while `verify-round --round 8` reported a clean 7/7.
- `round-status.ts` now holds `STEP_DEFS`, a self-checking registry: `verify-round` FAILs on any `*_checked_at` column no step claims, read from the live column list.
- Standing rule 5 actually applied (it had reached 16 of 42 scripts): unbounded reads fixed in the seeder dedupe set and two guards; the seeder read now lives once in `scripts/catalog-identity.ts`.
- `--round` is mandatory on `seed-plants.ts`; stamp columns matched by pattern; four spent one-offs moved to `scripts/archive/` with a README.
- `docs/catalog-state.md` is **generated** (`pnpm catalog:state`), no timestamp, so `pnpm catalog:state:check` is a real staleness check.
- Notion runbook reduced to a stub — after porting the six facts that existed only there into the repo.
- Round 8's missing passes run: greenery 101/101 (32 greenery), images 95 picks (high 65 / medium 30 / low 0 / errored 0). No-image plants 13 → 3.

**Decisions made:**

- **One home per fact.** Every regression traced to a fact living in two places with one updated. A second copy must be generated or deleted.
- **`architecture.md` was NOT split into `pipeline.md`** — 142 `§` references exist, 48 outside the file. Named anchors are the prerequisite.
- **No static check for rule 5.** One was built and deleted: a source scan cannot follow a builder assigned to a variable, so it had false positives _and_ negatives. Needs AST analysis.
- **The 450 `check-round-scope --round 8` failures are deliberately not waived.** They are yesterday's style pass, correctly detected.

**Next steps:**

1. **Before round 9:** decide whether `check-round-scope` should record a `cleared_at`. Its window is baseline → now, so every closed round's check rots once later catalog-wide work happens.
2. `cross-check-native-region.ts` writes **no stamp column** — trap 2 waiting to be rebuilt. Add one before working the ~575-row WCVP tail.
3. Round 8's editorial pass (agent work per Ana's ruling, incl. flipping `is_curated`).
4. Three archived scripts still contain unbounded reads — named in the log, fix before reuse.

**Open questions:**

- Should `verify-round`'s hardiness WARN be promoted to FAIL? It stays WARN only because §27 is parked; that is the same configuration that hid round 7's skipped draft for twelve days.
- 3 plants have no candidate images upstream at all — Wikimedia or a manual hero, not a pipeline fix.

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
