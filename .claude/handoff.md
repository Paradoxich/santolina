# Session handoff

**Current session only.** Rewritten each session, never appended to. Two things
belong here — what is in flight, and what to do next with the reasoning for its
order. Everything else is a command below or a pointer above.

| Looking for                          | Read                       |
| ------------------------------------ | -------------------------- |
| What is left, mechanically           | `pnpm backlog`             |
| Catalog, pipeline, migrations, traps | `docs/database-log.md`     |
| Product and structural decisions     | `docs/architecture.md`     |
| Tokens, colour, visual rules         | `DESIGN_SYSTEM.md`         |
| What changed and when                | `git log`                  |
| What to build next                   | Notion **Build Backlog**   |
| A dated audit or review              | history, not current state |

**Write the command, not the claim; the test is tense, not topic.**
`docs/database-log.md` standing rule 14, which governs every doc in the repo and
is enforced by `pnpm docs:claims`. It governs this file hardest: a dated heading
makes it look like a record, and it is not one — it describes what is in flight
right now, so every number in it is a state claim. Every line below is a record
or a command.

**If two sessions run at once, the last to finish rewrites this file.** Nothing is
lost: the durable half of a session belongs in the docs above before it belongs
here. Fold any still-open next step from the entry you replace into your own.

```bash
gh pr list --state open                 # what is open
git worktree list                       # who else is working, and where
git branch --list 'session/*'           # session branches alive
gh run list --branch main --limit 5     # did CI pass on main
cd apps/web && pnpm ci:check            # every CI job, database ones included
cd apps/web && pnpm backlog             # the ratchets, recomputed
supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,inbucket,vector,logflare  # the light local stack (rule 11)
```

---

## 2026-08-17 — Steps 1-5 closed. Four ratchets at zero. Nothing in flight.

**[PR #182](https://github.com/Paradoxich/santolina/pull/182) merged, main green
including both database-only jobs.** 19 commits.

| ratchet                               | was | now   |
| ------------------------------------- | --- | ----- |
| `HAND_ROLLED_REVIEWED_MUTATION`       | 6   | **0** |
| `SCRIPTS_PENDING_ARCHIVE`             | 3   | **0** |
| `RUNS_WITHOUT_PROVENANCE`             | 15  | **0** |
| `FLAGS_NOT_DOCUMENTED` (new shape 18) | —   | **0** |

**Three migrations and one deletion went to production**, each with a rule-10
backup and a local replay first; Ana waived rule 11 for the session.
`applied_migrations_statements`, `reconcile_edited_migrations`, `stamp_locks`,
and _Hydrangea anomala_ removed. The facts are the database-log entry and the
reasoning is in the commit messages, which is where it belongs.

**Read trap 33 before touching a migration.** Content checking found three files
edited AFTER they were applied. That class was invisible until today.

---

**Next steps, in order. Both round-scale items cost API money and neither is
started.**

1. **_Ranunculus aconitifolius_ has 1 companion.** Every other plant has 4 or 5;
   this is the only row like it, and it predates the removal work. Found by
   counting during the Hydrangea question, not by any check — **which is the
   actionable half: nothing watches for an under-supplied plant.** Five is a cap,
   not a minimum, and `verify-round` only asks about a round's own rows. Either
   add that check and let it find whatever else is there, or fix this one row and
   accept that the next one is found the same accidental way. The check is the
   better buy and it is cheap.
2. **Round 13.** Carried forward and still **not chosen** — Ana, 2026-08-17. Its
   prerequisites landed and its tags are now correct, which made it possible
   rather than next. What it still needs, unchanged: a **committed gap probe**
   (round 12's were hand-run and recorded only in `seed-round12.ts`'s header, so
   the measurement that picks a theme is the one part of a round that is not
   reproducible — write it to `reports/`, which `archive-round.ts` already
   commits), and a `--baseline` passthrough in `run-round` so the rule-1 backup
   stops living in muscle memory. `cross-check-plants` will flag `plant_type` on
   every sedge and rush, the round-4 false-positive class, left naive on purpose.
3. **The editorial pass over the legacy catalog. NOT A BLOCKER — Ana,
   2026-08-17.** Do not treat it as one; that framing was withdrawn and stays
   withdrawn. Scope is the **422 never-judged, not 720** — the other 298 are
   verdict-withdrawn rows whose descriptions and images already passed, so
   re-judging them restores a flag nothing displays. The images are already
   bought: `curate-editorial` reads the stored `image_pick_confidence` with no
   vision call, and 364 of the 422 clear at `high` for free. ~675 calls, ~$15-30
   unbatched; the Batch API is 50% off with a working precedent in
   `pick-plant-images.ts`, and prompt caching would cut the repeated input —
   together roughly $4-8, none of it applied yet. ⚠ It rewrites ~60% of the
   descriptions it judges. **Run ~100 rows from rounds 1-6 and read the rewrites
   before buying the rest.**

**Two counters can still disagree without anything failing.** `docs:claims` and
`invariants:check` each compute the unpinned-trap count independently, and a
trap number written for CONTEXT in a test file's TOP header counts as a PIN —
which is how the count silently read 20 against 21 for part of this session. The
mechanism is documented in `apps/web/lib/migration-drift.test.ts`'s header, where
both directions bit. **Nothing yet asserts the two agree**, and that assertion is
one line. It is the honest close for this.

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days, so this list cannot become a paragraph again.

_Empty._ Everything raised this session was put to Ana and answered inside the
hour: the migration push, the deletion, the naming rule, and whether to refill
the combinations.

**Two answers worth not re-deriving.**

**The combinations did not need refilling, and measuring is what said so.**
Removing _H. anomala_ took 5 pairings with it. Both instincts were wrong:
re-pointing them at _H. petiolaris_ would have doubled its cap (it already holds
5), and re-running `curate-combinations` was unnecessary because the 5 partners
dropped 5 → 4 and joined 8 plants already at 4.

**The _H. petiolaris_ naming question is closed, not open.** Most-used name wins
(Ana), so the row keeps `Hydrangea petiolaris` rather than being "corrected" to
the accepted _H. anomala_ subsp. _petiolaris_ — the rule cuts both ways and that
is the point. The common name did change, to "Climbing hydrangea", which the
deleted duplicate had been holding.

**Build Backlog rows still owed:** the orphaned-photo reconciliation sweep, and
**50 of 747 rows still showing a Latin binomial where a garden name belongs**
(round 12's own six are fixed; the rest predate it). The plant-removal row is no
longer owed — `scripts/remove-plant.ts` built it.

**Standing:** the next audit is round 13's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.
