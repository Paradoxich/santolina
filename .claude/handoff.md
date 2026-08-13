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

## 2026-08-13 — blog-evidence scan + fix/bloom-status-wrap, merged as PR #159 (`d27f04f`)

**In flight: nothing.** Third session today. Gathered the evidence for the
part-3 database post (findings: today's Notion Session Log entry and the
2026-08-13 database-log entry), then fixed what the scan surfaced: the
December-wrap `getBloomStatus` bug (PR #159, merged), the Calico aster rename
and the wallflower hero ingest (both direct guarded writes, logged). No-image
plants is 0/695 for the first time. The colour-bucket session's local-only
commits (`d0bf953` + handoff) were still unpushed when PR #159 landed on
origin; reconciled with merge `4de33f8`, everything pushed.

**Standing shape (unchanged):** any migration session is laptop
`pnpm db:backup` → local replay → restore rehearsal → `db push`, per rule 11.
Docker is capped at 8 GB and Docker Desktop does not auto-start.

**Next steps, in order:**

1. **Ana drafts post 3** — the evidence pack is in today's Notion Session Log
   entry (incidents with numbers, the two corrected figures, the
   diary-post-overlap warning). The December-wrap incident now has its ending
   (found and fixed same afternoon), which is the shape posts 1 and 2 ran on.
2. **Pick the next build item from the Notion Build Backlog** — dashboard
   polish and the 8 audit findings are the queued front-end thread (Notion
   Session Log, sidebar-redesign entry). The database column is clean:
   nothing owed, remaining items are trigger-gated or Ana's decisions
   (Privacy Policy, Pro).
3. **Nothing is owed on the database or the catalog.** Pipeline finished,
   further rounds optional (July 29 ruling). Before any long AI pass, traps 23
   and 24 in `docs/database-log.md`.
4. **Remaining hook candidates, when Ana asks ("later", 2026-07-31):**
   database-log nag after catalog scripts run, SessionStart node-version check
   against `.nvmrc`, and a `.env.local` staging guard. Reasoning in the
   2026-07-31 Notion Session Log entry.

**Open questions:** none blocking.
