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

## 2026-08-18 — The last five open findings, and the guard that watches the backup

**Nothing in flight. Nothing uncommitted. The branch is merged and gone.** No
migration, no catalog write, no model calls — this session changed only code and
guards. `pnpm ci:check` passes in full, database jobs included. What each commit
did is in `git log`; what it found is in `docs/database-log.md`.

**`OPEN_FINDINGS` is empty for the first time.** All five closed: the backup
freshness gap, editorial approvals that could not be withdrawn, the sun audit
aimed at a derived column, the combo fields nothing reads, and the common-name
finding that had already been fixed and nobody noticed.

**⚠ The pattern of the session: three of the five findings were wrong about
something.** `combo-fields-unchecked` claimed a broken companion card — the card
renders thumbnails and reads none of the three columns, so no user ever saw it,
and its prescribed remedy would have gated round close on data the product does
not consume. `common-name-never-judged-at-seed` outlived its own remedy by a day
and a whole round. `sun-audit`'s prose still called an archived script "queued
for archive". **A recorded finding is a claim with a date on it, not a fact** —
check its consumer before acting on its remedy. Two of the three needed only a
look at who reads the column.

**Two guards caught me mid-session, and both were right.** The stale-hatch check
rejected a widening of shape 2 that read a TYPE ANNOTATION as a stamp writer;
the pre-commit hook rejected a database-log entry at 50 lines against a 25-line
target. Neither would have been caught by review.

**Backlog items are 2-4 sentences.** Ana's instruction this session, after an
item of mine ran to a paragraph of reasoning: what could be built, what it rests
on, the one blocker. The reasoning goes in the commit and the log.

---

**Next steps, in order.**

1. **`Lythrum salicaria` re-adds when round 14 opens.** Decision already made and
   recorded at `docs/curation.md#round-runbook`; nothing to do until there is a
   round to put it in. `Iris pseudacorus` stays cut. Carried forward from the
   previous entry, still the only open item there.

2. **Watch the first Thursday backup run.** The cron is now Mondays and
   Thursdays and has only ever run on Mondays. `backup:freshness` fails the day
   it stops landing, so this is a read of `gh run list --workflow db-backup.yml`,
   not a task — first Thursday is 2026-08-20.

Everything else mechanical is in a ratchet and `pnpm backlog` prints it. The
three unread combo columns are recorded in `COLUMNS_NO_PRODUCT_READS`, waiting on
a Notion decision about whether the companion card says why two plants pair.

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days.

_Empty._ Everything raised this session was decided in it.

**Standing:** the next audit is round 14's close or 2026-09-14, whichever first.
Fresh session.
