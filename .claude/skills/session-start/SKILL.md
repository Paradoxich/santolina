---
name: session-start
description: Start an isolated work session — read the handoff, create a worktree + branch, verify clean state. Use when the user invokes /session-start or asks to start a work session.
argument-hint: [short-topic-slug e.g. diary-reparent]
---

You are starting a new work session in this repo. Follow these steps in order and report the outcome of each briefly.

## 1. Read the handoff first

Read `.claude/handoff.md` (at the repo root, on main). If it exists, summarize for me before doing anything else:

- what the last session did,
- its listed next steps,
- any open questions.

If my request for this session conflicts with or duplicates the listed next steps, say so now instead of silently proceeding. If the file doesn't exist, note that and continue.

## 2. Check for other active sessions

Run `git worktree list` and `git branch --list 'session/*'`.

- If other session worktrees or branches exist, list them and tell me what they appear to be working on (branch names + last commit message). Do not touch them.
- If another session's branch has touched files this session will likely also touch, warn me explicitly before continuing.

## 3. Create this session's isolated workspace

1. `git fetch` and make sure local main is up to date (`git pull --ff-only` on main). If main can't fast-forward, stop and tell me.
2. Determine the session name: `session/<YYYY-MM-DD>-<topic>` where topic is `$ARGUMENTS` if provided; otherwise derive a 1–3 word slug from my request and confirm it with me.
3. Create the worktree and branch in one step, as a sibling of the repo directory:
   `git worktree add ../<repo-name>-<topic> -b session/<YYYY-MM-DD>-<topic> main`
4. Do ALL work for this session inside that worktree directory. Never edit files in the main checkout during this session.

## 4. Make the workspace runnable

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

## 5. Confirm

End with a short block I can see at a glance:

- Worktree path
- Branch name
- Handoff next-steps carried into this session (if any)
- Any warnings from step 2

Then wait for my instructions (or proceed with the task I gave when invoking this command).
