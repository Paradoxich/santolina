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
  **Then `git push origin main`, and watch the run it triggers.** Merging is not
  shipping. A merge that stays on the laptop leaves the work in exactly one
  place, which is the state this whole skill exists to get out of — and the
  handoff written in step 5 will describe a main that nobody else can see. It is
  also the only way the `(main only)` CI jobs ever run: they are skipped on every
  pull request by design, so until the push they have never executed against
  what you merged. Push, then `gh run list --branch main --limit 1` until it
  completes, and report the result. A red run is this session's problem, not the
  next one's.
  **Merge, push and CI are one step, not three.** They were separated once, and
  session-end reported a finished session over six unpushed commits and a CI job
  that had never run.
- **If I say leave:** keep the branch and the worktree untouched. Note in the handoff (step 5) that the branch exists, what's on it, and what review it's waiting for.
- **If the build/tests failed in step 2:** recommend "leave" and say why, but the decision is mine.

## 5. Write the handoff

Update `.claude/handoff.md` at the repo root **on main** (edit it in the main checkout; if the session branch was left unmerged, commit only this file to main).

**REPLACE the previous session's entry — do not prepend to it.** The file holds
the current session only, and its own header states the format; follow that
rather than a copy of it kept here. This used to say "prepend, keeping previous
entries below", which is how it reached **785 lines in two days** while
instructing readers to read only the top entry. Roughly 89% of it was text nobody
was told to read, and it got read anyway by grep, stripped of the date that made
it safe — the mechanism behind a false CI-secrets claim reaching Ana four times.

So before writing, ask what actually belongs here. Two things do:

1. **In-flight state** — what is uncommitted, undecided, or half-done. The gap
   between intent and artifact, which no command and no doc can report.
2. **Next steps, with the reasoning for their order.**

Everything else has a better home, and putting it here is what makes the file
grow: durable pipeline/data reasoning → `docs/database-log.md`; product and
structural decisions → `docs/architecture.md`; tokens and visual rules →
`DESIGN_SYSTEM.md`; what changed and when → `git log`. **A decision one file owns
belongs in that file's comments, not in a doc** — if you find yourself
paraphrasing a code comment, stop and link to it.

**Work remaining is routed by kind, and most of it is not a handoff line.**
Writing a mechanical item here instead of into a ratchet is how the backlog
became unreadable: a doc cannot tell "nothing left" from "nobody updated it".

- **Mechanical** (a defect, an unwired script, an unpinned trap) → a ratchet in
  `apps/web/scripts/check-pipeline-invariants.ts`. If no shape covers it, add an
  `OPEN_FINDINGS` entry with a witness regex that matches while the defect is
  present. It then fails the day someone fixes it, which is what stops the list
  from outliving its truth.
- **A deferred schema change** → standing rule 11's list in `docs/database-log.md`.
- **A product decision** → the Notion **Build Backlog**.
- **Only what is genuinely in flight right now** stays here.

Then run `cd apps/web && pnpm backlog` and check the handoff you just wrote
against it. A next step that is already an entry in a ratchet does not need
restating; a next step that is mechanical and appears in neither is in the wrong
place.

Fold any still-open next step from the entry you are replacing into your own, so
nothing is dropped. If the previous entry holds durable reasoning that never made
it into the docs above, move it there rather than carrying it forward.

## 6. Final check

Run `git worktree list` and `git branch --list 'session/*'` and report what remains, so I know the state I'm leaving the repo in.

Then state, in one line each, **whether anything is left for me to handle**:

- Whether `main` is pushed (`git status -sb` shows no `ahead`) and whether the run it triggered went green. Never report a session finished while either is outstanding — say which, and fix it rather than handing it over.
- Open PRs this session created (`gh pr list --state open`) — and if there are none, say so.
- Any file from step 3 that was moved into the main checkout rather than committed, by path. If nothing was, say "no loose artifacts".
- Anything I have to decide before the next session can start.

If all four are empty, say that plainly. **I should never have to open a folder
to find out what a session left behind** — if the answer needs me to go looking,
this step has not been done.

End with the handoff entry you wrote, verbatim.
