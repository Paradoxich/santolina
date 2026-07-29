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
import { resolveBaselineDir } from './catalog-snapshot'

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

  // PREFLIGHT: the rollback point must exist BEFORE anything is billed.
  //
  // resolveBaselineDir only accepts a snapshot taken at or before the
  // manifest's started_at, which is correct and is why round 9 picked the
  // hand-taken pre-seed backup over the runner's own post-seed one. But a
  // round with NO pre-seed snapshot does not fail here — it fails at step 8a,
  // after every AI pass has been paid for, because that is the first step to
  // ask for a baseline.
  //
  // The backup this runner takes at step 0 cannot fill the gap: the runner
  // does not seed, so its step 0 always happens AFTER the plants exist. A
  // pre-seed snapshot has to be taken by whoever seeds, and this is the check
  // that says so at second zero instead of at the end of the round.
  try {
    const baseline = resolveBaselineDir(label, manifest.started_at)
    console.log(`Rollback point: ${baseline.dir} (${baseline.source})\n`)
  } catch {
    console.error(
      `No catalog snapshot predates round ${label}'s seed (started ${manifest.started_at}).\n\n` +
        "That is the round's rollback point, and step 8a needs it to tell this\n" +
        "round's writes from everyone else's. Failing now rather than after the\n" +
        'AI passes have been billed.\n\n' +
        'The backup at step 0 below cannot cover this — the runner does not seed,\n' +
        'so its backup is always taken after the new plants exist. Take one before\n' +
        'seeding:\n\n' +
        '  ./node_modules/.bin/tsx --env-file=.env.local scripts/backup-catalog.ts\n\n' +
        'If a suitable snapshot exists elsewhere, pass it to check-round-scope\n' +
        'with --baseline <dir>.\n'
    )
    process.exit(1)
  }

  // Read state up front for the PLAN. Everything is measured against the
  // database, never against a log or a flag file, so a killed run resumes
  // honestly.
  //
  // The plan is a forecast, not the decision — see refreshDone() below. This
  // read is re-done after every step that actually runs, because some steps'
  // completion is not knowable until an earlier step has run.
  const done = new Set<string>()
  const refreshDone = async () => {
    const status = await roundStatus(manifest.seeded_ids)
    done.clear()
    // `complete && !vacuous`. A step whose scope is empty has not been asked a
    // question yet, so it is not done — see StepStatus.vacuous. Treating
    // vacuous completion as done is how round 9's image-verify step was
    // crossed off before a single image had been judged, and it would have
    // stayed crossed off in every future round.
    for (const s of status) if (s.complete && !s.vacuous) done.add(s.step)
  }
  await refreshDone()

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
  if (todo.length < plan.length) {
    console.log(
      'This plan is a forecast. Each skip is re-decided against fresh state\n' +
        'immediately before the step, because a step can read as complete only\n' +
        'because the step that feeds it has not run yet.'
    )
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing was run.')
    return
  }

  // Walk the WHOLE runbook, not the plan's todo list, and re-decide each skip
  // against freshly read state.
  //
  // WHY, because the up-front plan looked sufficient and was not: a step whose
  // `applies` predicate depends on a column an EARLIER step writes reads as
  // complete before that step has run, vacuously — nothing applies, so nothing
  // is outstanding. `pick-plant-images --verify` (7a2) applies only to
  // medium-confidence heroes, and no plant has any confidence at all until 7a
  // has run. Round 9's plan skipped it before a single image had been picked.
  // Frozen at plan time, that step can NEVER run in a fresh round; round 8's
  // verify pass only happened because it was invoked by hand.
  //
  // A completion predicate that reads true because its input does not exist
  // yet is the same failure this pipeline keeps finding — a step that did not
  // run leaves no error, only a smaller run than it should have been.
  for (const { step, skip: forecast } of plan) {
    if (!step.alwaysRun && done.has(step.step)) continue

    if (forecast) {
      console.log(
        `\n  (plan said ${step.step} was complete; fresh state says it is not — running it)`
      )
    }

    if (run(step, label)) {
      await refreshDone()
      continue
    }

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
