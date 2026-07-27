---
name: session-end
description: End the work session — commit remaining work, ask merge-or-leave, clean up, write the handoff. Use when the user invokes /session-end or asks to wrap up the session.
---

You are ending this work session. Follow these steps in order. Never skip step 3's question, and never delete a branch that has not been merged.

## 1. Sweep for uncommitted work

In this session's worktree, run `git status` and `git diff --stat`.

- If there is uncommitted work, group it into logical commits with clear messages and commit it on the session branch. Do not leave anything uncommitted or stashed.
- If there are untracked files that look like scratch/debug output, list them and ask me whether to commit, delete, or ignore them.

## 2. Summarize the session's work

Show me a compact summary:
- `git log main..HEAD --oneline` (all commits this session made)
- One or two sentences per commit on what it does
- Whether the app builds / tests pass (run the project's build or test command if one exists; report the result honestly — do not merge broken work without flagging it)

## 3. Ask: merge or leave (ALWAYS ask, never assume)

Ask me explicitly, presenting the summary from step 2:
**"Merge `session/<name>` into main, or leave the branch for review?"**

- **If I say merge:** switch to the main checkout (the original repo directory, not this worktree), `git pull --ff-only`, then `git merge --no-ff session/<name>`. If the merge succeeds: remove the worktree (`git worktree remove <path>`), delete the branch (`git branch -d session/<name>`), and run `git worktree prune`.
- **If I say leave:** keep the branch and the worktree untouched. Note in the handoff (step 4) that the branch exists, what's on it, and what review it's waiting for.
- **If the build/tests failed in step 2:** recommend "leave" and say why, but the decision is mine.

## 4. Write the handoff

Update `.claude/handoff.md` at the repo root **on main** (edit it in the main checkout; if the session branch was left unmerged, commit only this file to main). Prepend a new entry at the top, keeping previous entries below:

```markdown
## <YYYY-MM-DD> — session/<name>
**Status:** merged to main | left on branch (waiting for: <reason>)
**Done:** <2–4 bullets of what actually changed>
**Decisions made:** <any product/design/tech decisions taken this session, one line each>
**Next steps:** <concrete, ordered — what the next session should pick up first>
**Open questions:** <anything unresolved that needs the user's input>
```

Keep it tight — the next session reads this cold, so write for that reader.

## 5. Final check

Run `git worktree list` and `git branch --list 'session/*'` and report what remains, so I know the state I'm leaving the repo in. End with the handoff entry you wrote, verbatim.
