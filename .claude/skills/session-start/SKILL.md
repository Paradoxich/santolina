---
name: session-start
description: Start an isolated work session — read the handoff, create a worktree + branch, verify clean state. Use when the user invokes /session-start or asks to start a work session.
argument-hint: [short-topic-slug e.g. diary-reparent]
---

You are starting a new work session in this repo. Follow these steps in order and report the outcome of each briefly.

## 1. Run the commands before you read any prose

**A command's output is current. A sentence in a doc is current only until the
code moves, and nothing announces when it does.** So establish state from the
commands first, and read prose afterwards, knowing which parts of it are checked.

```bash
cd apps/web && pnpm backlog     # what is left, and how stale the handoff is
```

That prints the mechanical backlog (recomputed every run, so an empty list means
empty and never means forgotten), the doc claims that are held to what the repo
computes, and how many commits the repo has moved since the handoff was last
rewritten. It also names the two kinds of work no command can reach.

Report its output to me before summarising anything.

## 2. Know which docs are authoritative and which are dated records

This is the difference between reading a doc and believing it. Tell me if you
find yourself relying on anything in the third column.

| Doc                                                | What it is                        | Trust                                                     |
| -------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| `docs/catalog-state.md`, `docs/round-runbook.md`   | **Generated**, CI-diffed          | Current by construction. Never hand-edit.                 |
| `CLAUDE.md`, `docs/curation.md`, `architecture.md` | Live rules and reasoning          | Rules and _why_ hold; a state claim in them may not.      |
| `docs/database-log.md` — standing rules and traps  | Live                              | Counts and the family table are checked by `docs:claims`. |
| `docs/database-log.md` — `## Sessions` and below   | **Dated event records**           | True of their date. Not a claim about today.              |
| `docs/*-YYYY-MM-DD.md` (audits, reviews)           | **One run's findings, frozen**    | Historical. Several central findings are already fixed.   |
| `.claude/handoff.md`                               | In flight, rewritten each session | Check its age above before trusting its next steps.       |
| Notion **Build Backlog**                           | Product decisions                 | The source of truth for what to build. Not in the repo.   |

**The dated reports are the trap.** They are written in the present tense, they
read as authoritative, and they are snapshots. Their still-open items that the
repo can verify have been moved into ratchets — so if a finding matters, check
whether `invariants:check` still lists it rather than believing the report.

## 3. Read the handoff

Read `.claude/handoff.md` (at the repo root, on main) and summarize:

- what the last session did,
- its listed next steps,
- any open questions.

If my request for this session conflicts with or duplicates the listed next
steps, say so now instead of silently proceeding. If the file doesn't exist, note
that and continue. If `pnpm backlog` reported it as many commits behind, say so
in the same breath as the summary — its next steps may already be done.

## 4. Check for other active sessions

Run `git worktree list` and `git branch --list 'session/*'`.

- If other session worktrees or branches exist, list them and tell me what they appear to be working on (branch names + last commit message). Do not touch them.
- If another session's branch has touched files this session will likely also touch, warn me explicitly before continuing.

## 5. Create this session's isolated workspace

1. `git fetch` and make sure local main is up to date (`git pull --ff-only` on main). If main can't fast-forward, stop and tell me.
2. Determine the session name: `session/<YYYY-MM-DD>-<topic>` where topic is `$ARGUMENTS` if provided; otherwise derive a 1–3 word slug from my request and confirm it with me.
3. Create the worktree and branch in one step, as a sibling of the repo directory:
   `git worktree add ../<repo-name>-<topic> -b session/<YYYY-MM-DD>-<topic> main`
4. Do ALL work for this session inside that worktree directory. Never edit files in the main checkout during this session.

## 6. Make the workspace runnable

Inside the new worktree:

- If dependencies are needed and not present (no `node_modules`), install them.
- Run `git status` and confirm it is clean.

If this session needs a dev server, two things will cost you time silently:

- **Do not start it with `preview_start`.** That reads `.claude/launch.json` from the
  repo root and serves the **main checkout** — you end up reading main's code while
  editing the worktree, and nothing in the output says so. Start it by hand from the
  worktree directory and verify the cwd.
- **Prefer port 3000, and know what you lose off it.** Getting into the app is fine on
  any port — the demo sign-in on `/login` is anonymous and redirects origin-relative, so
  it never touches the allow-list. But **real sign-in is pinned to :3000**: the Supabase
  redirect allow-list holds `localhost:3000` and nothing else, so on any other port magic
  link and Google OAuth ignore `emailRedirectTo` and bounce you to `/login` or to
  santolina.app, with nothing in the app's own code to blame. If this session touches
  the sign-in flow or needs a real (non-anonymous) account, you need :3000 — and only one
  worktree can hold it, so stop another session's server first and tell me.

## 7. Confirm

End with a short block I can see at a glance:

- Worktree path
- Branch name
- Handoff next-steps carried into this session (if any)
- Any warnings from step 4

Then wait for my instructions (or proceed with the task I gave when invoking this command).
