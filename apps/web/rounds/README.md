# Round provenance

Committed record of each plant-expansion round (see `docs/architecture.md` §25).
One directory per round label:

```
rounds/8/
  manifest.json      written by the seed run (scripts/round-manifest.ts):
                     what it seeded (ids + names), started/finished timestamps
  scope-allow.json   optional: out-of-scope changes made deliberately, each
                     with a reason (scripts/check-round-scope.ts)
  reports/           snapshot of the round's guard output, copied from the
                     gitignored reports/ working area by scripts/archive-round.ts
```

The manifest is the explicit record of a round's batch — it exists so nothing
downstream has to infer "this round's plants" from a `created_at` heuristic.
Two checks read it from opposite sides: `round-status.ts` asks whether every
pipeline step ran for these plants, `check-round-scope.ts` whether any step ran
on plants that aren't these.

`scope-allow.json` is where a legitimate exception gets recorded rather than
argued with. Each entry names what it waives and why:

```json
{
  "allow": [
    {
      "plant": "Grape-hyacinth",
      "column": "common_name",
      "why": "two rows shared this name; split into Southern and Italian"
    }
  ]
}
```

`plant` matches a common name (either side of a rename) or an id, `column` a
plants column, `check` a whole finding kind; `*` matches any, and `why` is
required.

Unlike `reports/` and `backups/` (both gitignored working areas), this
directory is committed: it's the durable provenance trail.

Rounds 1–7 predate this system, so they have no manifest here; the record
starts at the first round seeded with `--round`.
