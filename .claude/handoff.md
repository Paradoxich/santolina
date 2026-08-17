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

## 2026-08-17 — A round's cost is measurable now, PR #189 merged

**Nothing in flight. Nothing uncommitted. Two next steps carried forward, plus
one line added to the first.** `pnpm backlog` is the list of what is left; this
file is not a second copy of it.

**A run now records what it was billed, and `pnpm runs:cost` prices it.** The
meter is in `lib/anthropic-client.ts` because every spending script reaches the
API through `getAnthropicClient()`; it wraps `messages.create` AND
`messages.batches.results`, since the image pass never calls `create` and a
meter that missed it would report a round as costing text money alone. The
report prints `—` rather than `$0.00` for a run with no `usage`, which is every
record written before today — read a total as a floor whenever its
NOT MEASURED line is present. Reasoning is in `docs/write-provenance.md`; the
price table's source and read-date are in the script's own header.

**Main is green** at `6f1cf9e`; 444 tests, `invariants:check`, `docs:claims`,
`docs:links` all pass.

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

   **At close, run `pnpm runs:cost --round 13` and put the figure in the
   database-log entry.** It will be the first round measured rather than
   estimated, and it is what turns "roughly $3-6 for 28 plants" into a number
   the next round can budget against.

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
   together roughly $4-8, none of it applied yet. Those are still estimates: run
   ~100 rows, then `pnpm runs:cost --step curate-editorial` prices the slice and
   the rest is arithmetic. ⚠ It rewrites ~60% of the descriptions it judges.
   **Read those rewrites before buying the rest.**

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days, so this list cannot become a paragraph again.

_Empty._ Nothing this session needed a ruling: the model prices were quoted from
the pricing docs rather than decided, and the one judgment call — that the run
record holds tokens and the reporter holds dollars — follows standing rule 14.

**Standing:** the next audit is round 13's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.
