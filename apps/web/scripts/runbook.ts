/**
 * THE RUNBOOK — the ordered list of steps a round runs, and its single home.
 *
 * It lives in its own module because three things need it and none of them
 * should own it: `run-round.ts` executes it, `generate-runbook-doc.ts` renders
 * it to `docs/round-runbook.md`, and a reader needs to see it without either.
 *
 * That is the one-home-per-fact rule applied to the process itself. The order
 * used to exist twice, here and in prose, and the prose is how the
 * seasonal-care step went missing entirely — so every plant seeded after Care
 * Tips v2 shipped had no care tip. The doc is now GENERATED from this array. If
 * you are about to write the order of the round into a document, don't; link to
 * the generated page instead.
 *
 * TEN STEPS PLUS FOUR BOOK-ENDS, and the distinction is worth keeping straight
 * because both numbers are true and they get confused. The four `alwaysRun`
 * entries (backup, verify, scope-check, archive) are book-ends: free, and run
 * whether or not the round has work. The other ten do the work. "Thirteen steps
 * became ten" on 2026-07-29 refers to the ten.
 */

export interface Step {
  /** Matches the STEP_DEFS name when the step's completion is DB-detectable. */
  step: string
  /** §25 number, so the output and the doc can be read side by side. */
  runbook: string
  script: string
  /** Extra flags beyond --round <label>. */
  args?: string[]
  /**
   * A step whose completion cannot be read from plant state.
   *
   * These always run. That is correct rather than lazy: they are the free
   * ones (a backup, a verifier, an archive), and re-running them is cheap
   * while skipping one on a bad guess is not.
   */
  alwaysRun?: boolean
  /** Printed when the step fails, above the re-run command. */
  onFail?: string
}

/**
 * THE RUNBOOK. Order matters and is the same order as docs/architecture.md §25.
 *
 * Three steps that used to sit in here are gone as of 2026-07-29, and the
 * reasoning is in round-status.ts: curate-styles and curate-greenery are
 * repair passes for older data (curate-plants already does both jobs for new
 * seeds, from the same shared definitions), and draft-hardiness feeds a parked
 * feature. Ten steps, not thirteen.
 */
export const RUNBOOK: Step[] = [
  {
    step: 'backup',
    runbook: '0',
    script: 'backup-catalog.ts',
    args: [],
    alwaysRun: true,
    onFail:
      'No backup, no round. Everything below is reversible only because this ran.',
  },
  { step: 'curate-plants', runbook: '2', script: 'curate-plants.ts' },
  {
    step: 'curate-combinations',
    runbook: '3',
    script: 'curate-combinations.ts',
  },
  {
    step: 'regenerate-native-region',
    runbook: '4',
    script: 'regenerate-native-region.ts',
    args: ['--apply'],
  },
  { step: 'cross-check-plants', runbook: '5', script: 'cross-check-plants.ts' },
  {
    step: 'cross-check-native-to',
    runbook: '5a',
    script: 'cross-check-native-to.ts',
  },
  {
    step: 'cross-check-native-region',
    runbook: '5b',
    script: 'cross-check-native-region.ts',
  },
  {
    step: 'curate-seasonal-care',
    runbook: '7',
    script: 'curate-seasonal-care.ts',
  },
  { step: 'pick-plant-images', runbook: '7a', script: 'pick-plant-images.ts' },
  {
    step: 'pick-plant-images --verify',
    runbook: '7a2',
    script: 'pick-plant-images.ts',
    args: ['--verify'],
  },
  { step: 'curate-editorial', runbook: '7b', script: 'curate-editorial.ts' },
  {
    step: 'verify',
    runbook: '8',
    script: 'verify-round.ts',
    alwaysRun: true,
    onFail:
      'The round is NOT done. verify-round checks catalog-wide invariants the ' +
      'per-step counts cannot see; read its output rather than re-running.',
  },
  {
    step: 'scope-check',
    runbook: '8a',
    script: 'check-round-scope.ts',
    alwaysRun: true,
    onFail:
      'This round wrote outside its own manifest. Since the 2026-07-29 freeze ' +
      'that should be impossible from a pipeline step, so treat it as a real ' +
      'finding rather than something to waive.',
  },
  {
    step: 'archive',
    runbook: '8b',
    script: 'archive-round.ts',
    alwaysRun: true,
  },
]
