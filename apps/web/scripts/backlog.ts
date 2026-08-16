/**
 * "What is left, and is this list stale?" — one command. `pnpm backlog`.
 *
 * WHY THIS EXISTS. Work-remaining lived in at least four places: the Notion
 * Build Backlog, the handoff's next steps, the invariants ratchets, and "left
 * open" paragraphs scattered through the docs. With four homes and no check, the
 * question a session actually asks at minute one — is there nothing left, or did
 * nobody update this? — had no answer, so the backlog stopped being believed.
 *
 * THE SPLIT THIS COMMAND ENFORCES, decided 2026-08-16:
 *
 *   · MECHANICAL work → a ratchet in check-pipeline-invariants.ts. Only a
 *     ratchet can tell empty from forgotten, because every entry is verified
 *     against the code on every run: a hatch that stops describing a violation
 *     FAILS, and a finding that outlives its fix FAILS. An empty list means
 *     empty.
 *   · A DEFERRED SCHEMA CHANGE → standing rule 11's list in database-log.md.
 *     Rule 11 already owns this and says why: a deferral recorded only where the
 *     blocked work is described is invisible when the block lifts (trap 17).
 *   · PRODUCT decisions → the Notion Build Backlog. Code cannot compute whether
 *     the product still wants a thing.
 *   · WHAT IS IN FLIGHT RIGHT NOW → the handoff, and nothing else. It is
 *     rewritten every session, so it is the one file allowed to be a snapshot.
 *
 * WHAT THIS COMMAND CAN AND CANNOT ANSWER, stated because the honest half is
 * the point. The computed sections below cannot be stale — they are recomputed
 * from the repo every run, and both underlying checks exit non-zero rather than
 * print a number they cannot stand behind. The handoff's age is REPORTED, not
 * enforced: a handoff that has not moved in twenty commits is a fact, not
 * necessarily a defect, and failing CI over it would be a guess dressed as a
 * rule. `docs:claims` does enforce the one part that is a real invariant — a
 * handoff older than the newest database-log session was not rewritten.
 * The Notion half cannot be checked from here at all, and this prints a pointer
 * rather than pretending otherwise.
 */

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { REPO_ROOT } from './token-source'

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()

const WEB = join(REPO_ROOT, 'apps/web')
// The tsx that is already running this file. Resolving it from argv[1] rather
// than assuming node/ can execute the checks: they are TypeScript, and
// process.execPath is plain node, which cannot.
const TSX = join(WEB, 'node_modules/.bin/tsx')

/**
 * Run a check and hand back its output, whether or not it passed.
 *
 * A check that exits non-zero still prints the findings this command is here to
 * show, so its output is captured from the failure rather than thrown away.
 */
function run(script: string): { ok: boolean; out: string } {
  try {
    return {
      ok: true,
      out: execFileSync(TSX, [join(dirname(__filename), script)], {
        cwd: WEB,
        encoding: 'utf8',
      }),
    }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() }
  }
}

const HANDOFF = '.claude/handoff.md'

console.log('\n━━━ BACKLOG ━━━\n')

// --- the computed half -----------------------------------------------------

console.log('MECHANICAL — ratchets, recomputed every run, cannot go stale.\n')
const invariants = run('check-pipeline-invariants.ts')
console.log(
  invariants.out
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => `  ${l}`)
    .join('\n')
)
if (!invariants.ok) {
  console.log(
    '\n  ↑ invariants:check is FAILING, so these counts are not the whole story.'
  )
}

console.log('\nDOC CLAIMS — derivable numbers the docs restate.\n')
const claims = run('check-doc-claims.ts')
console.log(
  claims.out
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => `  ${l}`)
    .join('\n')
)

// --- the reported half -----------------------------------------------------

console.log(
  '\nIN FLIGHT — the handoff, and how far the repo has moved past it.\n'
)
const lastTouched = git('log', '-1', '--format=%H %cs', '--', HANDOFF)
const [sha, date] = lastTouched.split(' ')
const since = sha ? git('rev-list', '--count', `${sha}..HEAD`) : '?'
console.log(`  ${HANDOFF} last rewritten ${date} (${sha?.slice(0, 7)})`)
console.log(`  commits on this branch since:  ${since}`)
console.log(
  since === '0'
    ? '  → current as of HEAD.'
    : `  → ${since} commit(s) of work it has never described. Reported, not enforced:\n` +
        '    read it before trusting its next steps. The one hard rule is in\n' +
        '    docs:claims — a handoff older than the newest database-log session fails.'
)

// --- the half no command can reach -----------------------------------------

console.log('\nNOT COMPUTABLE FROM HERE:\n')
console.log(
  '  Product decisions      → Notion Build Backlog (the single source of truth)'
)
console.log(
  '  Deferred schema change → docs/database-log.md, standing rule 11 list'
)
console.log(
  '\n  Neither can be verified by this command. If a mechanical item is only'
)
console.log(
  '  written down in one of them, it is in the wrong place — a ratchet entry'
)
console.log('  is the only home that fails when it stops being true.\n')

// A failing check must not be swallowed by an aggregator: the whole point is
// that a number nobody can stand behind is worse than no number.
if (!invariants.ok || !claims.ok) process.exit(1)
