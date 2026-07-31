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

## 2026-07-31 — harness session, directly on main (no branch)

**In flight: nothing.** This session added the `/curation-round` skill and three
PreToolUse guards (shared-checkout HEAD moves, `next build` during `next dev`,
blind `--all` catalog runs), committed as `e8708ea` directly on main — no
worktree existed and no other session was live — and pushed. No app code
touched, so no build was run; the guards were tested against synthetic payloads
(all deny/allow/bypass cases pass) and `settings.json` validates. **Hooks arm
from the next session** — hook config is read at session start — so the first
session that trips one should sanity-check the message and its bypass marker.

**Standing item — carried from 2026-07-30, Ana's instruction. Leave it.**
The 151 kept `native_to` rows live in
`apps/web/reference/native-to-review-2026-07-30.json`, not in catalog state, so
`cross-check-native-to` will re-rank them on any later run — expected, not a
regression. The "reviewed and kept" stamp is a migration queued behind standing
rule 11. Do not re-review, rebuild, or store the verdict anywhere else.

```bash
grep -A 12 'Queued behind this rule' docs/database-log.md  # what is still queued behind rule 11
ls supabase/migrations | wc -l                             # 35 means no new migration has landed
```

**Next steps, in order:**

1. **A local Supabase stack — carried, still the trigger for the queued schema
   changes.** Rule 11 holds the stack command, the restore rehearsal it owes,
   and the migration order. If you bring the stack up and apply nothing, say so
   in that session's entry.
2. **Remaining hook candidates, when Ana asks ("later", 2026-07-31):**
   database-log nag after catalog scripts run, SessionStart node-version check
   against `.nvmrc`, and a `.env.local` staging guard. Reasoning for the split
   (what hooks can and cannot check) is in this date's Notion Session Log entry.
3. **Nothing is owed on the catalog.** Pipeline finished, further rounds
   optional (July 29 ruling). Before any long AI pass, traps 23 and 24 in
   `docs/database-log.md`.

**Open questions:** none blocking.
