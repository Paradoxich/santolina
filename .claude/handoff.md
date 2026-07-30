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

## 2026-07-30 — session/2026-07-30-backups

**In flight: nothing.** Merged as [PR #157](https://github.com/Paradoxich/santolina/pull/157)
(`7425d10`); worktree removed, branch deleted local and origin. The five
unbacked-up tables are covered: `backup-database.ts` (`pnpm db:backup`, standing
rule 10 in `docs/database-log.md`) plus a weekly cron
(`.github/workflows/db-backup.yml`, Mondays 03:12 UTC, dispatch-tested green,
`SUPABASE_DB_URL` secret set). A failed cron run emails Ana — silence means it
ran. Also ruled this session: `README.md` keeps "intelligent recommendations";
question closed.

**Next steps, in order:**

1. **The `native_to` / `native_region` duplication** (carried). WCVP as the single
   authority feeding `native_region` mechanically; `native_to` stays hand-owned
   copy that gets _checked_ against it. Not a round fix — `native_to` is
   voice-passed copy that must not become machine-derived.
2. **A local Supabase stack — trigger: the next migration, not before.** Nothing
   is blocked on it today; the rule (agreed with Ana July 30) is that **no new
   migration is applied until the local stack exists and has replayed the
   existing 35 first**, and CLI-driven migrations (`supabase db push`) lands in
   that same session with nothing else in it — it is the only work that touches
   prod schema. Why it matters: `supabase/` holds only `migrations/`, no
   `config.toml`, so migrations and RLS have only ever run in production, and a
   wrong RLS policy fails silently (the bare-`name` → `gardens.name` storage bug
   is the class this catches). The stack is also the free restore target the db
   backup has never been rehearsed against — rehearse
   `pg_restore --data-only` from a `db-backups` dump in that same session. Disk
   was the blocker, not RAM: 11 GB free July 28, 20 GB free July 30 — the lighter
   `supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,inbucket,vector,logflare`
   (≈2 GB, Postgres + auth + PostgREST) fits; cap Docker's disk allowance so the
   VM can't balloon.
