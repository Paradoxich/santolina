#!/usr/bin/env bash
#
# Stop a catalog script from running with `--all` until a smoke test is on the
# record.
#
# WHY THIS EXISTS. "Never apply --all blind" is a paid-for rule: a table-wide
# pilot under-predicted a scoped job's error rate by 5x, and a tail-of-run
# billing failure has turned a confident full pass into half-written state.
# The standing rules say smoke-test first (--limit 3, --dry-run where offered)
# after ANY schema or request-shape change — a green typecheck does not verify
# a runtime API contract. This hook cannot check that you ran the smoke test;
# it can make skipping it a decision instead of a default.
#
# After the smoke test has actually run and been looked at, append the marker
#   # smoke-tested
# to the command and re-run. The marker stays in the transcript.
#
# Exit 0 with no output = allow. Anything reported goes out as a deny decision.

set -uo pipefail

payload=$(cat)
command=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only tsx invocations of repo scripts with a bare --all concern us.
case "$command" in
*tsx*scripts/*'--all'*) ;;
*) exit 0 ;;
esac

# A --limit or --dry-run in the same command IS the smoke test — allow.
case "$command" in
*'--dry-run'* | *'--limit'*) exit 0 ;;
*'# smoke-tested'*) exit 0 ;;
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

deny "$(printf '%s\n\n%s\n' \
  'Blocked: this runs a catalog script with --all and nothing on the record says it was smoke-tested. The standing rule: after any schema or request-shape change, run --limit 3 (and --dry-run where the script offers it) and look at the output first — a full pass that fails at the tail leaves half-written state and real API spend.' \
  'Run the small probe first. When it has actually run and been looked at, append the marker  # smoke-tested  to this command and re-run, so the decision is on the record.')"
