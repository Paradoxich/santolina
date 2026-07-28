# Session handoff

Newest entry first. Read the top entry before starting work.

## 2026-07-28 (later) — post-merge state, read this one first

**Status:** `main` is green and everything below is verified, not assumed.

```
verify-round --round 8   0 failures, 4 warnings
catalog:state:check      clean
pnpm typecheck / test    clean, 73/73
restore-catalog --phase after   0 rows differ (archive matches live)
```

### Branches right now

| branch | state | action |
| --- | --- | --- |
| `main` | PR #119 merged (guard audit + round 8 data work) | — |
| `chore/refresh-round8-archive` | 1 commit, **pushed, no PR** | open a PR, it is provenance only |
| `feat/diary-to-plant-story` | 5 commits, **LOCAL ONLY, 40 behind main** | ⚠️ `git push -u origin` **first**, then rebase |

`feat/diary-to-plant-story` is a week of product work (garden-level diary entries, plant story subpage, explore drawer CTAs, recent-activity card, global note action) existing on one laptop. Push it before anything else.

### What changed today, in one line each

- `round-status.ts` `STEP_DEFS` is now a **step registry**; `verify-round` FAILs on any `*_checked_at` column no step claims. **Add a step there in the same commit as the script that stamps it.**
- `docs/catalog-state.md` is **generated** (`pnpm catalog:state`). **Never type a current catalog number into prose** — link to it. `pnpm catalog:state:check` is the staleness check.
- The Notion runbook is a **stub**; `docs/architecture.md` §25 + `docs/database-log.md` are authoritative.
- Four spent one-off scripts moved to `apps/web/scripts/archive/` (read its README before copying anything from there — they still contain unbounded reads).
- Round 8's greenery and image passes finally ran. No-image plants 13 → 3.

### Do next, in this order

1. **Push `feat/diary-to-plant-story`**, then rebase onto `main`.
2. **PR `chore/refresh-round8-archive`.**
3. **Build the round orchestrator.** Recommended shape is the *cheap* one: `round-progress --round <n>` reads DB state + the round's artifacts, reports which steps have run and what must come next, and refuses to call a round complete until the backup, `archive-round` and `check-round-scope` all exist. It runs nothing and costs nothing. The expensive variant (drive every step from one command) cuts against generate-review-then-apply and is not wanted. **This is the fix for the actual failure mode: finishing a *pass* and finishing a *round* feel identical and are not.**
4. **Add a stamp column to `cross-check-native-region.ts`** — it currently writes none, so there is no per-row record of WCVP validation. Do this **before** working the ~575-row tail, or it is trap 2 rebuilt from scratch.
5. **Mandatory scope flags** on `curate-plants`, `curate-combinations`, `draft-hardiness` (`--round` | `--ids` | `--all`, no default). `cross-check-native-region.ts` is the pattern.
6. Round 8's **editorial pass** on its 101 plants — agent work per Ana's standing ruling, including flipping `is_curated`.
7. Minimal **CI** — there is none. Typecheck, tests, `catalog:state:check`.

### Two traps added to `docs/database-log.md` today, both self-inflicted

- **Book-end steps are not optional because a pass looks finished.** The greenery/image passes left `rounds/8/catalog/after-*` stale for six hours; restoring it would have silently reverted ~200 rows *while reporting success*. Run `archive-round --round <n>` after **any** remediation pass, not just after a seed.
- **A backup taken inside a throwaway worktree dies with the worktree.** `backups/` and `reports/` are gitignored and local; `git worktree remove --force` took both. Take the backup in the shared checkout, or archive before removing.

### Open decisions (Ana's)

- Should `check-round-scope` record a `cleared_at`? Its window is baseline → now, so **every closed round's check rots** once later catalog-wide work lands. This is why round 8 currently shows **450 unwaived failures** — they are yesterday's style pass, correctly detected, deliberately not waived.
- Two colour-bucket judgment calls from round 8 — recommendation is written in the Build Backlog, just needs a yes.
- Promote `verify-round`'s hardiness WARN to FAIL in the same change that un-parks §27, not after.

### Calibration note for whoever picks this up

Phase 2 was proposed as six items and shipped **one** (the step registry) plus unplanned work; it was then reported as "done". Do not trust phase/plan language in these notes — check the tree. Rule 5 (no bare `.select()`) is still **convention only**: a static check was built and deleted because a source scan cannot follow a builder assigned to a variable. Three archived scripts remain unbounded and are named in the log.

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
