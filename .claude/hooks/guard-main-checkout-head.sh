#!/usr/bin/env bash
#
# Block HEAD-moving git commands (checkout, switch, reset, rebase) in the MAIN
# checkout while session worktrees exist.
#
# WHY THIS EXISTS. Sessions are isolated in worktrees precisely so the shared
# checkout stays on main and untouched; another live session may be reading it,
# and preview_start silently serves it. Moving its HEAD yanks the ground out
# from under both. The standing rule (never change HEAD in the shared checkout
# while another session may be active) has so far lived only in memory and the
# session-start skill — this makes it mechanical.
#
# WHAT IT IS NOT. It does not fire when no session worktrees exist (nothing to
# protect), and it never fires inside a worktree (that HEAD is the session's
# own). To proceed anyway, append  # main-head-approved  to the command — the
# marker stays in the transcript, so a bypass is a recorded decision.
#
# Exit 0 with no output = allow. Anything reported goes out as a deny decision.

set -uo pipefail

payload=$(cat)
command=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Not a command we guard: say nothing, cost nothing.
case "$command" in
*'git checkout'* | *'git switch'* | *'git reset'* | *'git rebase'*) ;;
*) exit 0 ;;
esac

case "$command" in
*'# main-head-approved'*) exit 0 ;;
esac

# Where will this run? Honor `git -C <path>` first, then a leading `cd <path>`,
# then the session cwd. This is what makes `cd worktree && git checkout` pass
# and a bare `git checkout` in the shared checkout fail.
dir=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)
c_flag=$(printf '%s' "$command" | sed -n 's/.*git -C \([^ ]*\).*/\1/p' | head -1)
cd_prefix=$(printf '%s' "$command" | sed -n 's/^cd \([^ ;&]*\).*/\1/p' | head -1)
[ -n "$cd_prefix" ] && dir="$cd_prefix"
[ -n "$c_flag" ] && dir="$c_flag"
[ -d "$dir" ] || exit 0

# A worktree's git-dir lives under .git/worktrees/; the main checkout's does
# not. Inside a worktree this HEAD belongs to the session — allow.
git_dir=$(git -C "$dir" rev-parse --git-dir 2>/dev/null) || exit 0
case "$git_dir" in
*'/worktrees/'*) exit 0 ;;
esac

# Main checkout. Only guard it while there is something to protect.
worktree_count=$(git -C "$dir" worktree list --porcelain 2>/dev/null | grep -c '^worktree ')
[ "$worktree_count" -le 1 ] && exit 0

others=$(git -C "$dir" worktree list 2>/dev/null | tail -n +2)

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

deny "$(printf '%s\n\n%s\n\n%s\n' \
  "Blocked: this would move HEAD in the shared main checkout while session worktrees exist. Another session may be reading this checkout, and a dev server may be serving it." \
  "Active worktrees:
$others" \
  'Do the work inside the session worktree instead (cd there, or git -C <worktree>). If moving HEAD here is genuinely intended — e.g. session-end is merging — append the marker  # main-head-approved  to the command and re-run, so the decision is on the record.')"
