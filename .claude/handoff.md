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

## 2026-08-18 — Three guards were advising the sweep that would corrupt the data

**Nothing in flight. Nothing uncommitted. The branch is merged and gone.** All
six of the previous entry's next steps are done. `pnpm ci:check` passes in full.
What each commit did is in `git log`; what it found is in `docs/database-log.md`.

**Production is ahead of what a code review would show.** 57 catalog rows
written and no migration: 35 `feed` rewrites, 16 dashes across 14 plants, 8
`bloom_months` widened, 7 prose fields corrected, 2 editorial re-judgements.
Rollback for the copy work is committed at
`apps/web/catalog-archives/session-2026-08-18-copy` (restore rehearsed, 56 rows
differ). `copy:check` and `bloom:prose` are both at **zero** for the whole
catalog for the first time.

**⚠ The pattern of the session: a guard's advice line is load-bearing, and all
three were wrong.** `bloom:prose` said "the prose is usually the more accurate
half; correct the scalar" — following it would have put winter into a summer
grass's bloom months on 6 of 20 rows. `copy:check` reported every `feed` as
"must be fertilize", which for the 22 bulb cases produces text its own sibling
rule flags. Both messages made a sweep look safe, and both were what the
previous handoff had believed when it called the work undecidable. **Read a
guard's output against the data before acting on its recommendation**; the
recommendation is written by someone who has not seen this catalog.

**A prose fix to a curated row costs its editorial verdict.** `description` is a
watched criterion, so this session's own `Magnolia liliiflora` fix withdrew its
approval, the same shape it opened on with `Malus spectabilis`. Both re-judged.
A copy sweep and an editorial pass are coupled; budget for the second.

**The editorial voice pass is mine to perform.** Ana's instruction this session:
do it rather than routing copy back to her.

---

**Next steps, in order.**

1. **Harden the weekly backup.** The workflow is proven green on the bumped
   actions (run 32126932071); its two remaining weaknesses are now the ratchet
   entry `weekly-backup-has-no-freshness-check`, which carries the reasoning and
   the three-part remedy. Take it from there, not from here — it is first because
   a backup nobody is watching is the one failure that is only noticed at
   restore.

2. **`Lythrum salicaria` re-adds when round 14 opens.** Decision already made
   and recorded at `docs/curation.md#round-runbook`; nothing to do until there
   is a round to put it in. `Iris pseudacorus` stays cut.

3. **Read the 57 rewritten rows if you want them in your voice.** They are
   merged and live, written to the copy rules and voice-passed by me under this
   session's instruction. This is a taste review, not a correctness one.

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days.

_Empty._ Everything raised this session was decided in it.

**Standing:** the next audit is round 14's close or 2026-09-14, whichever
first. Fresh session.
