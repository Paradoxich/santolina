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

## 2026-08-17 — Standing rule 15, and the first three out-of-round passes wired

**IN FLIGHT.** Branch `session/2026-08-17-provenance`, worktree
`../santolina-provenance`. Not pushed, no PR. Two commits so far; the session's
own story is the `2026-08-17` entry in `docs/database-log.md` and is not
repeated here.

**Done this session**

1. **Standing rule 15 — an open question is asked, not parked**, with
   `invariants:check` shape 15 behind it. All three failure modes verified by
   injection. The rule exists because the "Waiting on Ana" paragraph ran for six
   handoffs and three of its six items were never hers.
2. **`RUNS_WITHOUT_PROVENANCE` 18 → 15.** `curate-styles`, `curate-greenery`
   and `draft-hardiness` open runs, each smoke-tested against the live database.
3. **`common_issues` 27 blank rows → 0, and it is now a required field.**
   `curate-plants` gained `--only <field>`: a field-scoped fill that drops the
   `is_curated` selection filter so it can reach signed-off rows, and restricts
   the PATCH to one column so it cannot un-curate one. It refuses any column
   the editorial trigger watches, pinned by five cases in
   `curate-plants.test.ts`. All 13 signed-off rows among the 27 kept their
   sign-off, verified after the write.
4. **_Hydrangea hydrangeoides_ rewritten, and a path built to do it.** New
   `apply-description-fixes.ts`: committed decision file, staleness assertion,
   UI copy guard, run record from the first commit. It deliberately lets the
   editorial verdict fall and says so; `curate-editorial` re-judged the new copy
   APPROVE. Fixing this also surfaced a real defect — `curate-editorial` exited
   NON-ZERO after fully succeeding, because a cold `reports/` is a MISSING
   directory, not an empty one. Written up in trap 8.

**Next steps, in order. 3 through 6 are carried forward unconsumed.**

1. **Finish the out-of-round 15.** The three easy repair passes are done; what
   is left is mostly apply-scripts that CLEAR a stamp, so each needs a witness
   that is not the column it nulls. `curate-greenery`'s `foliage_color` is that
   pattern in the small and is now in the tree. `backfill-guard-stamps` still
   matters most: its state-derived half was deleted after it fabricated 100
   stamps.
2. **Retire _Hydrangea anomala_, once there is a way to.** It and
   _H. petiolaris_ are the same plant to a reader; `petiolaris` is the keeper
   (curated, hero verified, the one actually sold). Nothing but 5 regenerable
   combination rows depends on either, and no palette or diary row does.
   **There is no established removal path for a catalog row**, and building one
   is the work. `apply-description-fixes.ts` is the shape to copy: a committed
   decision file with a `why`, a staleness assertion, and a run record.
3. **Then per-column exclusivity, which is what earns `confirming` back.**
   The order is still forced and trap 29 still has the reasoning: five of the
   seven witnessed columns have more than one writing step
   (`native_checked_at` three, `image_verified_at` four), so the key has to be
   the COLUMN across every writer — and most of those writers are in step 1.
   **Do not DESIGN it early either.** The census it must be designed against is
   the complete one, and step 1 changes that census.
4. **Then the three hygiene items**, any order. The migration-drift content
   check needs `applied_migrations()` to return `statements`, so it needs a
   migration and Ana's push (rule 11); 31 of 34 versions already match byte for
   byte. The graveyard pass moves the three in `SCRIPTS_PENDING_ARCHIVE` to
   `archive/` with README rows, and `repair-combinations.ts` needs a
   `database-log` line in the same change. And 21 of 30 traps are unpinned —
   trap 1 is still the cheapest and highest-consequence.
5. **Round 13 has no theme and needs a gap test before it has one.** Round 12's
   probes killed small-space (84% held), dry shade (73%) and left late-season
   surviving but thin at 62%. Those numbers are in `seed-round12.ts`'s header
   and are the starting point, not a result to reuse — the catalog moved.
   **Two frictions will recur and neither is fixed:** `run-round` still has no
   `--baseline` passthrough, so the rule-1 backup must be taken in the shared
   checkout and copied into the worktree by hand; and `cross-check-plants` will
   flag `plant_type` on every sedge and rush seeded, the round-4 false-positive
   class, left naive on purpose.

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days, so this list cannot become a paragraph again. Read that shape's header
before adding a line: the paragraph this replaced ran for six handoffs and
half its items were misfiled.

_Empty._ The hydrangeoides question was raised and answered the same day, which
is the rule working.

**Re-owned 2026-08-17, and no longer anyone's decision.** Each was parked on
Ana and none was hers. The `Cenolophium` region correction is a fact question
answerable against WCVP. The rounds 1-6 editorial pass and the `modern` re-tag
are both agent work under standing rule 6, her own 2026-07-28 ruling. The two
round-12 photo holds (`Rodgersia pinnata`, `Acorus gramineus`) describe rows
that already have photographs — the hold is that the vision pass could not
confirm the species from them, so what is needed is a better candidate, the
same job the Commons fallback did for _Filipendula purpurea_ in that round.
All four are mechanical work; none goes back on a list of questions.

**Build Backlog rows still owed:** the `curate-styles` withdrawal counter, the
orphaned-photo reconciliation sweep, and **50 of 748 rows still showing a Latin
binomial where a garden name belongs** (round 12's own six are fixed; the rest
predate it).

**Standing:** the next audit is round 13's close or 2026-09-14, whichever
first, early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.

**What this session adds to the same lesson.** Shape 15's own parser was caught
twice reporting **zero parked items while looking at one** — the lead-in
paragraph wraps across lines, and so does an item — so it would have passed
green while seeing nothing. Same family as round 12's two: a tool answering a
narrower question than the one being asked, and the answer promoted. The
difference is that this one was caught by printing the count on a green run
rather than only on failure, which is the argument for the backlog line in
every ratchet.
