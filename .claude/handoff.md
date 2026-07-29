# Session handoff

Newest entry first. Read the top entry before starting work.

## 2026-07-29 — session/2026-07-29-images (read this one first)

**Status:** merged to main ([PR #124](https://github.com/Paradoxich/santolina/pull/124)). Worktree removed, branch deleted local and remote. `main` at `97ff868`.

**Round 8: 61 → 94 of 101 signed off. Catalog `is_curated` 137 → 170. Rows approved with no verdict recorded: 76 → 0.** Three migrations, all applied to the remote and verified.

**Done:**

- **`pick-plant-images --verify`** — an absolute second look at a `medium` hero (is this the right species, on its own merits) rather than the pick's comparative question. It demoted the Fragrant plantain lily: the hero showed lavender flowers and `Hosta plantaginea` is white-flowered. Nine plants then got new Wikimedia photographs.
- **A finished round is FROZEN.** All ten pipeline steps refuse to run without a scope and refuse to write outside it. `--all` needs `--why "<reason>"`.
- **Thirteen steps became ten, and `pnpm round:run --round N` runs them end to end**, resuming from DB state and stopping on failure.
- **The editorial verdict is three verdicts** (image / description / tags). A photo change now re-opens only the image criterion, which is free.
- Round 7's 76 legacy approvals reviewed by Ana via `review-editorial.ts --legacy` and recorded.

**Decisions made:**

- A human "yes" outranks the model's "unsure" — the reviewer has context the model was denied. `apply-image-confirmations.ts` is that path, and it writes `editorial_image_at` because confirming a species IS criterion 1 being cleared.
- A state predicate is not a scope. `WHERE x IS NULL` reads as "the new plants" and means "every plant this pass never reached".
- `curate-styles` / `curate-greenery` / `draft-hardiness` leave the per-round cadence but stay in `STEP_DEFS` with `perRound: false`, so the stamp-column guard still covers them.
- Creeping prickly-pear KEEPS `mediterranean` against the model's flag: our definition is a look ("sun-baked, gravel-and-terracotta"), not a provenance.

**Next steps, in order:**

1. **A contract test for the `invalidate_editorial_verdict` trigger.** It surprised its own author three times in one day and every time was caught by RUNNING it, never by reading it — including once where the documentation was wrong and a script was built against the wrong description. Create a scratch row, exercise each case (change a photo / a tag / a bloom colour / write the stamp back unchanged / change the stamp), assert, delete. Needs a real Postgres: remote scratch row now, local Supabase when unblocked.
2. **One write helper for the plants table.** Four scripts hand-write updates that must each remember the trigger's rule independently. One place to get wrong beats four.
3. **Run round 9 through `pnpm round:run`.** First real exercise of both the freeze and the runner; expect the freeze to catch something.
4. Round 8's last holds: 2 species unconfirmable from any available photograph (American alumroot, Persian ironwood), 3 with no candidate image upstream at all.
5. **No way to record a rejected tag flag.** The prickly-pear stays held forever because nothing is the `MANUAL_EXCLUSIONS` equivalent for editorial flags.
6. Carried over, unchanged: ~70 medium heroes outside round 8; the ~575-plant WCVP tail (never `--apply` against `--all`); the token usage logger; promote hardiness WARN → FAIL when §27 un-parks; the two colour-bucket calls.

**Open questions:**

- **The prickly-pear ruling** — keep the tag and add an override mechanism, or drop the tag and let it clear? Ana's call.
- **Local Supabase is still blocked** (disk cleanup), which is what stands between us and step 1 living in CI.
- CI only runs on `pull_request`, so a pushed branch gets no run until a PR exists.

**Worth knowing:** two traps grew this session. Trap 1 (a failed fetch must not look like a negative result) gained four instances, including a fix that committed the same sin an hour after fixing it. Trap 1b is new and is about this schema's first row-mutating trigger — restores go through it, and its escape hatch is about CHANGING the stamp, not writing it.

## 2026-07-29 — session/2026-07-29-editorial

**Status:** merged to main (PR #123). Worktree removed, branch deleted local and remote. `main` at `e60383e`, clean.

**Round 8 is the first batch to clear every pipeline step end to end**, sign-off included. `round-progress --round 8` → 12/12 steps, 6/6 artifacts. `verify-round --round 8` → 0 failures, 4 warnings.

**Done:**

- **`curate-editorial.ts`** — the §3 sign-off step, which had never existed as a script. Bar defined once in `lib/editorial-standard.ts`; scope flags mandatory; migration `20260728220852` adds `editorial_checked_at`; registered in `STEP_DEFS` at FAIL. Runbook step **7b**.
- **Ran it over round 8: 61 approved, 40 held, 57 descriptions rewritten.** Catalog-wide `is_curated` 76 → 137. All 101 stamped, so held rows are recorded "no" verdicts, not gaps.
- **Standing rule 6 corrected.** It said "never flip `is_curated`, it is Ana's alone" — false since her July 28 ruling. Now names the one script allowed to.
- Round 8's archive refreshed after the pass (`--catalog-only`) — the staleness check caught it, which is the July 28 trap being caught by the tool built for it.

**Decisions made:**

- The pass **rewrites** weak descriptions rather than only flagging them. The text is already an AI draft and `is_curated = false` is the record nobody signed it off, so a better draft replacing a worse one is not new authorship. Ana delegated this call.
- **A rewrite is never judged by the model that wrote it** — a second blind call sees only the plant identity and candidate text. It caught a rewrite swapping in a different common name on the first smoke run.
- **Image criterion costs nothing:** reads the persisted `image_pick_confidence`, no second vision call. Only `high` clears; `medium` is _unresolved_, not failed.
- **Strict bar** (Ana): any unresolved doubt leaves the row `false`.

**What bit us:** the blind judge invented em dashes in four rewrites that the mechanical check had already proven dash-free, holding four good rows on a fabricated reason. Both prompts now forbid citing punctuation, and rejected rewrites are stored so the claim is checkable. Re-running the 8 affected rows cleared 7.

**Next steps, in order:**

1. **The 30 medium-confidence images.** Highest value by a distance: 33 of round 8's 40 holds are image-only, and 30 of those clear with a targeted vision re-check — ~$0.20 plus a small verify-only mode on `pick-plant-images`. This is what stands between round 8 and a fully signed-off batch.
2. **The 6 tag flags the pass found** — real data errors, sitting in `reports/editorial-8.json`: jade plant tagged for outdoor styles, a cactus tagged mediterranean, `Luzula nivea` typed as a grass when it is a rush.
3. **Token usage logger.** Written and deliberately _not_ committed (it was unwired; a dead module is worse than re-adding it). Design point that matters: keep `source` free-form and the format call-site agnostic, because the Agent will go through the Vercel AI SDK and never touch `getAnthropicClient()` — instrumenting only that client measures the cheap half (curation is cents) and misses the runtime, per-user half that will actually constrain the product.
4. ~575-plant **WCVP tail**. Reviewed batches; never `--apply` against `--all`.
5. Promote **hardiness WARN → FAIL** in the same change that un-parks §27.

**Open questions:**

- The two **colour-bucket calls** still need a yes (recommendation is in the Build Backlog).
- 3 plants have **no candidate image upstream at all** — Wikimedia or a manual hero, not a pipeline fix.
- Blocked, unchanged: local Supabase on disk cleanup; the Pro-plan decision on real diary data.

**Worth knowing about API spend, since it came up:** there is no per-task dimension in the Usage/Cost API, and the Admin API needs an organization (unavailable to individual accounts). `CURATION_MODEL` vs `VISION_MODEL` happens to split text from images cleanly across this project's whole history — verified, both constants have never changed — and `service_tier=batch` corroborates it. Finer attribution needs the local logger above. The pipeline's actual spend is cents per round; the Agent is where this becomes a real constraint.

## 2026-07-28 — the database tooling is finished; read this one first

**Status:** everything below is verified, not assumed. Open in [PR #122](https://github.com/Paradoxich/santolina/pull/122), branch `session/2026-07-28-db-tooling`, **CI green**.

```
pnpm typecheck / test         clean, 92/92 (73 + 19 new)
verify-round --round 8        0 failures, 4 warnings
round-progress --round 8      complete — 11/11 steps, 6/6 artifacts
check-round-scope --round 8   0 out-of-scope, 551 waived (identical on re-run)
restore-catalog --phase after 0 rows differ
GitHub Actions                typecheck+test pass in 39s
```

The previous entry's items 1 and 2 were **already done** (PRs #120, #121 merged). This session shipped the remaining four plus Ana's `cleared_at` decision. The shared checkout was 30+ commits behind and is now aligned on a local `main`; the three stale local branches were fully merged and deleted.

### What shipped, one line each

- **CI exists** (`.github/workflows/ci.yml`) — typecheck + test on every PR. A `catalog-state` staleness job is wired but **skips with a notice until Ana adds repo secrets** `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It never runs on `pull_request`: a PR-triggered job holding the service-role key is not worth the drift check.
- **Scope flags are mandatory** on `curate-plants`, `curate-combinations`, `draft-hardiness` (`--round | --ids | --all`, no default) via `scripts/scope.ts`. `--new-only` and `--redraft-unverified` survive as filters _within_ a scope. A state predicate is not a scope.
- **`native_region_checked_at`** — the WCVP pass now stamps every row it decided, registered in `STEP_DEFS` at **FAIL**. A report-only run therefore writes one column now.
- **`round-progress --round <n>`** (`pnpm round:progress`) — reads DB state plus the round's artifacts, prints one NEXT line, exits 1 while anything is outstanding. Runs nothing, costs nothing.
- **`cleared_at`** — `check-round-scope` can close its window, so a finished round's answer stops rotting.

### Two findings that matter more than the features

1. **A committed migration is not an applied migration.** `20260727120000_diary_entries_garden_level` was merged in PR #121 and deployed while `diary_entries.plant_id` was still `NOT NULL` in production — **garden-level notes were failing for real users for a day.** Applied and verified this session. Found by accident; nothing was watching and nothing still is. Written up as **trap 14**; the check is mechanical and belongs in CI once the secrets exist.
2. **The round archive cannot be the scope window's closing edge.** It looks like the obvious source for `cleared_at` and is wrong: the archive must track the live catalog to stay restorable, so it is re-captured after any remediation and its timestamp walks forward. Round 8's read 19:46 — the moment of this session's own refresh. `cleared_at` is therefore explicit, in `scope-allow.json`, with a required `cleared_why`.

### Round 8 is green honestly, not by softening anything

The pre-existing WCVP report covered **20 plants, not 101** — it validated the out-of-scope rewrites, not the batch — so backfilling from it would have left the round at 20/101 while looking addressed. The pass was re-run instead (free: GBIF plus a local geojson). 91 match, 5 corrections applied, 5 no-data.

- One correction was **rejected on evidence**: WCVP would have widened `Polystichum polyblepharum`, a Japanese fern, into Middle Europe on a single unmarked Netherlands row, while the adjacent Belgium row is marked INTRODUCED. Recorded in `MANUAL_EXCLUSIONS`.
- The 5 rows GBIF has no WCVP data for are named in `NO_WCVP_DISTRIBUTION` with their evidence, **rather than dropping the step to WARN** to make them disappear.
- Round 8's 450 scope failures were **waived, not cleared**: the style pass finished 13:06 and round 8's own remediation ran 15:20, so no window holding round 8's real work can exclude a pass that ran _first_.

### Do next

1. **Merge PR #122**, then delete the branch and the `../santolina-db-tooling` worktree.
2. **Add the two CI repo secrets** — the `catalog-state` job is inert until then. Consider adding the trap-14 schema-drift check to the same job.
3. **Round 8's editorial pass** on its 101 plants — agent work per Ana's standing ruling, including flipping `is_curated`. Deliberately deferred as the only remaining costed item.
4. **The ~575-row WCVP tail** — now properly stampable, which was the prerequisite.
5. Two **colour-bucket calls** still waiting on Ana's yes in the Build Backlog.

### Still open, unchanged

- Promote `verify-round`'s hardiness WARN to FAIL **in the same change that un-parks §27**, not after.
- Rule 5 (no bare `.select()`) remains **convention only** — a static check was built and deleted because a source scan cannot follow a builder assigned to a variable. Three archived scripts are still unbounded and named in the log.
- 3 plants have no candidate images upstream at all — Wikimedia or a manual hero, not a pipeline fix.

### Calibration note

The previous entry warned not to trust phase language and to check the tree. That was right and it paid off twice: items 1-2 were already done, and the WCVP report's "101" turned out to be 20. **Check the artifact, not the summary of it** — including the summaries in this entry.

## 2026-07-28 (later) — post-merge state

**Status:** `main` is green and everything below is verified, not assumed.

```
verify-round --round 8   0 failures, 4 warnings
catalog:state:check      clean
pnpm typecheck / test    clean, 73/73
restore-catalog --phase after   0 rows differ (archive matches live)
```

### Branches right now

| branch                         | state                                            | action                                         |
| ------------------------------ | ------------------------------------------------ | ---------------------------------------------- |
| `main`                         | PR #119 merged (guard audit + round 8 data work) | —                                              |
| `chore/refresh-round8-archive` | 1 commit, **pushed, no PR**                      | open a PR, it is provenance only               |
| `feat/diary-to-plant-story`    | 5 commits, **LOCAL ONLY, 40 behind main**        | ⚠️ `git push -u origin` **first**, then rebase |

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
3. **Build the round orchestrator.** Recommended shape is the _cheap_ one: `round-progress --round <n>` reads DB state + the round's artifacts, reports which steps have run and what must come next, and refuses to call a round complete until the backup, `archive-round` and `check-round-scope` all exist. It runs nothing and costs nothing. The expensive variant (drive every step from one command) cuts against generate-review-then-apply and is not wanted. **This is the fix for the actual failure mode: finishing a _pass_ and finishing a _round_ feel identical and are not.**
4. **Add a stamp column to `cross-check-native-region.ts`** — it currently writes none, so there is no per-row record of WCVP validation. Do this **before** working the ~575-row tail, or it is trap 2 rebuilt from scratch.
5. **Mandatory scope flags** on `curate-plants`, `curate-combinations`, `draft-hardiness` (`--round` | `--ids` | `--all`, no default). `cross-check-native-region.ts` is the pattern.
6. Round 8's **editorial pass** on its 101 plants — agent work per Ana's standing ruling, including flipping `is_curated`.
7. Minimal **CI** — there is none. Typecheck, tests, `catalog:state:check`.

### Two traps added to `docs/database-log.md` today, both self-inflicted

- **Book-end steps are not optional because a pass looks finished.** The greenery/image passes left `rounds/8/catalog/after-*` stale for six hours; restoring it would have silently reverted ~200 rows _while reporting success_. Run `archive-round --round <n>` after **any** remediation pass, not just after a seed.
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
