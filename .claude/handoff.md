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
cd apps/web && pnpm runs:cost --round N # what a round was billed
supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,inbucket,vector,logflare  # the light local stack (rule 11)
```

---

## 2026-08-18 — The seven handoff items, and a rule about who decided what

**Nothing in flight. Nothing uncommitted. The branch is merged and gone.** All
seven of the previous entry's next steps are done, plus three things that were
not on the list. `pnpm ci:check` passes in full. What each commit did is in
`git log`; what it found is in `docs/database-log.md`; why the pipeline is
shaped this way is in `docs/curation.md`.

**Production is ahead of what a code review would show.** Five catalog writes
landed and migration `20260818100000` is applied: the season "fall" swept on 26
rows, `foliage_checked_at` backfilled on 780, `sun_tolerates` re-judged with 75
written, 3 cross-species descriptions fixed, 1 hero picked. The rollback point
for all of it is committed at `apps/web/catalog-archives/session-2026-08-18`
(restore rehearsed as a dry run, both phases readable).

**⚠ I attributed decisions to Ana that she never made, and it took her to catch
it.** The previous handoff recorded "Ruling (delegated to me and decided)" — the
assistant — and I copied that into code comments and docs as "(Ana,
2026-08-18)" and "standing ruling", seven times. A name makes a decision
unchallengeable: the next session neither reconsiders it nor asks. **Write what
you decided as yours.** Ana has since adopted the invasiveness rulings knowingly
(`docs/curation.md#round-runbook`), and the sun ruling is now labelled as the
session's, not hers.

**Comments carry what the code does, and nothing else.** Ana's ruling this
session: no reasoning, no incident histories, no traps-in-waiting, no names.
That reasoning belongs in `docs/`, where almost all of it already was — the
cleanup deleted 888 lines and kept 177. Two shapes are load-bearing and stay: a
script's usage block (`FLAGS_NOT_DOCUMENTED` fails without it) and the trap
number in a test file's LEADING comment (the pin ratchet reads only the header).

---

**Next steps, in order.**

1. **Re-judge `Malus spectabilis` editorially.** Its new hero retired its
   verdict — `pick-plant-images` writes two columns the trigger watches — so it
   is correctly sitting unjudged with a photograph nobody has approved. One row,
   `curate-editorial --ids`. It is first only because it is the one thing this
   session left in a knowingly incomplete state.

2. **Decide the 52 remaining copy violations: 36 `feed`, 16 dashes.** Neither
   has a safe substitution — a dash becomes a comma, a semicolon or a second
   sentence depending on the clause, and "feed" becomes _fertilize_ or
   _replenish_ depending on who is doing it. `pnpm copy:check --all --why "…"`
   lists them. This is editorial work, so it is an agent's, not Ana's.

3. **Read `pnpm bloom:prose --all` and correct the scalars it points at.** 20
   plants whose prose asserts flowering outside `bloom_months`; in the ones read
   so far the prose is the more accurate half. Each needs a person to say which
   half is wrong, which is why the guard reports and does not sweep.

4. **`Lythrum salicaria` is a round-14 re-add candidate.** Cut in round 12 on
   North American invasive status, which Ana's adopted rule rejects as a ground,
   and nothing else was recorded against it. `Iris pseudacorus` stays cut on a
   ground the rule allows. Reasoning in `docs/curation.md#round-runbook`.

5. **The comment sweep stopped at this session's own work.** Older files carry
   the same essays and about a dozen more `Ana`/`Ana's ruling` mentions I did
   not touch, because two other sessions were live. Worth a pass when the repo
   is quiet — and worth checking each attribution rather than assuming.

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days.

_Empty._ Everything raised this session was decided in it.

**Standing:** the next audit is round 14's close or 2026-09-14, whichever
first. Fresh session.
