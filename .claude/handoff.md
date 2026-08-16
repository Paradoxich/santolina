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

## 2026-08-16 — Round-12 guardrails, then write provenance

**In flight: nothing.** Both merged and verified: PR
[#162](https://github.com/Paradoxich/santolina/pull/162) as `70b4d26`,
[#163](https://github.com/Paradoxich/santolina/pull/163) as `3059bf4`. Branches
and worktrees gone; all three CI jobs green on main including the two main-only
ones. Session entries in `docs/database-log.md`; contracts in
`docs/write-provenance.md` and the traps this date.

```bash
pnpm invariants:check      # prints its own backlog, including the 25 below
```

**ROUND 12 IS GATED, and the gate is now provenance, not seeding.** The resolver
closed the seeding half — one append-only synonym table, 45 components over 105
genus names, and `invariants:check` fails if any `seed-*.ts` declares its own.
What remains: nine round steps still write to the catalog with **no run record**,
so a round run today produces values whose production context is unrecoverable,
which is the debt the work exists to stop accruing.

**Next steps, in order:**

1. **Wire the nine round steps. FRESH SESSION.** Read `docs/write-provenance.md`
   first, then `curate-plants.ts` as the worked example. The abstraction is
   settled — implementation, not design. Follow the order the contract implies:
   `withRunRecord` → `writeSet` → recipe → evidence → `wrote(rowId)` → outcome.
   `RUNS_WITHOUT_PROVENANCE` names all 25 scripts with what each writes; the nine
   round steps are its first block, and deleting entries is the work.
2. **Four of the nine need a non-default evidence witness**, because they do not
   write a timestamp column: `curate-seasonal-care` (`seasonal_care`),
   `regenerate-native-region` (`native_region`), `recover-image-categories`
   (`image_candidates`), and `curate-combinations` writes a different table
   entirely. `beginRun` throws on an unwitnessed member, so this surfaces at once
   rather than as a silent verification failure.
3. **Two have a per-invocation recipe**, not a constant: `pick-plant-images` runs
   two modes on `VISION_MODEL`, and `curate-editorial` computes `max_tokens`.
   Wire the modes as separate runs.
4. **`regenerate-native-region` wants the plan-freshness check in the same
   change** — its plan carries `generatedAt` and nothing compares it against the
   rows' `updated_at`, so a reviewed plan can be applied to state that moved
   underneath it. `restore-catalog` has the comparison to copy.
5. **Then round 12**, watching two things this pipeline has not done before. A
   `gross`/`contradicts` row whose rewrite nobody has written now stays unstamped
   and **fails round close** — intended, and the run names those rows in its
   tail. And a row a person reads and KEEPS needs `native_to_reviewed_at`, which
   nothing in TypeScript writes: if round 12 produces a keep-this-phrase
   decision, the `--review-keep` writer (audit F5) stops being can-wait and
   becomes the blocker. Recorded in `STAMPS_WITHOUT_WRITERS`.
6. **Then the three still-open hygiene items**, any order. The migration-drift
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

**What both sessions learned, and it is the same lesson twice.** The mechanism
disagreed with the document that asked for it three times (traps 13 and 14 were
already pinned; unioning the stamp suffixes would have broken round close; the
`restore-catalog` diff was never inflated), and the provenance work survived
seven attempts to make it lie (duplicate run identity, interrupted execution
vanishing, invalid evidence degrading silently, a mutation that is not a column,
a witness that cannot attribute a write, a row written twice, a detector claiming
coverage it lacked). Almost none of that came from thinking harder about the
design — it came from building the check and running it. A review is a
hypothesis; the check is the experiment.

**Open questions:** none. The provenance design is settled; do not reopen it
before the nine are wired.
