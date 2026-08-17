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

## 2026-08-17 — Three orphaned items given homes, and trap 6 fixed upstream

**Nothing in flight. Two next steps, both of them round-scale and neither
started.** Everything else this session raised is either closed or in a ratchet.

**One thing is NOT done and it is blocking a green main.** The migration
`20260817200000_common_name_checked_at.sql` is applied LOCALLY ONLY. `catalog-status`
now selects that column, so both database CI jobs fail until it reaches
production. Local replay of all 42 migrations is clean and the rule-1 backup is
`apps/web/backups/2026-08-17T19-37-58-928Z`. Rule 11's steady state is the path:
backup, replay, rehearse, `db push`.

**Six merged `session/2026-08-17-*` branches are still on the remote.** All six
are fully merged into `main` with zero commits ahead, checked. Deleting them was
refused by the permission classifier, so it needs a hand.

---

**Next steps, in order.**

1. **Round 13.** Still **not chosen** — Ana, 2026-08-17. Its two prerequisites
   are now done rather than pending: the seed loop is extracted (`seed-runner.ts`,
   so round 13 writes a `CANDIDATES` list and nothing else), and common names are
   judged at the round instead of repaired after it. What it still needs,
   unchanged: a **committed gap probe** (round 12's were hand-run and recorded
   only in `seed-round12.ts`'s header, so the measurement that picks a theme is
   the one part of a round that is not reproducible — write it to `reports/`,
   which `archive-round.ts` already commits), and a `--baseline` passthrough in
   `run-round` so the rule-1 backup stops living in muscle memory.
   `cross-check-plants` will flag `plant_type` on every sedge and rush, the
   round-4 false-positive class, left naive on purpose.

   **The `modern` re-tag no longer gates it.** That Backlog row was closed by
   step D and is marked done; the gap test now reads clean tags.

2. **The editorial pass over the legacy catalog. NOT A BLOCKER — Ana,
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

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days, so this list cannot become a paragraph again.

_Empty._

**Standing:** the next audit is round 13's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.
