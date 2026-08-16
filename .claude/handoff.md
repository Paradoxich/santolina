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

## 2026-08-15/16 — The pipeline audit, its fixes, and the schema design review

**In flight: nothing.** PR [#161](https://github.com/Paradoxich/santolina/pull/161)
merged as `a651cb4`, branch and worktree gone, CI green on main. Round 11's
branch merged earlier as #160. Reports: `docs/pipeline-audit-2026-08-14.md`,
`docs/schema-design-review-2026-08-14.md`; the two session entries in
`docs/database-log.md`.

**Applied to production, both verified by query, not by output:** migration
`20260815230948` (Ana ran the push; `upsert_trefle_plant` is service_role only,
`search_path` pinned, anon probe 401), and the trap-26 repair — the 100
fabricated style stamps re-judged, fingerprint `style_checked_at =
ai_drafted_at AND style_tags = '{}'` at 0, `catalog-state.md` regenerated.

**Next steps, in order. The first four are one session, and they gate round 12:**

1. **Consolidate the species resolver** — spec is artifact (c) of the schema
   review. First because seeding before it repeats round 11's 12 lost synonym
   groups, and a duplicate species is the one failure a later pass cannot undo.
2. **Land the pre-merge mechanical check** — artifact (b), a 7-shape table with
   today's violation counts. **Decided 2026-08-16: CI script**
   (`scripts/check-pipeline-invariants.ts`, `pnpm invariants:check`, wired
   after `docs:links`), on the `tokens:check` / `runbook:check` / `docs:links`
   precedent — remedy-carrying error messages, and a ratchet that can print
   "25 of 28 traps unpinned" on a green run instead of passing silently.
   Boundary, so this does not become two homes: checks that CALL code stay in
   vitest (`round-rehearsal.test.ts` already owns runbook/registry drift, do
   not duplicate); checks that READ files as text go in the script. Second
   because 3 and 4 decay without it.
3. **The CLAUDE.md trap-closure rule, and the documentation-claim rules with
   it** — artifact (a) verbatim, shipped in the same change as test citations
   on traps 3, 24 and 26, or its own exemplars fail it. Queued alongside it
   (2026-08-16), because every wrong claim this session was a hand-written
   sentence and every existing doc guard checks form, not truth:
   - **Every remediation carries a verification predicate, not just a
     command** — the shape today's repair used ("fixed when
     `style_checked_at = ai_drafted_at AND style_tags = '{}'` returns 0").
     Remediations are the dangerous class: never falsified until the day
     someone follows them, and trusted because they are in the traps file.
     Trap 26's was one session from being run as written.
   - **A comment that authorises a write cites the query proving its
     premise** — `backfill-guard-stamps.ts`'s false header was the warrant
     for stamping 100 rows.
   - **Move "write the command, not the claim; the test is tense, not topic"
     out of this file's header into `database-log`'s standing rules**, where
     the violations actually happen. Where a status line already prints its
     verifying query, delete the prose answer rather than keeping both.
   - **Codify strike-and-annotate** (used here) as the correction form:
     dated annotation, never overwrite, so the corrections accumulate into
     evidence about which claim shapes rot.
4. **`cross-check-native-to`'s stamp discipline** — the F2 sibling left
   deliberately unfixed: it stamps `no_data`, and `apply-native-to-fixes.ts`
   is in no runbook step. Not blind-copied from F2 because its trigger and
   verdict set differ; reason it through.
5. **Then the cheap hygiene**, any order: `REQUIRED_DRAFTED_FIELDS` + prose
   fields while violations are 0; one shared `STAMP_SUFFIXES`; migration-drift
   content check; `restore-catalog` diff excluding trigger-derived columns.
   Everything else is the review's explicit "can wait" list.

**Waiting on Ana, unchanged from round 11:** the two climbing hydrangeas, the
`Cenolophium` region correction (also one of the two round-11 rows stamped
with a correction still pending — the F2 fix prevents new ones, it did not
repair those), the 5 photo holds, the rounds 1–6 editorial pass, the `modern`
re-tag.

**Standing, new:** the next audit is scheduled, not suspicion-triggered —
round 12's close or 2026-09-14, whichever first, early if a PR adds a stamp
column, adds a script, or touches `upsert_trefle_plant`. It should come back
**shorter** than this one; if it does not, the diagnosis was wrong and gets
redone rather than the fixes repeated. Start it in a fresh session.

**Open questions:** none. The vitest-vs-CI-script choice is settled in step 2.
