# Round provenance

Committed record of each plant-expansion round (see `docs/architecture.md` §25).
One directory per round label:

```
rounds/8/
  manifest.json      written by the seed run (scripts/round-manifest.ts):
                     what it seeded (ids + names), started/finished timestamps
  reports/           snapshot of the round's guard output, copied from the
                     gitignored reports/ working area by scripts/archive-round.ts
```

The manifest is the explicit record of a round's batch — it exists so nothing
downstream has to infer "this round's plants" from a `created_at` heuristic.

Unlike `reports/` and `backups/` (both gitignored working areas), this
directory is committed: it's the durable provenance trail.

Rounds 1–7 predate this system, so they have no manifest here; the record
starts at the first round seeded with `--round`.
