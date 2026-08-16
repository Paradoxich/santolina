# Session handoff

**Current session only.** Rewritten each session, never appended to. Two things
belong here — what is in flight, and what to do next with the reasoning for its
order. Everything else is a command below or a pointer above.

| Looking for                          | Read                     |
| ------------------------------------ | ------------------------ |
| Catalog, pipeline, migrations, traps | `docs/database-log.md`   |
| Product and structural decisions     | `docs/architecture.md`   |
| Tokens, colour, visual rules         | `DESIGN_SYSTEM.md`       |
| What changed and when                | `git log`                |
| What to build next                   | Notion **Build Backlog** |

**Write the command, not the claim; the test is tense, not topic.** Moved
2026-08-16 to `docs/database-log.md` standing rule 14, where the violations
happen. It governs this file too — every line below is a record or a command.

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

## 2026-08-16 — The nine wired; round 12 is no longer gated

**In flight:** PR [#164](https://github.com/Paradoxich/santolina/pull/164),
branch `session/2026-08-16-provenance-nine`, worktree
`../santolina-provenance-nine`. Merge it, then delete both. Session entry in
`docs/database-log.md`; the contract additions are in `docs/write-provenance.md`.

```bash
pnpm invariants:check      # prints its own backlog, including the 16 below
```

**ROUND 12'S GATE IS OPEN.** Every step the runbook runs opens a run:
`RUNS_WITHOUT_PROVENANCE`'s round-step block is empty and the count went 25 → 16.
What remains is out-of-round passes and three archive candidates; none of them
runs during a round, so none of them blocks one.

**Next steps, in order:**

1. **Run round 12.** Nothing in the pipeline is waiting on more infrastructure.
   Two behaviours nobody has watched yet, both intended, both worth reading the
   tail for. A `gross`/`contradicts` row whose rewrite nobody has written stays
   unstamped and **fails round close** — the run names those rows. And a row a
   person reads and KEEPS needs `native_to_reviewed_at`, which nothing in
   TypeScript writes: if round 12 produces a keep-this-phrase decision, the
   `--review-keep` writer (audit F5) stops being can-wait and becomes the
   blocker. Recorded in `STAMPS_WITHOUT_WRITERS`.
2. **Read the first run records before trusting them.** `apps/web/runs/` is
   still EMPTY — no step was run this session, so every witness is verified as a
   query and none as a record. The probe in the database-log entry is evidence
   that the queries work; it is not evidence that a real pass files a sensible
   record. Expect `bounded` on the value-column passes and `confirmed` on the
   stamp passes, and treat a `contradicted` on the first round as a bug in the
   wiring before a bug in the data.
3. **Then the out-of-round 16**, same mechanism, no new design.
   `backfill-guard-stamps` is the one whose provenance matters most: its
   state-derived half was deleted after it fabricated 100 stamps.
   `apply-native-to-fixes`, `apply-image-reverts` and `feed-wikimedia-candidates`
   all CLEAR a stamp, so shape 12 refuses them until they pass evidence — which
   is the guard working, not an obstacle.
4. **Then the three still-open hygiene items**, any order. The migration-drift
   content check needs `applied_migrations()` to return `statements`, so it needs
   a migration and Ana's push (rule 11); design is in the review's section 6 and
   31 of 34 versions already match byte for byte. The graveyard pass moves the
   three in `SCRIPTS_PENDING_ARCHIVE` to `archive/` with README rows, and
   `repair-combinations.ts` needs a `database-log` line in the same change or it
   files an empty record. And 21 of 28 traps are unpinned, with the reasons per
   trap; trap 1 is the cheapest and highest-consequence.

**Waiting on Ana:** the two climbing hydrangeas, the `Cenolophium` region
correction, the 5 photo holds, the rounds 1-6 editorial pass, the `modern`
re-tag, and whether an empty `common_issues` / `environment_benefits` is
legitimate (21 and 4 drafted rows) — that last one decides whether they join
`REQUIRED_DRAFTED_FIELDS`.

**Standing:** the next audit is round 12's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**; if it does not, the
diagnosis was wrong and gets redone rather than the fixes repeated. Fresh session.

**What this session adds to the same lesson.** The design was called settled and
was still wrong in three places, all of which only appeared once code had to run:
a cleared stamp cannot witness itself, a confirming witness must cover every row
the run counts, and the scan had never once looked at the three editorial
criterion stamps. The last is the sharpest — it had been reporting green about
columns it could not see, from both directions at once. And shape 12's first
version was itself literal-shape dependent, the exact mistake its own comment
warns about; that was found by making the scan fail on purpose, not by rereading
it. **A scan nobody has watched fail is trap 19's shape.** Break it once before
you believe it.

**Open questions:** none.
