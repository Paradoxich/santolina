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

## 2026-08-17 — Three orphaned items given homes, trap 6 fixed upstream, PRs #185-#187 merged

**Nothing in flight. Nothing uncommitted. Two next steps, both round-scale and
neither started.** Everything else this session raised is closed or in a ratchet,
so `pnpm backlog` is the list and this file is not a second copy of it.

**Main is green on all three CI jobs**, database ones included, at `62be0fd`.

⚠ **Read trap 34 before pushing a migration.** `supabase db push` printed a
certificate ENOENT and "Finished" in the same output, and it HAD applied — so the
last line is not a status and a failed push ends the same way. `pnpm migrations:check`
is the answer and is already rule 11's last step. A fresh worktree is also not
linked at all (`supabase/.temp/` is gitignored), which fails with "Cannot find
project ref" and does not say why.

---

**Next steps, in order.**

1. **Round 13.** Still **not chosen** — Ana, 2026-08-17. Both prerequisites are
   now done rather than pending: the seed loop is extracted (`seed-runner.ts`, so
   a new round writes a `CANDIDATES` list and nothing else) and common names are
   judged at the round by `curate-common-names.ts`, runbook step 1a. What it
   still needs, unchanged: a **committed gap probe** (round 12's were hand-run
   and recorded only in `seed-round12.ts`'s header, so the measurement that picks
   a theme is the one part of a round that is not reproducible — write it to
   `reports/`, which `archive-round.ts` already commits), and a `--baseline`
   passthrough in `run-round` so the rule-1 backup stops living in muscle memory.
   `cross-check-plants` will flag `plant_type` on every sedge and rush, the
   round-4 false-positive class, left naive on purpose.

   ⚠ **`curate-common-names` has never run with `--apply`.** Six rows dry-run
   across two batches, all correct, nothing written. Round 13 is its first real
   use. It is also **not deterministic about which correct name it picks** —
   _Anemanthele lessoniana_ came back "New Zealand wind grass" then
   "Pheasant's-tail grass", both genuine — so read its output before `--apply`
   rather than treating step 1a as fire-and-forget.

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

_Empty._ Everything raised this session was answered the same hour: the
production migration, and whether the pass should keep renaming a name that
merely reads fine (yes — the catalog holds sibling species and will hold more).

**Standing:** the next audit is round 13's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.
