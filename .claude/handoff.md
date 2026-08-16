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

## 2026-08-16 — The round-12 guardrails

**In flight: nothing.** PR
[#162](https://github.com/Paradoxich/santolina/pull/162) merged as `70b4d26`,
branch and worktree gone, all three CI jobs green on main including the two
main-only ones. Session entry in `docs/database-log.md`. The four gating steps
and most of step 5 are done.

```bash
pnpm invariants:check                   # the new one, from the ROOT; prints its own backlog
```

**Round 12 is unblocked.** The gate was the resolver, and it exists:
`apps/web/scripts/species-resolver.ts`, one append-only table of 45 synonym
components over 105 genus names (round 11's held 34). No `seed-*.ts` may declare
its own — `pnpm invariants:check` fails if one does.

**Next steps, in order:**

1. **Merge this branch, then run round 12.** Nothing in the pipeline is
   half-changed, but `cross-check-native-to` behaves differently now and round
   12 is the first run that will show it: a `gross`/`contradicts` row whose
   rewrite nobody has written stays unstamped and **fails round close**. That is
   intended. The run names those rows in its tail.
2. **Watch for the one gap that behaviour opens.** A row a person reads and
   KEEPS needs `native_to_reviewed_at`, and nothing in TypeScript writes it. If
   round 12 produces a keep-this-phrase decision, the `--review-keep` writer
   (audit F5) stops being can-wait and becomes the blocker. It is recorded in
   `STAMPS_WITHOUT_WRITERS` with that reasoning.
3. **The migration-drift content check** — the one step-5 item left. It needs
   `applied_migrations()` to return `statements`, so it needs a migration and
   Ana's push (rule 11), which is why it was not folded in here. Design is in
   the review's section 6; 31 of 34 versions already match byte for byte, so it
   is green on day one.
4. **The graveyard pass** (artifact c/1) whenever convenient:
   `wikimedia-image-proof.ts`, `repair-combinations.ts`,
   `backfill-legacy-editorial.ts` to `archive/` with README rows —
   `repair-combinations.ts` needs a `database-log` line in the same change,
   since archiving it otherwise files an empty record. They are the three in
   `SCRIPTS_PENDING_ARCHIVE`; deleting each entry is how you know you finished.
5. **Pin the next trap.** 21 of 28 are unpinned and the count prints on every
   green run. Trap 1 is the cheapest (a fake fetch that 429s, assert the error
   propagates) and the reasons in `TRAPS_NOT_PINNED` say what each one needs.

**Waiting on Ana, unchanged:** the two climbing hydrangeas, the `Cenolophium`
region correction (one of the two round-11 rows stamped with a correction still
pending — the F2 fix prevents new ones, it did not repair those), the 5 photo
holds, the rounds 1-6 editorial pass, the `modern` re-tag. New, small: whether
an empty `common_issues` / `environment_benefits` is legitimate (21 and 4
drafted rows). That answer decides whether they join
`REQUIRED_DRAFTED_FIELDS`; the verifier is the wrong place to settle it.

**Standing:** the next audit is round 12's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**; if it does not, the
diagnosis was wrong and gets redone rather than the fixes repeated. Start it in
a fresh session.

**What this session learned about audits, worth carrying into the next one:**
the mechanism disagreed with the review three times — traps 13 and 14 were
already pinned (so the ratchet starts at 21 of 28, not 25), unioning the stamp
suffixes as proposed would have broken round close, and the `restore-catalog`
diff the review wanted fixed was not actually inflated (100 versus 100, measured
both phases). A review is a hypothesis. Build the check, run it, and believe the
check.

**Open questions:** none.
