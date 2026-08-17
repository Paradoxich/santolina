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
 * IT DERIVES THE LIST, IT DOES NOT RESTATE IT. Every job in
 * `.github/workflows/ci.yml` is read, in file order, and every command in it is
 * run. A hand-kept copy of the job list in `package.json` would be trap 32
 * again one level up: a second home for the fact "this is what CI runs",
 * drifting the first time somebody edits the workflow. Standing rule 14 —
 * generate the copy or delete it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT RUNS THE DATABASE JOBS TOO, WHICH IS THE POINT (Ana, 2026-08-17)
 *
 * `catalog-state` and `migration drift` read the live catalog, so CI runs them
 * only on the push to main — a PR-triggered job that can read
 * `SUPABASE_SERVICE_ROLE_KEY` widens the blast radius of any workflow edit, and
 * that decision stands. The consequence was that `docs/catalog-state.md` and
 * `lib/style-availability.generated.ts` were checked NOWHERE before a merge.
 *
 * That is not a theoretical gap. `style-availability.generated.ts` is derived
 * from live catalog counts, so editing `STYLE_TAGS` invalidates it — which is
 * exactly what PR #171 did two days before this was written.
 *
 * Locally there is no blast radius to widen: `.env.local` is already on the
 * machine, which is how those two commands get run by hand today. So this runs
 * them, and **this is now the only place they run before a merge.** Pass
 * `--no-db` to skip them, which is honest about what it is skipping rather than
 * quietly running a shorter list.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SHELL PLUMBING IN THOSE TWO JOBS IS DELIBERATELY IGNORED. Their `run:`
 * blocks check that the secret is present and `printf` it into
 * `apps/web/.env.local`. That exists to materialise on a runner the file this
 * machine already has. What is extracted from a block is the `pnpm` line, and a
 * block yielding none throws rather than being skipped — a step nobody runs is
 * the whole thing this file exists to prevent.
 *
 * Usage (from apps/web):
 *   pnpm ci:check
 *
 * Flags:
 *   --list      Print the derived command list and exit. Runs nothing.
 *   --no-db     Skip the jobs that read the live database.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '../../..')
const WORKFLOW = join(REPO_ROOT, '.github/workflows/ci.yml')
const ENV_LOCAL = join(REPO_ROOT, 'apps/web/.env.local')

/**
 * Steps that are the runner setting itself up rather than a check. Skipped with
 * a printed note, never silently: a reader has to be able to see that the local
 * list is shorter than CI's and why.
 */
const SETUP_PREFIXES = ['pnpm install']

export interface CiJob {
  /** The job key, e.g. `catalog-state`. */
  key: string
  /** The job's `name:`, which is what a reader sees in the checks list. */
  name: string
  /**
   * True when the job's name says `(main only)`.
   *
   * DERIVED FROM THE NAME ON PURPOSE, and the workflow makes that legitimate:
   * its own comment says "THE NAME CARRIES '(main only)' ON PURPOSE — do not
   * shorten it", because four sessions read a bare SKIPPED and invented a
   * reason. The alternative is parsing the `if:` expression, which would be a
   * second, weaker home for a fact the name already states.
   */
  mainOnly: boolean
  commands: string[]
}

/**
 * Every job in the workflow, in file order, with its commands.
 *
 * A regex rather than a YAML parser because the repo has no YAML dependency and
 * this reads two shapes. It refuses anything it does not understand instead of
 * skipping it — the dropped step would be the one nobody runs.
 */
export function jobsOf(yaml: string): CiJob[] {
  const lines = yaml.split('\n')
  const jobsAt = lines.findIndex((l) => l === 'jobs:')
  if (jobsAt === -1) throw new Error(`${WORKFLOW} has no \`jobs:\` block.`)

  const jobs: CiJob[] = []
  let current: CiJob | null = null
  let blockIndent: number | null = null
  let blockGotCommand = false

  const endBlock = () => {
    if (blockIndent !== null && !blockGotCommand)
      throw new Error(
        `${WORKFLOW}'s "${current?.key}" job has a multi-line \`run:\` block with no ` +
          `\`pnpm\` line in it, so this script cannot tell what it runs. Teach it ` +
          `the shape rather than letting the step be skipped.`
      )
    blockIndent = null
  }

  for (const line of lines.slice(jobsAt + 1)) {
    const jobHeader = /^ {2}([a-z][\w-]*):\s*$/.exec(line)
    if (jobHeader) {
      endBlock()
      current = {
        key: jobHeader[1]!,
        name: jobHeader[1]!,
        mainOnly: false,
        commands: [],
      }
      jobs.push(current)
      continue
    }
    if (!current) continue

    // Inside a `run: |` block: indented further than the `run:` that opened it.
    if (blockIndent !== null) {
      const indent = line.search(/\S/)
      if (line.trim() !== '' && indent <= blockIndent) {
        endBlock()
      } else {
        const cmd = /^\s*(pnpm .+?)\s*$/.exec(line)
        if (cmd) {
          current.commands.push(cmd[1]!)
          blockGotCommand = true
        }
        continue
      }
    }

    const name = /^ {4}name: (.+)$/.exec(line)
    if (name) {
      current.name = name[1]!.trim()
      current.mainOnly = /\(main only\)/.test(current.name)
      continue
    }

    const blockOpen = /^( +)run: *[|>]/.exec(line)
    if (blockOpen) {
      blockIndent = blockOpen[1]!.length
      blockGotCommand = false
      continue
    }

    const inline = /^ {6}- run: (.+)$/.exec(line)
    if (inline) current.commands.push(inline[1]!.trim())
  }
  endBlock()

  const empty = jobs.filter((j) => j.commands.length === 0)
  if (empty.length)
    throw new Error(
      `${WORKFLOW}: job(s) ${empty.map((j) => j.key).join(', ')} parsed to zero ` +
        `commands. That is a parse failure, not an empty job.`
    )
  return jobs
}

function main() {
  const args = process.argv.slice(2)
  const listOnly = args.includes('--list')
  const noDb = args.includes('--no-db')

  const jobs = jobsOf(readFileSync(WORKFLOW, 'utf8'))

  if (!noDb && jobs.some((j) => j.mainOnly) && !existsSync(ENV_LOCAL))
    throw new Error(
      `${ENV_LOCAL} does not exist, so the database jobs cannot run. Copy it ` +
        `from another checkout, or pass --no-db and know that ` +
        `docs/catalog-state.md and lib/style-availability.generated.ts are then ` +
        `checked nowhere before your merge.`
    )

  const plan: Array<{ job: CiJob; command: string }> = []
  const skipped: string[] = []

  for (const job of jobs) {
    if (noDb && job.mainOnly) {
      skipped.push(`${job.name} — --no-db`)
      continue
    }
    for (const command of job.commands) {
      if (SETUP_PREFIXES.some((p) => command.startsWith(p))) {
        skipped.push(
          `${command} — runner setup, this tree is already installed`
        )
        continue
      }
      plan.push({ job, command })
    }
  }

  console.log(
    `\n${plan.length} command(s) across ${new Set(plan.map((p) => p.job.key)).size} ` +
      `job(s), read from .github/workflows/ci.yml:`
  )
  let shown = ''
  for (const { job, command } of plan) {
    if (job.key !== shown) {
      console.log(`  ${job.name}${job.mainOnly ? '   ← NOT run on a PR' : ''}`)
      shown = job.key
    }
    console.log(`    ${command}`)
  }
  for (const s of skipped) console.log(`  (skipped: ${s})`)

  const mainOnlyRunning = plan.filter((p) => p.job.mainOnly)
  if (mainOnlyRunning.length)
    console.log(
      `\nThe "(main only)" job(s) above are skipped on every pull request by\n` +
        `design, so this run is the ONLY place they happen before your merge.\n`
    )

  if (listOnly) return

  for (const { command } of plan) {
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
    `\n✓ every command in .github/workflows/ci.yml passed locally` +
      (noDb ? `, EXCEPT the database jobs you skipped with --no-db.` : '.') +
      `\n`
  )
}

// Only when invoked, so `jobsOf` can be imported and asserted. The seam is the
// point: a trap you cannot call is a trap you cannot pin.
if (require.main === module) main()
