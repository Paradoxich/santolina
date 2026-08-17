/**
 * Run what CI runs, read out of CI's own definition.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none. It is the pre-push check, not a round
 * step. WHAT ENDS IT: nothing — it ends when CI does.
 *
 * WHY IT EXISTS — TRAP 32. A generated file held current by its own
 * `regenerate && git diff --exit-code` step is guarded by that step and by
 * nothing else. On 2026-08-17 the UI error-system merge added a token consumer
 * without regenerating `token-consumers.generated.ts`; local verification ran
 * tests, typecheck, `invariants:check`, `docs:claims` and `docs:links` — five
 * green commands, none of which reads that file — and main went red on
 * `tokens:check`. The gap was not that a check was missing. It was that
 * "I verified it" and "CI will pass" were different claims and nobody could
 * tell.
 *
 * IT DERIVES THE LIST, IT DOES NOT RESTATE IT. The steps are parsed out of
 * `.github/workflows/ci.yml`. A hand-kept copy of the job list in
 * `package.json` would be trap 32 again one level up: a second home for the
 * fact "this is what CI runs", drifting the first time somebody edits the
 * workflow. Standing rule 14 — generate the copy or delete it.
 *
 * WHAT IT CANNOT COVER, printed on every run rather than left to be assumed.
 * The `catalog-state` and `migration drift` jobs read the live database and are
 * skipped on pull requests by design, so this does not run them and neither
 * does a PR. `docs/catalog-state.md` and `lib/style-availability.generated.ts`
 * ride with them, which means two of trap 32's four files stay covered only by
 * the push to main after merge. That is the same window, narrowed from five
 * commands to two jobs, and the run says so out loud.
 *
 * Usage (from apps/web):
 *   pnpm ci:check
 *
 * Flags:
 *   --list      Print the derived command list and exit. Does not run anything.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '../../..')
const WORKFLOW = join(REPO_ROOT, '.github/workflows/ci.yml')

/** The job whose steps are the pull-request gate. */
const JOB = 'check'

/**
 * Steps that are the runner setting itself up rather than a check. Skipped with
 * a printed note, never silently: a reader has to be able to see that the local
 * list is shorter than CI's and why.
 */
const SETUP_PREFIXES = ['pnpm install']

/**
 * The `run:` commands of one job, in order.
 *
 * A regex rather than a YAML parser because the repo has no YAML dependency and
 * this reads exactly one shape. It refuses anything it does not understand
 * instead of skipping it — a parser that silently drops a step it cannot read
 * would reintroduce the whole trap, since the dropped step is the one nobody
 * runs.
 */
export function stepsOf(yaml: string, job: string): string[] {
  const lines = yaml.split('\n')
  const start = lines.findIndex((l) => l === `  ${job}:`)
  if (start === -1)
    throw new Error(
      `${WORKFLOW} has no job "${job}". If the pull-request job was renamed, ` +
        `rename JOB in this script — this check is worthless pointed at nothing.`
    )

  const steps: string[] = []
  for (const line of lines.slice(start + 1)) {
    // Next job at the same indent ends this one.
    if (/^ {2}\S/.test(line)) break
    // BEFORE the general match, not after: `- run: |` satisfies `(.+)` and was
    // captured as a one-character command called "|". A block scalar has to be
    // ruled out first or it is silently mis-read, which is the trap this file
    // is named for.
    if (/^ {6}- run: *[|>]/.test(line) || /^ {6}- run: *$/.test(line))
      throw new Error(
        `${WORKFLOW}'s "${job}" job has a multi-line \`run:\` block, which this ` +
          `script cannot read. Teach it the shape rather than letting the step ` +
          `be skipped — a step nobody runs is what this exists to prevent.`
      )

    const match = /^ {6}- run: (.+)$/.exec(line)
    if (!match) continue
    steps.push(match[1]!.trim())
  }

  if (steps.length === 0)
    throw new Error(`${WORKFLOW}'s "${job}" job parsed to zero commands.`)
  return steps
}

function main() {
  const listOnly = process.argv.slice(2).includes('--list')
  const all = stepsOf(readFileSync(WORKFLOW, 'utf8'), JOB)

  const skipped = all.filter((c) => SETUP_PREFIXES.some((p) => c.startsWith(p)))
  const commands = all.filter((c) => !skipped.includes(c))

  console.log(
    `\n${commands.length} command(s), read from .github/workflows/ci.yml job "${JOB}":`
  )
  for (const c of commands) console.log(`  ${c}`)
  for (const c of skipped)
    console.log(
      `  (skipped, runner setup — this tree is already installed: ${c})`
    )

  console.log(
    `\nNOT COVERED, and not covered by a pull request either:\n` +
      `  catalog-state staleness   → docs/catalog-state.md, lib/style-availability.generated.ts\n` +
      `  migration drift           → supabase/migrations vs the remote ledger\n` +
      `Both read the live database and run only on the push to main. Two of\n` +
      `trap 32's four generated files are in that gap.\n`
  )

  if (listOnly) return

  for (const command of commands) {
    console.log(`\n─── ${command}`)
    try {
      execSync(command, { cwd: REPO_ROOT, stdio: 'inherit' })
    } catch {
      console.error(
        `\n✗ ${command} failed. This is what CI would have said.\n` +
          `  Everything after it was NOT run, so fix this and re-run rather\n` +
          `  than assuming the rest is green.\n`
      )
      process.exit(1)
    }
  }

  console.log(
    `\n✓ every command in CI's "${JOB}" job passed locally.\n` +
      `  The two main-only jobs above are still unverified.\n`
  )
}

// Only when invoked, so `stepsOf` can be imported and asserted. The seam is the
// point: a trap you cannot call is a trap you cannot pin.
if (require.main === module) main()
