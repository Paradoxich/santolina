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
cd apps/web && pnpm migrations:check            # is the live schema what the repo says
cd apps/web && pnpm catalog:state:check         # is the catalog doc stale
supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,inbucket,vector,logflare  # the light local stack (rule 11)
```

---

## 2026-08-13 — session/2026-08-13-local-stack

**In flight: this branch, unmerged.** The local Supabase stack now exists and
the whole rule-11 backlog cleared through it in one session: pre-migration
backup taken, all 35 migrations replayed clean, `pg_restore` rehearsed (every
table count matched live), and two migrations pushed to prod by Ana
(`20260813110500` reviewed-and-kept stamp + 151-row backfill, `20260813120000`
explicit table grants). `migrations:check` is green: 37 committed = 37 applied.
Full detail in the 2026-08-13 entry in `docs/database-log.md`.

**Two findings worth knowing before trusting old text:** trap 16's premise was
false (`plant_combinations.created_at` existed since the initial schema — the
fix was code-only, round 9 now exits 0 FAIL), and new trap 25 (production's
table grants existed in no migration; a fresh replay was unreadable by the app
until `20260813120000`). Both recorded in the traps section.

**The 151 kept `native_to` rows are now stamped in the database** —
`native_to_reviewed_at`, trigger-cleared on phrase edits. The 2026-07-30
standing item is closed; `cross-check-native-to` excludes stamped rows from its
gap queue and says how many it held out.

**Next steps, in order:**

1. **Merge this branch** (PR review, then delete the worktree per session-end).
   Everything on it is docs, scripts, and the two already-pushed migrations —
   prod already runs the schema this branch records, so an unmerged branch is
   the drift.
2. **Remaining hook candidates, when Ana asks ("later", 2026-07-31):**
   database-log nag after catalog scripts run, SessionStart node-version check
   against `.nvmrc`, and a `.env.local` staging guard. Reasoning in the
   2026-07-31 Notion Session Log entry.
3. **Nothing is owed on the catalog.** Pipeline finished, further rounds
   optional (July 29 ruling). Before any long AI pass, traps 23 and 24 in
   `docs/database-log.md`.

**Open questions:** none blocking.
