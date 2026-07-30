#!/usr/bin/env sh
#
# Pre-commit guard: database work must be recorded in docs/database-log.md.
#
# WHY. Round 8 found three pipeline steps that had silently not run, one of
# them for several rounds. None of them failed; they just quietly didn't
# happen, and nothing carried that knowledge to the next session. The log
# exists so that stops recurring — but a log nobody is required to write goes
# stale, and a stale log is worse than none because the next session trusts it.
#
# WHAT THIS CAN AND CANNOT SEE. Git cannot know what you ran against Supabase.
# It can only see what you are committing. So this checks the two artifacts
# that database work leaves in the repo:
#
#   1. A round directory (apps/web/rounds/<label>/) — the log must carry an
#      entry naming that round.
#   2. A migration (supabase/migrations/) — the log must be touched in the
#      same commit.
#
# Plus: the log must never be committed with the TODO placeholders that
# log-db-session.ts writes. Those two lines are the whole point — the facts are
# generated, the judgement is not.
#
# This is a backstop, not a substitute for reading the log. Bypassing it with
# --no-verify is possible and sometimes right (a revert, a docs-only fixup);
# it is not the normal path, and the next session inherits whatever you skip.

set -e

RED=''
BOLD=''
RESET=''
if [ -t 2 ]; then
  RED=$(printf '\033[31m')
  BOLD=$(printf '\033[1m')
  RESET=$(printf '\033[0m')
fi

fail() {
  printf '%s%sdatabase-log check failed%s\n\n' "$BOLD" "$RED" "$RESET" >&2
  printf '%s\n\n' "$1" >&2
  printf 'See docs/database-log.md (and CLAUDE.md § Database).\n' >&2
  exit 1
}

LOG_PATH="docs/database-log.md"
STAGED=$(git diff --cached --name-only --diff-filter=ACMR)

[ -z "$STAGED" ] && exit 0

# --- 1. Unfilled placeholders ------------------------------------------------
# Only inspect the staged content, not the working tree, so a half-written
# local edit doesn't block an unrelated commit.
#
# Anchored to the exact line shape log-db-session.ts emits, NOT a bare search
# for "TODO —". A loose match also hits prose that merely DESCRIBES the
# placeholder — which is not hypothetical: this guard blocked its own
# introducing commit, because the standing rule documenting it quotes the
# marker. A guard that fires on documentation of itself trains people to pass
# --no-verify, which costs more than the check is worth.
if printf '%s\n' "$STAGED" | grep -qx "$LOG_PATH"; then
  if git show ":$LOG_PATH" \
    | grep -qE '^\*\*(What bit us|Deliberately not done):\*\* TODO —'; then
    fail "$LOG_PATH still contains TODO placeholders from log-db-session.ts.

Fill in 'What bit us' and 'Deliberately not done'. Those two lines are the
part no query can write, and the part the next session most needs. If nothing
bit you and nothing is open, say exactly that."
  fi
fi

# --- 2. A round is being committed -------------------------------------------
# Match apps/web/rounds/<label>/… but not the directory's own README.
ROUND_LABELS=$(
  printf '%s\n' "$STAGED" \
    | sed -n 's|^apps/web/rounds/\([^/][^/]*\)/.*|\1|p' \
    | sort -u
)

for label in $ROUND_LABELS; do
  if [ ! -f "$LOG_PATH" ]; then
    fail "Round '$label' is being committed but $LOG_PATH does not exist."
  fi
  # The heading is written as "### <date> — Round <label>"; match the round
  # token so a titled heading ("Round 8 (shade & structure)") still counts.
  if ! grep -qE "^### .* — Round $label([^0-9a-zA-Z]|$)" "$LOG_PATH"; then
    fail "Round '$label' is being committed, but $LOG_PATH has no entry for it.

Run:
  cd apps/web && ./node_modules/.bin/tsx --env-file=.env.local \\
    scripts/log-db-session.ts --round $label

That writes the factual half (catalog totals, which pipeline steps actually
ran). Then fill in the two narrative lines and stage the log."
  fi
done

# --- 3. A migration is being committed ---------------------------------------
if printf '%s\n' "$STAGED" | grep -q '^supabase/migrations/'; then
  if ! printf '%s\n' "$STAGED" | grep -qx "$LOG_PATH"; then
    fail "A migration is being committed without touching $LOG_PATH.

A schema change is database work. Add a short entry saying what changed, why,
and whether it has been applied to the remote project yet — an applied
migration that nobody recorded is exactly the kind of state the next session
cannot reconstruct."
  fi
fi

# --- 4. A session entry is an event record, not an essay ---------------------
# The log grew to 21,608 words by 2026-07-30, of which the session section was
# 15,382 — because almost every entry explained its own reasoning, and several
# re-taught a lesson the trap list already owned. Compressed to 4,268 words the
# same day. A rule nobody enforces regrows, so this is the enforcement.
#
# Two mechanical signals, both cheap and neither a judgement call: length, and
# the phrases that mean "I am about to teach something here". A durable lesson
# belongs in the trap list; a design decision belongs in architecture.md or
# curation.md; an implementation story belongs in the commit message.
#
# The fenced template at the top of the Sessions section is skipped — it
# contains a specimen "### <date>" heading that is not an entry.
if printf '%s\n' "$STAGED" | grep -qx "$LOG_PATH"; then
  OVERLONG=$(
    git show ":$LOG_PATH" | awk '
      /^## Sessions/       { in_sessions = 1 }
      /^```/               { fence = !fence; next }
      fence                { next }
      !in_sessions         { next }
      /^### / {
        if (title != "" && n > MAX) printf "  %s (%d lines)\n", title, n
        title = substr($0, 5); n = 0; next
      }
      title != ""          { n++ }
      END { if (title != "" && n > MAX) printf "  %s (%d lines)\n", title, n }
    ' MAX=45
  )
  if [ -n "$OVERLONG" ]; then
    fail "Session entries over 45 lines:

$OVERLONG
Target is 10-25 lines: Changed / Database / Found / Not done / Verified, in
the past tense. If the extra length is a durable lesson, it is a trap — add it
to the trap section and cite it. If it is reasoning, it belongs in the commit
message, architecture.md or curation.md."
  fi

  PREACHING=$(
    git show ":$LOG_PATH" | awk '
      /^## Sessions/ { in_sessions = 1 }
      /^```/         { fence = !fence; next }
      fence          { next }
      in_sessions && /[Tt]he durable lesson|[Ww]orth remembering|[Tt]he lesson here|[Tt]he generalisable rule|[Tt]he takeaway/ {
        printf "  line %d: %s\n", NR, substr($0, 1, 70)
      }
    '
  )
  if [ -n "$PREACHING" ]; then
    fail "A session entry is teaching:

$PREACHING
Those phrases mean the sentence is a durable lesson, and durable lessons live
in the trap section so the next session finds them without reading history.
Add or extend a trap, then cite it from the entry."
  fi
fi

exit 0
