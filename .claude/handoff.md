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

## 2026-08-18 — The two stamp ratchets, and four traps the backlog had wrong

**Nothing in flight. Nothing uncommitted. No migration, no prod catalog write,
no model calls.** `pnpm ci:check` passes in full on the committed tree, database
jobs included. What each commit did is in `git log`; what it found is in
`docs/database-log.md`.

**`STAMPS_WITHOUT_WRITERS` and `REPORT_ONLY_STAMPS` are both empty, and traps
unpinned went 21 → 17.** Every ratchet that is not zero is recorded with a
reason and `pnpm backlog` prints it.

**⚠ The pattern of the session, and it is the same one as the last: a recorded
reason is a dated claim, not a fact.** Three of the four "attribution only" trap
entries were wrong about their own remedy — trap 16's named `scope.test.ts`,
which tests CLI flag parsing and never touches pairings or `cleared_at`. And the
plan for `cross-check-plants` would have parked ~55 rows on a FAIL-level round
close with nothing able to settle them, because it prescribed a selector copied
from a guard that has an `--apply` to earn it back. **Read the consumer, and read
the test, before acting on what a list says about them.**

**Three guards caught me and all three were right.** The stale-hatch check
noticed that a header sentence reading "Trap 1 is NOT pinned here" had _pinned_
trap 1. `trap-pins.test.ts` failed because it asserted another file's current
contents rather than the rule. And a local-stack run recorded `evidence
CONTRADICTED` because I minted a stamp before `beginRun`, so it landed outside
the run window — invisible to typecheck and to all 635 unit tests.

**Two new settlement paths exist and neither has run against prod, because there
is nothing yet to settle.** `apply-native-to-fixes --review-keep` and
`apply-botanical-fixes.ts` were both exercised end to end on the local stack.

---

**Next steps, in order.**

1. **`Lythrum salicaria` re-adds when round 14 opens.** Decision already made and
   recorded at `docs/curation.md#round-runbook`; nothing to do until there is a
   round to put it in. `Iris pseudacorus` stays cut. Carried forward, still the
   only open item there.

2. **Round 14 is the first real test of both new paths.** Step 5 will now leave
   its disagreements unstamped and write `reference/botanical-flags-<date>.json`;
   that file needs a person's verdicts and a run of `apply-botanical-fixes.ts`
   before round close will pass. This is the intended behaviour, not a snag — but
   it is the first round where skipping the queue blocks the close.

3. **Watch the first Thursday backup run.** Cron is Mondays and Thursdays and has
   only ever run on Mondays; 2026-08-17's scheduled run succeeded. `backup:freshness`
   fails the day it stops landing, so this is a read of
   `gh run list --workflow db-backup.yml`, not a task — first Thursday is 2026-08-20.

Everything else mechanical is in a ratchet. The three unread combo columns sit in
`COLUMNS_NO_PRODUCT_READS`, waiting on a Notion decision about whether the
companion card says why two plants pair. Hand-rolled paging in `backup-catalog`
and `restore-catalog` stays at 2 deliberately: both page correctly, and the
duplication is not worth touching the backup and restore scripts to remove.

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14 days.

_Empty._ The one fork raised this session — where the `--review-keep` writer
should live — was decided in it.

**Standing:** the next audit is round 14's close or 2026-09-14, whichever first.
Fresh session.
