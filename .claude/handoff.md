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
cd apps/web && pnpm migrations:check            # is the live schema what the repo says
cd apps/web && pnpm catalog:state:check         # is the catalog doc stale
supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,inbucket,vector,logflare  # the light local stack (rule 11)
```

---

## 2026-08-16 — Rule 14 gets a scan; the audit reports are records only

**PR [#166](https://github.com/Paradoxich/santolina/pull/166) is MERGED** as
`60dbece`; branch and worktree are gone. All seven checks re-run green on merged
main, and the three main-only CI jobs run for the first time with `docs:claims`
in the `check` job. Session entry in `docs/database-log.md`; Notion Session Log
updated. **Nothing from this session is in flight.**

**What is now live on main.** `pnpm docs:claims` makes standing rule 14
executable and extends it past `database-log.md`. `invariants:check` gains shape
13 (`HAND_ROLLED_PAGINATION`) and shape 14 (`OPEN_FINDINGS`, each entry carrying
a witness that matches WHILE its defect is present, so it fails the day someone
fixes it). **`pnpm backlog` now replaces most of what this file used to
restate — run it before trusting any count below.**

**The two dated audit reports are records only now.** Every finding in both was
re-verified against the code; the still-open ones are ratchet entries. Do not
read either report to find out what is left.

**One routed finding wants attention on its own merits, and waiting has a cost.**
`purge-demo-users` discards a Storage deletion error and then deletes the user,
cascading away the `diary_entries` rows holding `photo_urls` — the only pointer
to those objects. It reports `photosRemoved: 0` with an empty failures list,
which is indistinguishable from a clean purge. User data, private
`diary-photos` bucket, running in production on Vercel Cron, and the only
finding in either audit whose lost state cannot be reconstructed. Recorded as
`OPEN_FINDINGS['demo-purge-swallows-storage-failure']`. Not fixed because
whether a storage failure should also BLOCK the account deletion is a real
decision, and today's best-effort behaviour is deliberate — it is blocked on
that answer, not on implementation time. Every expired demo account until then
is another chance to orphan photos silently, so it should not sit behind a long
round by accident.

**Next steps, in order. The order is unchanged from the previous entry — round
12 was not run this session and nothing below was consumed.**

1. **Run round 12.** Nothing in the pipeline is waiting on more infrastructure.
   Two behaviours nobody has watched yet, both intended, both worth reading the
   tail for. A `gross`/`contradicts` row whose rewrite nobody has written stays
   unstamped and **fails round close** — the run names those rows. And a row a
   person reads and KEEPS needs `native_to_reviewed_at`, which nothing in
   TypeScript writes: if round 12 produces a keep-this-phrase decision, the
   `--review-keep` writer (audit F5) stops being can-wait and becomes the
   blocker. Recorded in `STAMPS_WITHOUT_WRITERS`.
2. **Read the first run records before trusting them.** `apps/web/runs/` is
   still EMPTY — no step has been run, so every witness is verified as a query
   and none as a record. Expect `bounded` on the value-column passes and
   **`corroborated`** on the stamp passes. **`confirmed` is unreachable by
   construction** (trap 29) — if you ever see one, something asserted
   exclusivity that was never established. Treat a `contradicted` on the first
   round as a bug in the wiring before a bug in the data.
3. **Then the out-of-round 16**, same mechanism, no new design.
   `backfill-guard-stamps` is the one whose provenance matters most: its
   state-derived half was deleted after it fabricated 100 stamps.
   `apply-native-to-fixes`, `apply-image-reverts` and `feed-wikimedia-candidates`
   all CLEAR a stamp, so shape 12 refuses them until they pass evidence — which
   is the guard working, not an obstacle.
4. **Then per-column exclusivity, which is what earns `confirming` back.** The
   order is forced, and trap 29 has the reasoning: a per-STEP lock does not
   restore causality, because five of the seven witnessed columns have more than
   one writing step (`native_checked_at` three, `image_verified_at` four). The
   key has to be the COLUMN, over every step that writes it — and six of those
   writers are in step 3 above, so a lock added first would fail to bind them
   while licensing `confirmed`. Mechanism notes: `pg_advisory_lock` needs a
   session and PostgREST pools connections, so it cannot hold one across a run;
   `SUPABASE_DB_URL` is the session pooler (5432) and would work with a direct
   client, but `pick-plant-images` collects a Batch API job that can run for
   hours, so the lock has to survive that or be re-verified at finalisation
   before `confirmed` is recorded. No dependency was added for this yet,
   deliberately.

   **Do not DESIGN it early either, not just implement it late.** The census it
   has to be designed against is the complete one, and step 3 changes that census
   — six of the writers are not on run provenance yet, and wiring them is what
   reveals which columns actually need a shared key. A lock abstraction built
   around today's partial set would look finished and establish the wrong
   property, which is the failure this whole sequence exists to avoid.

5. **Then the three still-open hygiene items**, any order. The migration-drift
   content check needs `applied_migrations()` to return `statements`, so it needs
   a migration and Ana's push (rule 11); design is in the review's section 6 and
   31 of 34 versions already match byte for byte. The graveyard pass moves the
   three in `SCRIPTS_PENDING_ARCHIVE` to `archive/` with README rows, and
   `repair-combinations.ts` needs a `database-log` line in the same change or it
   files an empty record. And 21 of 30 traps are unpinned, with the reasons per
   trap; trap 1 is the cheapest and highest-consequence.

**Waiting on Ana:** the two climbing hydrangeas, the
`Cenolophium` region correction, the 5 photo holds, the rounds 1-6 editorial
pass, the `modern` re-tag, and whether an empty `common_issues` /
`environment_benefits` is legitimate (21 and 4 drafted rows) — that last one
decides whether they join `REQUIRED_DRAFTED_FIELDS`. Plus a Build Backlog row
for the `curate-styles` withdrawal counter, which #166 classified as design
rather than a witness: its remedy is "count and print withdrawn approvals", so
the defect is the absence of a number in a summary, and a regex asserting an
absence stays true forever whether or not anyone acts.

**Standing:** the next audit is round 12's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**; if it does not, the
diagnosis was wrong and gets redone rather than the fixes repeated. Fresh session.

**What this session adds to the same lesson.** The rule against unchecked claims
was itself an unchecked claim, and the sentence it failed on had already been
found stale by an audit, hand-corrected, and gone stale again two days later. The
scan written to fix that shipped a check that could not fail — `String.replace`
with a string pattern substitutes only the first occurrence — and it was found by
mutating the docs, not by rereading the code. **Break a new check on purpose
before you believe it**, which is the same conclusion as the last three sessions
and is now cheap to act on.

**Open questions:** none.
