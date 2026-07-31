#!/usr/bin/env bash
#
# Block `next build` (directly or via pnpm/turbo) while a dev server is running.
#
# WHY THIS EXISTS. `next build` and a running `next dev` share the same `.next`
# directory, and the build corrupts the dev server's assets: pages go unstyled
# with nothing in the terminal to say why, and the "fix" people reach for is
# debugging their own CSS. Already documented as a trap; this makes it a wall
# instead of a memory.
#
# THE FIX IS THE SEQUENCE, not a flag: stop the dev server, build, restart the
# server, and re-share the (possibly new) port. If the detected process is a
# false positive — some other project's dev server that shares no .next —
# append  # dev-checked  to the command to proceed on the record.
#
# Exit 0 with no output = allow. Anything reported goes out as a deny decision.

set -uo pipefail

payload=$(cat)
command=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only guard commands that build the Next.js app. `turbo build` and workspace
# `pnpm build` both reach next build; storybook and package builds ride along
# and that is fine — the check below only fires if a dev server is actually up.
case "$command" in
*'next build'*) ;;
*pnpm*build*) ;;
*turbo*build*) ;;
*) exit 0 ;;
esac

case "$command" in
*'# dev-checked'*) exit 0 ;;
esac

# A running dev server shows "next dev" (direct or under turbo) in its
# ancestry, or something is listening on the dev port.
dev_procs=$(pgrep -fl 'next dev|next-server' 2>/dev/null | head -5)
port_holder=$(lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null | tail -n +2 | awk '{print $1, $2}' | head -3)

[ -z "$dev_procs" ] && [ -z "$port_holder" ] && exit 0

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

deny "$(printf '%s\n\n%s\n%s\n\n%s\n' \
  'Blocked: a dev server appears to be running, and next build shares .next with next dev — building now corrupts the dev assets (unstyled pages, no error anywhere).' \
  "Found:
$dev_procs" \
  "$port_holder" \
  'Stop the dev server first, build, then restart it and re-share the port. If what was found is unrelated to this app, append the marker  # dev-checked  to the command and re-run.')"
