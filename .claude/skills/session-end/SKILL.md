---
name: session-end
description: End the work session — commit remaining work, ask merge-or-leave, clean up, write the handoff. Use when the user invokes /session-end or asks to wrap up the session.
---

You are ending this work session. Follow these steps in order. Never skip step 4's question, never delete a branch that has not been merged, and never remove a worktree before step 3 has accounted for what is inside it.

## 1. Sweep for uncommitted work

In this session's worktree, run `git status` and `git diff --stat`.

- If there is uncommitted work, group it into logical commits with clear messages and commit it on the session branch. Do not leave anything uncommitted or stashed.
- If there are untracked files that look like scratch/debug output, list them and ask me whether to commit, delete, or ignore them.

## 2. Summarize the session's work

Show me a compact summary:

- `git log main..HEAD --oneline` (all commits this session made)
- One or two sentences per commit on what it does
- Whether the app builds / tests pass (run the project's build or test command if one exists; report the result honestly — do not merge broken work without flagging it)

## 3. Rescue local-only files BEFORE any worktree is removed

`git status` in step 1 does not see ignored files, so a clean worktree can still
hold the only copy of something. **`git worktree remove` deletes them with no
warning and no recovery.** This has already happened twice: a catalog backup died
with its worktree on 2026-07-28 (trap 15), and on 2026-07-30 a 14MB WCVP lookup
cache — ~500 rate-limited GBIF calls — survived only because someone happened to
look inside the folder first.

In the session worktree, list what git cannot see:

```bash
git ls-files --others --ignored --exclude-standard --directory \
  | grep -vE 'node_modules|\.husky/|\.DS_Store|\.next/|settings\.local|launch\.json|\.env' \
  | while read -r f; do [ -e "$f" ] && du -sk "$f"; done 2>/dev/null \
  | sort -rn | head -10 | awk '{printf "%6.1f MB  %s\n", $1/1024, $2}'
```

Sorted by size on purpose: the question is what a thing costs to replace, and the
expensive things are usually the big ones. Build caches (`.turbo/`, `dist/`,
`storybook-static/`) will show up near the top and are always safe — the filter
above only drops noise that is _never_ worth a decision (`node_modules`, husky
hooks, `.env.local`, editor droppings).

Then sort every hit into one of three buckets, and **say which bucket each one is
in** rather than deleting silently:

- **Reproducible output — safe to lose.** Anything a script rewrites on its next
  run: `reports/*.json`, `reports/*.md`, `.next/`, coverage. Say so and move on.
- **Expensive or irreplaceable — must not die here.** Backups (`apps/web/backups`,
  including `storage/`, which may be the only copy of the private diary-photos
  bucket outside Supabase), API/lookup caches, hand-downloaded reference data the
  repo does not carry (e.g. `reports/level3.geojson`), and any file whose
  regeneration means a long rate-limited fetch loop. **Give it a durable home
  first** — commit it under `apps/web/reference/` if it is an input later rounds
  read, or `rounds/<n>/` if it is that round's provenance — or copy it into the
  main checkout and name it in the handoff. Only then remove the worktree.
- **Genuinely unclear.** Ask me. Do not guess, and do not remove the worktree
  while waiting.

**The test is not "is it ignored", it is "what does it cost to get back".** A
gitignored file is disposable by convention, not by fact.

Never pass `--force` to `git worktree remove` to get past a complaint about
untracked or modified files — that is the flag that destroyed the 2026-07-28
backup. Investigate what it is complaining about instead.

## 4. Ask: merge or leave (ALWAYS ask, never assume)

Ask me explicitly, presenting the summary from step 2:
**"Merge `session/<name>` into main, or leave the branch for review?"**

- **If I say merge:** switch to the main checkout (the original repo directory, not this worktree), `git pull --ff-only`, then `git merge --no-ff session/<name>`. If the merge succeeds: remove the worktree (`git worktree remove <path>`), delete the branch (`git branch -d session/<name>`), and run `git worktree prune`.
- **If I say leave:** keep the branch and the worktree untouched. Note in the handoff (step 5) that the branch exists, what's on it, and what review it's waiting for.
- **If the build/tests failed in step 2:** recommend "leave" and say why, but the decision is mine.

## 5. Write the handoff

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

## 6. Final check

Run `git worktree list` and `git branch --list 'session/*'` and report what remains, so I know the state I'm leaving the repo in.

Then state, in one line each, **whether anything is left for me to handle**:

- Open PRs this session created (`gh pr list --state open`) — and if there are none, say so.
- Any file from step 3 that was moved into the main checkout rather than committed, by path. If nothing was, say "no loose artifacts".
- Anything I have to decide before the next session can start.

If all three are empty, say that plainly. **I should never have to open a folder
to find out what a session left behind** — if the answer needs me to go looking,
this step has not been done.

End with the handoff entry you wrote, verbatim.
