---
name: curation-round
description: Run a plant catalog curation round — load the runbook and traps, verify round identity, run the steps, close out cleanly. Use when the user invokes /curation-round or asks to seed or curate a new batch of plants.
argument-hint: [round label e.g. 9]
---

You are running a catalog curation round. This file holds no pipeline facts on
purpose — the docs below are the single home for those, and if anything here
seems to disagree with them, the docs win and this file needs fixing. Your job
is to load them at the right moments and to not skip the exits.

## 1. Load the sources before touching anything

Read, in this order, in full — not from memory of a previous session:

1. `docs/round-runbook.md` — the generated step order. It is generated from the
   array `run-round.ts` executes, so it is the authority on what runs and when.
2. `docs/curation.md` — the reasoning behind the shape, especially the
   [round-runbook section](../../../docs/curation.md#round-runbook) and the
   sections for whichever passes this round touches.
3. `docs/database-log.md` — the **standing rules** and the **entire traps
   section**. The traps list grows; a summary you remember is stale by
   definition.

Then tell me, in a few lines, what this round is (label, intended batch, which
passes) and anything in the traps list that touches it directly.

## 2. Verify the ground before the first write

- This work happens in a session worktree (`/session-start`), never the main
  checkout.
- The round has an identity: `rounds/<label>/manifest.json` is what every step
  scopes to. No manifest yet is fine before seeding; a pass running without one
  is not.
- Before any full pass — seeding, curation, cross-check — run the smoke test
  the standing rules require (small `--limit`, `--dry-run` where the script
  offers it) and show me the result before scaling up.

## 3. Run the round

Follow `docs/round-runbook.md` step by step. Do not reorder, and do not skip a
step silently — if a step does not apply to this round, say so and why. If
something fails mid-round, the log's standing rules govern; fixes get recorded,
not improvised (and not split into a separate PR).

## 4. Close out — none of these are optional

1. `check-round-scope.ts` passes, or every out-of-scope write is traced and
   waived on the record.
2. The catalog backup for this round exists in `rounds/<label>/catalog/`
   (before and after).
3. `log-db-session.ts --round <label>`, then finish the entry in
   `docs/database-log.md` by hand — including any new trap this round found.
4. Report the catalog state delta (plant count before/after, what changed) so
   the round is summarizable in one paragraph.

End by telling me explicitly which of these four produced anything I need to
look at.
