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

## 2026-07-30 — session/2026-07-30-token-docs

**In flight: nothing.** Merged as [PR #155](https://github.com/Paradoxich/santolina/pull/155);
worktree removed, branch deleted local and origin. The token/design-system audit
became a consolidation: `docs/token-taxonomy.md` deleted (grammar moved into
`DESIGN_SYSTEM.md`, six referencers repointed), all five ramp-contrast claims
recomputed against the final ramps, `--landing-scrim` now derives from sage-950,
and `tokens:check` grew — check B scans compound values, new check D verifies
icon colours (weather set exempt by design), check A covers root-level docs.
Rules and rulings live in `DESIGN_SYSTEM.md`; nothing durable is only here.

**A second session was active in parallel:** [PR #156](https://github.com/Paradoxich/santolina/pull/156)
(`session/2026-07-30-agent-rules`, worktree `../santolina-agent-rules`) was open
when this session closed. If it finished after this, its entry replaces this one.

**Next steps, in order:**

1. **The `native_to` / `native_region` duplication** (carried; the other two
   steps from the previous entry shipped — the architecture anchor restructure
   in PRs #151–153, now guarded by `pnpm docs:links`, and the WCVP tail per
   `docs/database-log.md`). Destination unchanged: WCVP as single authority
   feeding `native_region` mechanically; `native_to` stays hand-owned copy that
   gets _checked_ against it. Not a round fix — `native_to` is voice-passed copy
   that must not become machine-derived.

**Open questions:** none blocking.
