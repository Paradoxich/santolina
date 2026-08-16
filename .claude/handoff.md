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

## 2026-08-16 — The demo purge stops losing photos quietly

**PR [#167](https://github.com/Paradoxich/santolina/pull/167) is MERGED** as
`f872ad5`; branch and worktree are gone. CI green on the PR, all seven checks
re-run green on merged main. **Nothing from this session is in flight.**

`OPEN_FINDINGS['demo-purge-swallows-storage-failure']` is CLOSED, 5 findings → 4. The decision it was blocked on, and the reason it is not a code comment: a
storage failure does **not** block the account deletion. Storage and Postgres
cannot be deleted atomically, so aborting on an external failure does not
prevent loss — it converts one recoverable orphan into an unbounded queue of
demo accounts that never expire behind a single bad object. The best-effort
policy was right; the silence was the defect. Mechanism is in
`lib/purge-demo-users.ts` and the new bullet in
[private diary photos](../docs/architecture.md#diary-photos-private).

**A claim in that finding was overstated, and it changes what is still owed.**
It called this the only case whose lost state cannot be reconstructed. Orphans
are enumerable: upload paths are `{gardenId}/…` and `gardens` is a live table,
so any object whose first path segment has no live garden is an orphan — from
ANY source, including the four request-path callers that still shrug at a
storage error. A service-role reconciliation sweep would find every one already
sitting in the bucket. **Not built deliberately**: it deletes user photos on the
basis of a computed diff, so it wants its own session, a dry run, and Ana's
sign-off rather than a slip into a fix commit. It is a **Build Backlog row**,
not a ratchet entry — nothing is defective today, so no witness would match.

**Next steps, in order. Round 12 was not run this session; 1 through 5 are
carried forward unconsumed from the previous entry.**

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
absence stays true forever whether or not anyone acts. Plus a second Build
Backlog row for the orphaned-photo reconciliation sweep described above.

**Standing:** the next audit is round 12's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**; if it does not, the
diagnosis was wrong and gets redone rather than the fixes repeated. Fresh session.

**What this session adds to the same lesson.** Breaking the new check on purpose
is now habit, and it paid twice. The new test was mutated before being believed
(restoring the swallow reds 3 of them). And the fix's own first draft counted
removed objects from `remove()`'s `data` array — until the vendored types showed
its documented example returning `data: []` for a delete that SUCCEEDED
(`@supabase/storage-js` 2.110.2). That would have replaced a wrong number with a
differently wrong number that looked measured. **A count is only as good as the
contract underneath it**; read the contract in `node_modules`, which is the
version actually running, rather than the vendor's website.

**Open questions:** none.
