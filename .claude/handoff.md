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

**Write the command, not the claim.** A state claim is true when typed and rots
from then on: "CI is waiting on secrets" was wrong within a day and survived three
sessions, then reached Ana a fourth time. "PR #128 merged as `06ab97a`" is a
record and stays true. **The test is tense, not topic.** Catalog numbers are
generated into `docs/catalog-state.md` — link, never retype.

**If two sessions run at once, the last to finish rewrites this file.** Nothing is
lost: the durable half of a session belongs in the docs above before it belongs
here. Fold any still-open next step from the entry you replace into your own.

```bash
gh pr list --state open                 # what is open
git worktree list                       # who else is working, and where
git branch --list 'session/*'           # session branches alive
gh run list --branch main --limit 5     # did CI pass on main
gh secret list                          # which repo secrets exist
lsof -nP -iTCP:3000 -sTCP:LISTEN        # is :3000 free for a real sign-in
cd apps/web && pnpm migrations:check            # is the live schema what the repo says
cd apps/web && pnpm catalog:state:check         # is the catalog doc stale
cd apps/web && pnpm round:progress --round <n>  # what a round still owes
```

---

## 2026-07-30 — session/2026-07-30-179

**In flight: nothing.** Merged into `main` as `2fffb5a`, pushed, CI green (both
main-only jobs ran rather than skipping). No PR raised. Worktree and local branch
removed at session end; **`origin/session/2026-07-30-179` still exists** and is
fully merged, so `git push origin --delete session/2026-07-30-179` is safe
whenever you want it gone. The 179-row `native_to` queue the
last handoff carried is worked: **32 phrases rewritten, 151 kept, all four
`contradicts` closed**, every rewritten row re-passing the guard at gross 0,
contradicts 0. Six `native_region` rows were corrected on the way (trap 24).
Method and rulings in [`curation.md`](../docs/curation.md#native-to), numbers in
that day's `database-log.md` entry. `native_to` was NOT machine-derived — every
edit was decided against WCVP country evidence and committed with its reason.

**Standing item — do not work around this one. Ana's instruction, 2026-07-30.**

The 151 kept rows are recorded in
`apps/web/reference/native-to-review-2026-07-30.json`, **not in catalog state**.
Nothing in the database says a person read them, so `cross-check-native-to` will
rank them again on any later run, and the queue will look unworked when it is
not. The fix is a "phrase reviewed and kept" stamp on `plants`, which is a
migration, so it is **queued behind standing rule 11** and listed in that rule
alongside trap 16's `plant_combinations` timestamp.

Until that migration lands: **leave it.** Do not re-review those rows, do not
rebuild the triage, and do not add a workaround that stores the verdict
somewhere else — a second home for it is the failure this repo keeps paying for.
A future run re-ranking them is expected, not a regression. Check before assuming
it is still open:

```bash
grep -A 12 'Queued behind this rule' docs/database-log.md  # what is still queued behind rule 11
ls supabase/migrations | wc -l                             # 35 means no new migration has landed
```

**Next steps, in order:**

1. **A local Supabase stack — still the trigger for everything above.** Rule 11
   holds the stack command, the restore rehearsal it owes, the order for the next
   migration, and now the list of what is waiting on it. Two queued schema changes
   make it worth doing rather than merely owed. If you bring the stack up and
   apply neither, say so in that session's entry — an unexplained empty list next
   time reads as "there was nothing".
2. **Nothing else is owed on the catalog.** The pipeline is finished and a further
   round is optional (July 29 ruling). `docs/native-to-review-2026-07-30.md` is
   deliberately **not** regenerated: a true refresh is a whole-catalog run
   (~695 Claude calls, ~1 hour), and its header records what was applied, so read
   the table as the input to that pass rather than current state.

**Worth knowing before the next long AI pass:** trap 23 still applies — read the
first twenty rows of a long run before letting it finish. Added this session,
**trap 24**: a report-only guard run stamps every row it decided, including the
ones it decided were wrong, so `--new-only` skips them forever. Read the tail of
a report-only run and re-run with `--apply` in the same session.

**Open questions:** none blocking.
