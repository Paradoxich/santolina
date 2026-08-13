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

## 2026-08-13 — session/2026-08-13-local-stack, merged as PR #158 (`49dc4d8`)

**In flight: nothing.** The local-stack session is fully closed: branch merged
and deleted everywhere, worktree removed (the new worktree-removal guard fired
for the first time and worked — artifacts were checked, all reproducible),
orphaned Docker volumes pruned. The rule-11 queue is cleared; migrations
`20260813110500` (reviewed-and-kept stamp, 151 rows backfilled) and
`20260813120000` (explicit table grants, trap 25) are applied to prod. Trap 16
is corrected in place — its premise was false, the fix was code-only. Full
detail: the 2026-08-13 entry and traps 16/25 in `docs/database-log.md`.

**Standing shape from here:** any future migration session is laptop
`pnpm db:backup` → local replay → restore rehearsal → `db push`, per rule 11's
rewritten text. The stack command is above; Docker's disk allowance is capped
at 8 GB and Docker Desktop does not auto-start.

**Next steps, in order:**

1. **Nothing is owed on the database or the catalog.** Pipeline finished,
   further rounds optional (July 29 ruling). Before any long AI pass, traps 23
   and 24 in `docs/database-log.md`.
2. **Remaining hook candidates, when Ana asks ("later", 2026-07-31):**
   database-log nag after catalog scripts run, SessionStart node-version check
   against `.nvmrc`, and a `.env.local` staging guard. Reasoning in the
   2026-07-31 Notion Session Log entry.
3. **Pick the next build item from the Notion Build Backlog** — dashboard
   polish and the 8 audit findings were the queued front-end thread before this
   infrastructure detour (Notion Session Log, sidebar-redesign entry).

**Open questions:** none blocking.
