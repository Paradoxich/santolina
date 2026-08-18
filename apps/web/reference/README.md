# Reference data — committed on purpose

Inputs that pipeline scripts read and append to, which are neither catalog
content nor per-round provenance.

The distinction that decides what belongs here:

- `rounds/<n>/` is **provenance** — what one round did, frozen, restorable.
- `reports/` is **output**, gitignored and disposable: regenerate it by re-running
  the script that wrote it.
- `reference/` is **input that was expensive to earn** and that every later round
  reads. Regenerating it means re-paying whatever it cost the first time.

## `wcvp-native-cache.json.gz`

GBIF `species/match` + `species/{key}/distributions` responses, keyed by
`scientific_name`, read by `scripts/cross-check-native-region.ts` ([native_region](../../../docs/curation.md#native-region)). The script
appends after every lookup it pays for, so the species count is whatever is
committed — read the file, do not trust a number typed here.

**Why it is committed.** It lived in gitignored `reports/` until 2026-07-30,
which made it a 14MB file on one laptop that `git worktree remove` deletes
without asking — the same shape as the July 28 trap where a backup died with its
throwaway worktree. It nearly went that way: the WCVP tail session's worktree was
removed the same evening and the cache was rescued from it by hand.

What it costs to re-earn is the real argument. Each miss is a rate-limited GBIF
round trip paced at `GBIF_DELAY_MS`, and a long rate-limited fetch loop is the
exact machinery that produced trap 1 twice — once against Trefle in round 8, once
against Wikimedia Commons on 2026-07-30. A cache that survives is one fewer
reason to run one.

**Gzipped** because 14MB of pretty-printed JSON is 1MB compressed — the same
trade `rounds/<n>/catalog` already makes. It is binary in a diff, so the commit
message carries the entry count when it moves.

**To inspect it:**

```bash
gunzip -c apps/web/reference/wcvp-native-cache.json.gz | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d), 'species')"
```

## Not here yet: `level3.geojson`

`cross-check-native-region.ts` also needs the WGSRPD Level 3 polygons, still read
from gitignored `reports/level3.geojson`, so **the script cannot run on a clean
checkout**. It is third-party TDWG data and its licence and canonical download URL
want checking before it is vendored — an unattributed 1.8MB dataset in the tree is
its own problem. Until then it is a documented gap rather than a silent one.

It cost a session again on 2026-07-30: the guard died on the missing file in a
fresh worktree and the copy was taken from the shared checkout by hand. The
error names the fix, which is the only reason it cost minutes rather than a
re-download.

## `description-fixes-<date>[-<pass>].json`

Hand-authored `description` rewrites, applied by
`scripts/apply-description-fixes.ts`. One object per row: `id`,
`scientific_name`, `common_name`, `expect` (the stored text the decision was
made against, so a row edited since is skipped rather than clobbered),
`description` (the replacement), and `why`.

**Why it is committed.** For a copy edit the reasoning is the only record of why
a sentence reads as it does, and there is no other path for a correction a
person authored: `curate-plants` is fill-only and refuses this column, and
`curate-editorial` writes what a model produces.

Files are per-pass and are never rewritten. A suffix names the pass when a date
carries more than one — `-openers` is the 2026-08-18 audit of descriptions whose
first clause named a different plant than the row.

## `botanical-flags-<date>.json`

The rows `cross-check-plants` disagreed with, written by the guard itself and
left UNSTAMPED until settled ([the botanical cross-check](../../../docs/curation.md#botanical-cross-check)).
One entry per row, one flag per contradicted field, each carrying `stored`,
`checked`, and an empty `verdict` and `why` for a person to fill in — `correct`
takes the checked value, `keep` leaves the stored one. `apply-botanical-fixes.ts`
reads it back and stamps a row only when all of its flags are ruled on.

**Why it is committed.** The full report goes to gitignored `reports/`, so
before this file existed the stamp saying a row had been checked was durable and
the disagreement that check found was not — it died with the worktree that ran
it. Only the `disagree` flags travel here; a `minor` flag never withheld a stamp
and asking for a ruling on one would be asking for a decision that changes
nothing.

## `native-to-review-<date>.json`

Every row of a `native_to` review queue with the verdict a person reached —
`keep` or `rewritten` — plus `phrase_at_review`, the words they actually read.
The narrative record migration `20260813110500` backfilled from, and since
2026-08-18 the input to `apply-native-to-fixes.ts --review-keep`, which stamps
`native_to_reviewed_at` on the kept rows that have not drifted. A keep is a
decision, not an absence of one; without this file the catalog cannot tell the
two apart and the cross-check re-ranks the same right phrases forever.

## `native-to-fixes-<date>.json`

The reviewed decisions behind a `native_to` rewrite pass, applied by
`scripts/apply-native-to-fixes.ts` ([native_to](../../../docs/curation.md#native-to)).
One object per edited row: `expect` (the phrase the decision was made against,
so a row edited since review is skipped rather than clobbered), `phrase`, and
`why` — the country evidence for the change.

**Why it is committed.** It is the only record of why a phrase says what it
says. The queue that produced it (`docs/native-to-review-<date>.md`) is a
snapshot that goes stale the moment a phrase is edited, and the report it was
read from lives in gitignored `reports/`. A decision file also makes the pass
replayable: re-running it reproduces the edits or names the rows that have moved
on since.

Files are per-pass and are never rewritten. `-cascade` in a name means those
rows were requeued by a `native_region` correction rather than by the queue.

## `native-to-review-<date>.json`

The other half of the same pass: **every** row of the ranked queue with its
verdict, including the ones left alone. A queue rewrites a minority of what it
lists, and without this the majority verdict is invisible — the next run
produces the same ranked list with no way to tell "considered and kept" from
"nobody has looked". That is the same failure as trap 24 read from the other
side: there, a stamp recorded a check that was never acted on; here, a decision
not to act left no record at all.

`phrase_at_review` is what each row said when it was judged, so a phrase edited
later is detectable rather than silently re-inheriting an old verdict. Rewritten
rows carry their evidence in the `native-to-fixes-*` files instead, and the two
files are cross-checked against each other when this one is built.
