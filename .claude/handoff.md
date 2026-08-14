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

## 2026-08-14 — Round 11, and the style-tag bug it uncovered

**In flight: branch `session/2026-08-14-round-11`, 2 commits (`83b1912`, `d939bb3`), NOT pushed.** Worktree `../santolina-round-11`. Ana has not called merge yet.

Round 11 seeded 25 species (695 → 720 plants, 1735 → 1795 pairs). `verify-round` 0 failures, `check-round-scope` 0 out-of-scope and 0 waived — first round needing no waivers. No-image plants: 0. Full entry and traps 26/27 in `docs/database-log.md`.

**The round was run to test the pipeline, and it found a three-week-old silent bug.** `curate-plants` had never written a style tag (unreachable guard against a `NOT NULL DEFAULT '{}'` column), and the belief that it did was used to stamp 100 rows of rounds 9/10 as style-judged while empty. Fixed for new rounds; the 100 old rows are untouched.

**Next steps, in order:**

1. **Ana wants a full multi-agent pipeline audit, in a fresh session** (this one's context was too large). She asked the right question — "each session adds scripts and something new always breaks". The numbers that frame it: **72 scripts, 6 test files.** The audit's questions, each of which would have caught a real past failure: does every field that should be written have proof it was written; does every stamp column have exactly one writer; **is every "is this missing?" predicate reachable given that column's DB default** (this one finds trap 26 mechanically, in seconds); which of the 72 scripts are dead, duplicated or spent one-time repairs; which of the 27 traps could be a test instead of a paragraph.
2. **Do this first, it is ten minutes and it is still open:** `curate-styles` is `perRound: false` in `round-status.ts`, so `verify-round` never checks style tags when a round closes — the exact hole trap 26 fell through. **My fix to `curate-plants` has never actually executed** (every one of the 720 rows now carries `style_checked_at`, so the path cannot fire until the next seed). Types and 208 tests pass; that is not the same as working, per standing rule 7. Making the round-close check cover style means it does not matter whether the fix is right — a silent no-op fails the round instead of hiding for three weeks.
3. **Four decisions waiting on Ana**, all in the round-11 log entry: the 100 style-less stamped rows of rounds 9/10 (frozen rounds — needs `--all --why`); `Hydrangea anomala` vs `H. petiolaris` both in catalog (Trefle holds both accepted, so nothing was deleted, but a beginner sees two near-identical climbing hydrangeas); `Cenolophium denudatum`'s region correction (thin evidence, drops Northern Europe from a plant called Baltic parsley); 5 rows held for want of a usable photograph.
4. **Backlog additions this session** (Notion): editorial pass over rounds 1–6 (418 plants never examined, ~$10–20 and one session), and the `modern` style tag under-reporting on herbaceous perennials (a re-tag, not a round).

**Known friction, will recur next round:** standing rule 1 says take the pre-seed backup in the shared checkout (so it survives `git worktree remove`), but `resolveBaselineDir` only scans `process.cwd()/backups`, so obeying the rule makes `run-round` refuse to start. Copy the snapshot into the worktree; there is no `--baseline` passthrough on `run-round`.

**Open questions:** whether to merge this branch as-is or fold the audit's fixes in first.
