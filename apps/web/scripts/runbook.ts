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
 * The `alwaysRun` entries are book-ends: free, and run whether or not the
 * round has work. The rest do the work and cost money. Count either from the
 * array rather than writing a number here.
 */

export interface Step {
  /** Matches the STEP_DEFS name when the step's completion is DB-detectable. */
  step: string
  /** Runbook step number, so the output and docs/curation.md#round-runbook
   * can be read side by side. */
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
  /**
   * This step takes `--baseline <dir>` and must receive the SAME rollback point
   * the runner validated in its preflight.
   *
   * Declared per step rather than forwarded to everything, because a flag
   * handed to a script that ignores it is worse than not passing it: the run
   * looks configured and is not. Today only step 8a reads a baseline; the
   * preflight resolves the same one, so without this the runner could pass its
   * check against one snapshot and then have 8a silently pick another.
   */
  acceptsBaseline?: boolean
  /** Printed when the step fails, above the re-run command. */
  onFail?: string
}

/**
 * THE RUNBOOK. Order matters and is the same order as docs/curation.md#round-runbook.
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
  {
    // BEFORE curate-plants, and the order is a requirement rather than a
    // preference: curate-plants writes a description that names the plant, and
    // every later pass reads common_name as the label it reasons about. A name
    // corrected afterwards leaves that text talking about the old one.
    //
    // It is also before `verify-round`, which FAILs on a duplicate common_name
    // — the failure rounds 8 and 11 each hit, and the reason the corrective
    // pass existed at all. Trap 6, upstream at last.
    step: 'curate-common-names',
    runbook: '1a',
    script: 'curate-common-names.ts',
    args: ['--apply'],
    onFail:
      "Names are Trefle's, not a gardener's. Re-run with --round <label> and read the proposed renames before --apply.",
  },
  { step: 'curate-plants', runbook: '2', script: 'curate-plants.ts' },
  {
    step: 'curate-combinations',
    runbook: '3',
    script: 'curate-combinations.ts',
  },
  {
    // The PLAN half of a generate-review-apply script. It writes no DB rows —
    // only reports/native-region-regen.{md,json} — so it is free, and it always
    // runs.
    //
    // It was missing, and the runner could therefore never finish a round on a
    // clean checkout: only `--apply` was registered, and `--apply` replays a
    // plan JSON that lives in gitignored reports/. Round 9 hit this on its
    // first unattended run. Round 8 got past it because a plan file happened to
    // be sitting on that machine from a manual run — the same shape as the trap
    // about backups that die with their worktree, and the reason a round must
    // not depend on untracked local state.
    step: 'regenerate-native-region (plan)',
    runbook: '4',
    script: 'regenerate-native-region.ts',
    alwaysRun: true,
  },
  {
    // NOTE: this applies the plan immediately, in the same run. The script's
    // own docs describe a review step between the two and there is no gate here
    // enforcing it — `onFail` only fires on failure, and generating a plan
    // succeeds. What actually audits this write is step 5b, the WCVP
    // cross-check, which reported 45/50 agreement for round 9 and caught the
    // one row where Trefle had counted an INTRODUCED range as native. If that
    // cross-check ever stops being a FAIL-level step, this needs a real gate.
    step: 'regenerate-native-region',
    runbook: '4a',
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
    // The vision pass's prerequisite, and it was never in the runbook.
    //
    // recover-image-categories fetches Trefle's per-category image labels into
    // image_candidates. pick-plant-images judges ONLY rows that have them, so
    // without this the vision pass has nothing to look at. This script's own
    // header has said "use after a new seed batch" all along; the runbook never
    // did, so every round depended on somebody remembering. Round 8's
    // candidates came from a manual run; round 9's never happened, and the
    // vision pass reported success over 50 unjudged plants.
    //
    // No AI spend — Trefle calls only — and it skips rows that already have
    // candidates, so running it every round is cheap and idempotent.
    step: 'recover-image-categories',
    runbook: '6',
    script: 'recover-image-categories.ts',
    alwaysRun: true,
  },
  {
    // Between the Trefle candidates and the vision pass, so one paid call sees
    // both pools. Free and idempotent: the gate selects only rows with nothing
    // to judge and no Wikimedia candidate yet, which is what makes alwaysRun
    // safe for a step that clears image_checked_at.
    step: 'feed-wikimedia-candidates',
    runbook: '6a',
    script: 'feed-wikimedia-candidates.ts',
    args: ['--apply'],
    alwaysRun: true,
    onFail:
      'The candidate pool was not widened, so 7a would judge only what Trefle ' +
      'gave us. Re-run it BEFORE the vision pass rather than after — a pick ' +
      'made now and re-made later is billed twice.',
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
    acceptsBaseline: true,
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
