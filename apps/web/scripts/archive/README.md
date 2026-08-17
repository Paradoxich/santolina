# Archived one-off scripts

**Nothing in here is part of a round.** These are past corrections and closed
decisions, kept because they are the repeatable record of how something was
done — not because they are expected to run again.

## The rule

One-off remediation scripts stay as history. A past correction is kept
runnable so the next person can see exactly what was done rather than infer it
from a diff, but it is **not** a routine pipeline step and must never be
treated as one. The per-round cadence is [the round runbook](../../../../docs/curation.md#round-runbook); if a
script is not listed there, it is not part of a round.

This rule existed before this directory did — it lived only in the Notion
runbook, where nobody working in the repo could see it. That is why these
files sat alongside the live pipeline for weeks looking exactly like it.

## Why they are in a subdirectory rather than deleted

Deleting would have been safe. Git keeps everything, and the reasoning for
each of these lives in `docs/architecture.md` in more detail than the code
does. The problem was never that they exist — it was that they sat in
`scripts/` looking identical to live pipeline scripts, which makes them
**copy-paste sources**.

That is not hypothetical. The seed-time dedupe read (`fetchExistingCatalog`)
was copied into five seeders, four of which carried the same unbounded
`.select()` — the 1000-row cap bug from standing rule 5 — because a new round
script starts life as a copy of the last one. Anything that can be copied by
accident should not sit where the live scripts sit.

They also opt out of one guarantee the live scripts now have: **the files in
here still contain unbounded full-table reads** (standing rule 5, added after
they were written). They are safe as history and unsafe as templates. Fix
before reuse, and copy from a current script instead.

## What is here, and why it is finished

| script                                 | what it did                                                                                                                     | why it is done                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backfill-sun-split.ts`                | Split `sun_requirements` into `sun_thrives` / `sun_tolerates` (migration `20260709220000`), set-preservingly, across 152 plants | Spent. `verify-round` FAILs on an empty `sun_thrives` and passes on all 595 rows, so there is nothing left to backfill. Rationale: `architecture.md` [the two-field sun model](../../../../docs/curation.md#sun-model)                                                                                                                                                                            |
| `dry-run-native-region.ts`             | Previewed two zoom levels for the region model so the A vs A' choice could be made — wrote nothing                              | Decision closed July 13 2026 (Option A, WGSRPD Level 2, PR #44). Superseded by `regenerate-native-region.ts`, which has its own generate-then-review flow                                                                                                                                                                                                                                         |
| `derive-empty-native-region.ts`        | Part 2 of the same dry run: a fallback for the 14 plants Trefle returns no native distribution for — wrote nothing              | Same closed decision. Archived with its other half rather than left behind alone                                                                                                                                                                                                                                                                                                                  |
| `merge-provence-into-mediterranean.ts` | Folded the retired `provence` style tag into `mediterranean` across 37 rows, set-preservingly                                   | Ran once, 2026-08-17, on Ana's ruling that the two describe the same look — `provence` co-occurred with `mediterranean` on 33 of the 132 rows carrying either. `provence` is gone from `STYLE_TAGS`, so nothing can carry it again and this can never match a row. Kept as the record of how those 37 rows changed. Notable as the first caller of `reviewed-mutation.ts` besides `curate-styles` |
| `regenerate-native-to.ts`              | Replaced Trefle's raw TDWG dump in `native_to` with short readable phrases                                                      | Ran July 2026. **The most likely of these to be wanted again** — `native_to` unification is still open — so read it before reusing rather than copying it                                                                                                                                                                                                                                         |

| `wikimedia-image-proof.ts` | Proved Wikimedia CC-BY/BY-SA sourcing was viable before the July 22 image pass | Decision shipped. Its `resolveP18` and `fetchCommonsImage` now live in `lib/wikimedia.ts` — copy from there, not from here |
| `repair-combinations.ts` | Deleted the duplicate pairs and over-cap companions `curate-combinations` created while reading existing pairs unpaginated | Ran 2026-07-15 (`1ab38e1`) against round 6's damage: 13 duplicate pairs and 34 plants over the 5-companion cap. The cause is fixed at source — `lib/paginate.ts`, standing rule 5 — and `verify-round` fails on both classes now, so a re-run has nothing to find |
| `backfill-legacy-editorial.ts` | Stamped the four editorial columns on rows that were `is_curated` before those stamps existed | **A WRONG-SHAPE EXAMPLE, not a template.** It stamps all four editorial stamps at once, which migration `20260728220852`'s own column comment forbids, and writes `is_curated` directly — the only script outside `lib/plants-write.ts` ever to do so, against standing rule 6. Kept for the shape to recognise, not to copy |
| `apply-sun-widening.ts` | Widened `sun_tolerates` from `cross-check-plants` sun flags | **Neutralized by the database.** `trg_sync_sun_requirements` recomputes what it writes, so Postgres discards the write while the script prints success (pipeline audit 2026-08-14, F6). It survived here as the drift-guard template every apply-script copied; `scripts/reviewed-mutation.ts` is that template now, so the last reason to keep it in `scripts/` is gone |

`regenerate-native-to.ts` is also the worked example behind the cascade rule in
`architecture.md`: a script that mutates a checked field must null the matching
stamp so the guard re-checks it.

## What deliberately stayed in `scripts/`

Nothing, as of 2026-08-17. `apply-sun-widening.ts` used to be the exception,
and the reason it gave was real: each of its entries carried the value it
expected to find, so a drifted row was skipped rather than overwritten, and
`fix-round8-names.ts` was built from it. That made it worth sitting next to the
live scripts even though it was spent.

`scripts/reviewed-mutation.ts` is that template now, and it is a library the
name passes CALL rather than a file they copy — so the pattern cannot drift
between its copies, which is what happened while six of them held it. A
template nobody needs to copy has no reason to sit where the live scripts sit.

## Running one anyway

They still work; paths are `process.cwd()`-relative, so run them from
`apps/web` exactly as before, with `archive/` in the path:

```
./node_modules/.bin/tsx --env-file=.env.local scripts/archive/regenerate-native-to.ts
```

If you find yourself running one of these as part of a round, something is
wrong with the round, not with this directory.
