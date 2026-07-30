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

| script                          | what it did                                                                                                                     | why it is done                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backfill-sun-split.ts`         | Split `sun_requirements` into `sun_thrives` / `sun_tolerates` (migration `20260709220000`), set-preservingly, across 152 plants | Spent. `verify-round` FAILs on an empty `sun_thrives` and passes on all 595 rows, so there is nothing left to backfill. Rationale: `architecture.md` [the two-field sun model](../../../../docs/curation.md#sun-model) |
| `dry-run-native-region.ts`      | Previewed two zoom levels for the region model so the A vs A' choice could be made — wrote nothing                              | Decision closed July 13 2026 (Option A, WGSRPD Level 2, PR #44). Superseded by `regenerate-native-region.ts`, which has its own generate-then-review flow                                                              |
| `derive-empty-native-region.ts` | Part 2 of the same dry run: a fallback for the 14 plants Trefle returns no native distribution for — wrote nothing              | Same closed decision. Archived with its other half rather than left behind alone                                                                                                                                       |
| `regenerate-native-to.ts`       | Replaced Trefle's raw TDWG dump in `native_to` with short readable phrases                                                      | Ran July 2026. **The most likely of these to be wanted again** — `native_to` unification is still open — so read it before reusing rather than copying it                                                              |

`regenerate-native-to.ts` is also the worked example behind the cascade rule in
`architecture.md`: a script that mutates a checked field must null the matching
stamp so the guard re-checks it.

## What deliberately stayed in `scripts/`

`apply-sun-widening.ts` is a past correction too, but it is the pattern every
later apply-script follows — each entry carries the value it expects to find,
so a drifted row is skipped rather than overwritten. `fix-round8-names.ts` was
built from it. It earns its place next to the live scripts by being a template
worth copying, which is the opposite of everything in here.

## Running one anyway

They still work; paths are `process.cwd()`-relative, so run them from
`apps/web` exactly as before, with `archive/` in the path:

```
./node_modules/.bin/tsx --env-file=.env.local scripts/archive/regenerate-native-to.ts
```

If you find yourself running one of these as part of a round, something is
wrong with the round, not with this directory.
