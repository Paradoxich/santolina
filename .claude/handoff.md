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

## 2026-07-30 — session/2026-07-30-migration-drift

**In flight: nothing.** Merged as [PR #150](https://github.com/Paradoxich/santolina/pull/150)
(`73c96f8`); worktree removed, branch deleted, `../santolina-explore-ranking` and
its dev server on :3000 cleaned up too. Trap 14's migration-drift check shipped
(`pnpm migrations:check`, CI job `migration drift (main only)`) and **its first
real run on main passed** — reasoning lives in `docs/database-log.md` trap 14. The
four UI sessions that had been living in this file moved to `docs/architecture.md`
§32/§33/§34/§35 and `DESIGN_SYSTEM.md`.

**Next steps, in order:**

1. **Restructure `docs/architecture.md` around features rather than numbered
   entries.** Agreed with Ana this session, deliberately not started. Sequence
   matters: **named anchors and a link check first** — ~142 `§` references exist,
   48 of them outside the file, which is why an earlier session declined the split.
   Only then regroup, editing in place. New rule to encode: a decision that
   supersedes another **replaces** it; the rejected alternative survives, the stale
   current-state description does not. §32 is the worked example — it needed an
   amendment bolted on because its number is an address other text cites.
2. **The `native_checked_at` re-run**, now that the 5a WCVP lookup is guarded. How
   many rows: `select count(*) from plants where native_checked_at is not null`.
3. **The `native_to` / `native_region` duplication.** One fact in two shapes.
   Destination: WCVP as single authority feeding `native_region` mechanically,
   `native_to` staying hand-owned copy that gets _checked_ against it. Not a round
   fix — the two are partly causal, and `native_to` is voice-passed copy that must
   not become machine-derived.

**Open questions:** none blocking.

**Everything previously carried here now lives in Notion** under Build Backlog →
_Carried from the handoff restructure — needs triage_. It is untriaged: owner tags
and time-horizon placement are Ana's calls. Two backlog items are ticked-ready
there (Explore ranking and the `image_urls` trim, both shipped in PR #149).
