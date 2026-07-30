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
`scientific_name`, read by `scripts/cross-check-native-region.ts` ([native_region](../../../docs/architecture.md#native-region)). 518
species as committed; the script appends after every lookup it pays for.

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
