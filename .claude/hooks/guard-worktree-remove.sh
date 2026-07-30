#!/usr/bin/env bash
#
# Block `git worktree remove` while the target worktree still holds gitignored
# files that are not cheaply reproducible.
#
# WHY THIS EXISTS. `git worktree remove` deletes ignored files with no warning
# and no recovery, and `git status` never showed them, so a worktree can look
# empty and be holding the only copy of something. It has happened twice here: a
# catalog backup died with its worktree on 2026-07-28 (trap 15), and a 14MB WCVP
# lookup cache — roughly 500 rate-limited GBIF calls — survived 2026-07-30 only
# because someone happened to look inside the folder first.
#
# session-end tells a session to check. This makes it impossible to forget, which
# is a different thing.
#
# WHAT IT IS NOT. It does not judge whether a file matters — that needs a human
# or at least a look. It forces the look, then gets out of the way: append
# `# artifacts-checked` to the command to proceed. That marker stays in the
# transcript, so a bypass is a recorded decision rather than a silent one.
#
# Exit 0 with no output = allow. Anything reported goes out as a deny decision.

set -uo pipefail

payload=$(cat)
command=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Not the command we guard: say nothing, cost nothing.
case "$command" in
*'git worktree remove'*) ;;
*) exit 0 ;;
esac

# An explicit acknowledgement is the escape hatch, and it is deliberately part of
# the command rather than an env var so it is visible in the transcript.
case "$command" in
*'# artifacts-checked'*) exit 0 ;;
esac

deny() {
  jq -nc --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# Pull the target path: the first argument after `remove` that is not a flag.
target=$(printf '%s' "$command" \
  | sed -n 's/.*git worktree remove//p' \
  | tr ' ' '\n' \
  | grep -v '^--' \
  | grep -v '^$' \
  | head -1)

[ -z "$target" ] && exit 0
[ -d "$target" ] || exit 0

# Ignored paths, minus the ones that are always cheap to rebuild. This list is
# deliberately short: anything not on it gets reported. A false alarm costs one
# glance, a miss costs the file.
listing=$(git -C "$target" ls-files --others --ignored --exclude-standard --directory 2>/dev/null \
  | grep -vE 'node_modules|\.husky/|\.DS_Store|^\.next/|\.next/$|settings\.local|launch\.json|\.env|\.turbo|/dist/|/dist$|storybook-static|coverage|tsbuildinfo|supabase/\.temp|\.claude/worktrees')

[ -z "$listing" ] && exit 0

report=$(cd "$target" && printf '%s\n' "$listing" | while IFS= read -r f; do
  [ -e "$f" ] && du -sk "$f" 2>/dev/null
done | sort -rn | head -10 | awk '{printf "  %6.1f MB  %s\n", $1/1024, $2}')

[ -z "$report" ] && exit 0

# Built with printf rather than a heredoc: a heredoc inside $( ) does not reliably
# protect apostrophes and backticks from the shell parser, and the first two
# attempts at this message died on "round's" and on a backticked marker name.
# Kept free of both characters for the same reason.
guidance=$(printf '%s\n' \
  'Decide about each one before removing the worktree (session-end step 3):' \
  '  - Reproducible output (script reports, build caches): fine to lose, say so.' \
  '  - Expensive or irreplaceable (backups, API and lookup caches, downloaded' \
  '    reference data): give it a durable home FIRST. Commit it under' \
  '    apps/web/reference/ if later rounds read it, or rounds/<n>/ if it is that' \
  '    round provenance, or copy it into the main checkout and name it in the' \
  '    handoff.' \
  '  - Unclear: ask, and leave the worktree alone meanwhile.' \
  '' \
  '--force does not help; it deletes the same files without the complaint.' \
  'When you have actually looked, append the marker  # artifacts-checked  to the' \
  'command and re-run, so the decision is on the record.')

deny "$(printf '%s\n\n%s\n\n%s\n' \
  "Blocked: $target holds gitignored files that this removal would delete permanently. git status does not show these, and there is no recovery." \
  "$report" \
  "$guidance")"
