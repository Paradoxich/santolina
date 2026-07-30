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

## 2026-07-30 — session/2026-07-30-natives-dedup

**In flight: nothing.** Merged into `main` as `5ada2a9` + `0ff54d7`; no PR
raised, nothing pushed to origin yet. Worktree and branch removed at session end.
The `native_to` / `native_region` duplication carried by the last three handoffs
is closed: `cross-check-native-region --apply` nulls `native_checked_at` on rows
it corrects, so a corrected region requeues its own phrase, and
`cross-check-native-to` reports `contradicts` when phrase and validated tags
share no region. All 277 contaminated stamps cleared, all 695 rows re-checked
(coverage now 695/695). Mechanics in [`curation.md`](../docs/curation.md#native-to),
numbers in that day's `database-log.md` entry. `native_to` was NOT edited and
must not become machine-derived — that ruling is unchanged.

**Next steps, in order:**

1. **Work the 179-row queue in `docs/native-to-review-2026-07-30.md`.** Editorial,
   so it is an agent's job, not Ana's. Read from the top: it is ranked by how much
   of the phrase its validated tags do not support, and the tail is broad wording
   being broad, not defects. Three things to know before starting. The four
   `contradicts` rows are the real rewrites. `Crocus speciosus` may be a **tags**
   problem rather than a phrase problem — its validated range is `Caucasus` alone,
   and the guard only reports that two fields disagree, never which side is wrong.
   And the drafts need checking, not applying: `Perovskia`'s reintroduces "central
   Asia", the exact term its tags exclude. The run's full per-row JSON is committed
   at `apps/web/reference/native-to-crosscheck-2026-07-30.json.gz`; gunzip it into
   `apps/web/reports/native-to-crosscheck.json` to use `--report-only` instead of
   re-billing ~695 Claude calls.
2. **A local Supabase stack — trigger: the next migration, not before.** Nothing is
   blocked on it today. The full rule now lives in `docs/database-log.md` as
   **standing rule 11** rather than being retyped here each session; it names the
   stack command, the restore rehearsal it owes, and the order for the next
   migration.

**Worth knowing before the next long AI pass:** two designs for this session's
check shipped a flooded report into a full catalog run and were killed on
spot-checks of four rows against the database. Trap 23 has both, plus the cheap
rule that saved ~1300 calls — read the first twenty rows of a long run before
letting it finish.

**Open questions:** none blocking.
