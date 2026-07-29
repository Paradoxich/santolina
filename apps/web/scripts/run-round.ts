/**
 * Run a whole round end to end.
 *
 * THE PROBLEM THIS SOLVES IS NOT COMPUTE. Round 8 took three days, and almost
 * none of that was the model working: eleven batched calls per plant is hours.
 * It was a person standing at each of thirteen gates — run a step, read the
 * output, notice something, fix it, run the next. `round-progress` already
 * says what comes next; nothing actually ran it.
 *
 * So this is the runbook as code. The ordered list below IS §25, and having it
 * in one executable place means the order cannot drift from the prose the way
 * the seasonal-care step did (missing from the runbook entirely, so every
 * plant seeded after Care Tips v2 shipped had no care tip).
 *
 * WHAT IT WILL NOT DO
 *
 * It does not seed. Seeding is where a round's judgment lives — which species,
 * chosen against which measured gap — and it is a different script every time.
 * Run the seed first; this picks up from a round that exists.
 *
 * It does not decide anything a person should. A step that FAILS stops the
 * run, with the command to re-run printed. It does not retry, skip ahead, or
 * "fix" its way past a failure, because every one of those turns a stopped
 * pipeline into a pipeline that finished while lying about it.
 *
 * IT IS RESUMABLE, AND THAT IS THE POINT OF READING STATE FIRST. Every step is
 * detected by the DB state it leaves behind (`round-status.ts`), so a run that
 * dies at step 6 and is started again skips the five that are done rather than
 * re-billing them. That also means an interrupted run costs nothing to restart,
 * which is what makes it safe to just run the whole thing.
 *
 * Usage (from apps/web):
 *   # See the plan and what is already done, spend nothing:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/run-round.ts --round 9 --dry-run
 *   # Run it:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/run-round.ts --round 9
 *   # Only report what remains:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/run-round.ts --round 9 --plan
 */

import { spawnSync } from 'node:child_process'
import { flagValue } from './scope'
import { roundStatus } from './round-status'
import { readRoundManifest } from './round-manifest'

import { RUNBOOK, type Step } from './runbook'

const TSX = './node_modules/.bin/tsx'

function run(step: Step, label: string): boolean {
  const args = [
    '--env-file=.env.local',
    `scripts/${step.script}`,
    '--round',
    label,
    ...(step.args ?? []),
  ]
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`▶ ${step.runbook}. ${step.step}`)
  console.log(`  ${TSX} ${args.join(' ')}`)
  console.log('─'.repeat(72))

  // stdio inherit: a batched vision pass can run for an hour, and watching it
  // is the only way to know it is alive. Buffering it to print at the end
  // would make the long steps look hung.
  const result = spawnSync(TSX, args, { stdio: 'inherit' })
  return result.status === 0
}

async function main() {
  const label = flagValue('--round')
  if (!label) {
    console.error(
      '\nrun-round needs --round <label>.\n\n' +
        'It runs the whole §25 pipeline for one round. Seed the round first — ' +
        'seeding is where the judgment about which species to add lives, and ' +
        'it is a different script every time.\n'
    )
    process.exit(1)
  }

  const manifest = readRoundManifest(label)
  if (!manifest) {
    console.error(
      `\nNo manifest for round "${label}" — expected rounds/${label}/manifest.json.\n` +
        'Seed the round first; the manifest is what records which plants it added.\n'
    )
    process.exit(1)
  }

  const planOnly = process.argv.includes('--plan')
  const dryRun = process.argv.includes('--dry-run') || planOnly

  console.log(
    `\nRound ${label} — ${manifest.seeded_ids.length} seeded plant(s).\n`
  )

  // Read state ONCE up front: which steps are already done. Everything below
  // is measured against the database, never against a log or a flag file, so
  // a killed run resumes honestly.
  const status = await roundStatus(manifest.seeded_ids)
  const done = new Set(status.filter((s) => s.complete).map((s) => s.step))

  const plan = RUNBOOK.map((step) => ({
    step,
    skip: !step.alwaysRun && done.has(step.step),
  }))

  console.log('Plan:')
  for (const { step, skip } of plan) {
    const mark = skip ? '·' : step.alwaysRun ? '▶' : '▶'
    const note = skip
      ? 'already complete, skipping'
      : step.alwaysRun
        ? 'always runs'
        : ''
    console.log(
      `  ${mark} ${step.runbook.padEnd(4)} ${step.step.padEnd(28)} ${note}`
    )
  }

  const todo = plan.filter((p) => !p.skip)
  console.log(
    `\n${todo.length} step(s) to run, ${plan.length - todo.length} already done.`
  )

  if (dryRun) {
    console.log('\n--dry-run: nothing was run.')
    return
  }

  for (const { step } of todo) {
    if (run(step, label)) continue

    console.error(`\n${'━'.repeat(72)}`)
    console.error(`✗ STOPPED at ${step.runbook}. ${step.step}`)
    if (step.onFail) console.error(`\n  ${step.onFail}`)
    console.error(
      `\n  Fix it, then re-run this command — the steps above are detected as\n` +
        `  done from database state and will be skipped, so nothing is paid twice:\n` +
        `    ${TSX} --env-file=.env.local scripts/run-round.ts --round ${label}\n`
    )
    process.exit(1)
  }

  console.log(`\n${'━'.repeat(72)}`)
  console.log(`✓ Round ${label} ran to completion.`)
  console.log(
    `\nStill yours, deliberately:\n` +
      `  · log-db-session.ts --round ${label} writes the factual half of the\n` +
      `    database-log entry; the half about what BIT you is the half that matters.\n` +
      `  · the editorial pass holds rows it could not clear. Those are recorded\n` +
      `    verdicts, not gaps — read reports/editorial-${label}.md.\n`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
