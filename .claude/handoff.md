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

## 2026-08-13 — session/2026-08-13-colour-bucket-rule, merged as `d0bf953`

**In flight: nothing.** Second session today (the local-stack session merged
and closed this morning). This one closed the round 8 colour-bucket backlog
item: the mixed-foliage rule (ground colour, not marking) is written into
`lib/foliage-colors.ts` — comment-only, merged as `a46561d`, worktree and
branch removed. The item's Aucuba rider was stale (prod already `true` since
2026-07-28; no data touched), and the Pro item's "no backup at all" warning
predated the July 30 backups session — both Notion backlog notes corrected in
place. Detail: today's Notion Session Log page. **Main is not pushed** —
`d0bf953` and the handoff commit exist only locally.

**Standing shape (unchanged):** any migration session is laptop
`pnpm db:backup` → local replay → restore rehearsal → `db push`, per rule 11.
Docker is capped at 8 GB and Docker Desktop does not auto-start.

**Next steps, in order:**

1. **Pick the next build item from the Notion Build Backlog** — dashboard
   polish and the 8 audit findings are the queued front-end thread (Notion
   Session Log, sidebar-redesign entry). The database column is now clean:
   nothing owed, remaining items are trigger-gated or Ana's decisions
   (Privacy Policy, Pro).
2. **Nothing is owed on the database or the catalog.** Pipeline finished,
   further rounds optional (July 29 ruling). Before any long AI pass, traps 23
   and 24 in `docs/database-log.md`.
3. **Remaining hook candidates, when Ana asks ("later", 2026-07-31):**
   database-log nag after catalog scripts run, SessionStart node-version check
   against `.nvmrc`, and a `.env.local` staging guard. Reasoning in the
   2026-07-31 Notion Session Log entry.

**Open questions:** none blocking.
