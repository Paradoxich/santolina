/**
 * THE REHEARSAL — run a round's bookkeeping against a synthetic plant, so the
 * pipeline's structural bugs are found in CI instead of in a live round.
 *
 * Pins TRAP 36 — a step reads a column the status query never fetched (see the
 * `every registered stamp column is actually fetched (trap 36)` block at the
 * foot of this file).
 *
 * WHY THIS FILE EXISTS. Round 9 found three bugs in the runner, and all three
 * cost a live round to discover — one of them after a vision pass had already
 * been billed for 50 plants. None of the three needed a database, an API key,
 * or a single cent to find:
 *
 *   1. `pick-plant-images --verify` reported itself COMPLETE before the step
 *      that feeds it had run. Its `applies` predicate matches only
 *      medium-confidence heroes, and nothing has a confidence until the image
 *      pass runs, so its scope was empty and `done === total` was `0 === 0`.
 *      A plant object with every column null demonstrates this in a
 *      millisecond.
 *   2. `regenerate-native-region` had only its `--apply` half registered, and
 *      `--apply` replays a file that only its unregistered other half writes.
 *      Reading the runbook against the filesystem shows this.
 *   3. `recover-image-categories` — a hard prerequisite of the vision pass —
 *      was in no runbook at all, so the vision pass silently judged nothing
 *      and reported success. Comparing what steps produce against what later
 *      steps consume shows this.
 *
 * The shape they share is "a step the runner did not know it needed", and that
 * shape is checkable without running anything. The assertions below are
 * deliberately about STRUCTURE — the order, the registry, the predicates —
 * rather than about plant data, because plant data is what the live pipeline
 * already checks well.
 *
 * WHAT THIS DOES NOT DO. It does not prove a step's output is correct, or that
 * an API contract still holds — a green rehearsal is not a green round. It
 * proves the pipeline is WIRED correctly, which is the half that kept failing.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeStatus,
  STEP_DEFS,
  STATUS_PROJECTION,
  registeredStampColumns,
  type StatusRow,
  type StepContext,
} from './round-status'
import { RUNBOOK } from './runbook'

/**
 * A plant exactly as a seed run leaves it: identified, and nothing else.
 * Every curated column is null because no pass has run yet.
 */
function freshlySeededPlant(id = 'plant-1'): StatusRow {
  return {
    id,
    scientific_name: 'Testus plantus',
    ai_drafted_at: null,
    native_region: null,
    botanical_checked_at: null,
    native_checked_at: null,
    native_region_checked_at: null,
    hardiness_rating: null,
    seasonal_care: null,
    style_checked_at: null,
    greenery_checked_at: null,
    image_checked_at: null,
    image_pick_confidence: null,
    image_verified_at: null,
    editorial_checked_at: null,
    common_name_checked_at: null,
  }
}

const noContext = (): StepContext => ({ paired: new Set<string>() })

describe('a freshly seeded round owes every step', () => {
  it('reports no step as genuinely complete', () => {
    const status = computeStatus([freshlySeededPlant()], noContext())

    // The bug this catches: a step reporting itself finished before it has
    // looked at anything. `complete` alone is not the assertion, because a
    // step with an empty scope is trivially "complete" — the pair is.
    const claimingDone = status.filter((s) => s.complete && !s.vacuous)

    expect(
      claimingDone.map((s) => s.step),
      'a step claims to be done for a plant that has had no pass run on it'
    ).toEqual([])
  })

  it('marks empty-scope steps vacuous rather than complete', () => {
    const status = computeStatus([freshlySeededPlant()], noContext())

    // This is round 9's bug, pinned. pick-plant-images --verify applies only
    // to medium-confidence heroes; a fresh plant has no confidence at all, so
    // its scope is empty. It MUST be distinguishable from a step that ran.
    const verify = status.find((s) => s.step === 'pick-plant-images --verify')
    expect(
      verify,
      'the image-verify step is missing from STEP_DEFS'
    ).toBeDefined()
    expect(verify!.total).toBe(0)
    expect(verify!.vacuous).toBe(true)
  })

  it('never reports vacuous for a step that has real scope', () => {
    // A plant the image pass HAS judged as medium: verify now genuinely
    // applies, so the step is in scope, incomplete, and not vacuous.
    const judged: StatusRow = {
      ...freshlySeededPlant(),
      image_checked_at: '2026-07-29T00:00:00Z',
      image_pick_confidence: 'medium',
    }
    const status = computeStatus([judged], noContext())
    const verify = status.find((s) => s.step === 'pick-plant-images --verify')!

    expect(verify.total).toBe(1)
    expect(verify.vacuous).toBe(false)
    expect(verify.complete).toBe(false)
  })

  it('a drafted row without its style and greenery stamps does not close curate-plants', () => {
    // Trap 26, pinned. The drafting call owns the style and greenery
    // questions, so ai_drafted_at alone must never count as done — that is
    // exactly the state the silent style no-op left rounds 9 and 10 in,
    // and those rounds closed green.
    const drafted: StatusRow = {
      ...freshlySeededPlant(),
      ai_drafted_at: '2026-08-14T00:00:00Z',
    }
    const status = computeStatus([drafted], noContext())
    const draft = status.find((s) => s.step === 'curate-plants')!
    expect(draft.complete).toBe(false)
  })

  it('an empty round is vacuous for nothing — there is no work to misreport', () => {
    // Guard on the guard: `vacuous` must mean "this step's filter excluded
    // everything", not "the round has no plants". Otherwise a zero-plant round
    // would look like a pipeline fault.
    const status = computeStatus([], noContext())
    expect(status.every((s) => !s.vacuous)).toBe(true)
  })
})

describe('the runbook is wired to something that exists', () => {
  const scriptsDir = join(__dirname)

  it('every step points at a script file that is present', () => {
    // Catches a step renamed or deleted without its runbook entry following.
    const missing = RUNBOOK.filter(
      (step) => !existsSync(join(scriptsDir, step.script))
    ).map((step) => `${step.runbook} ${step.step} -> ${step.script}`)

    expect(missing, 'runbook steps point at scripts that do not exist').toEqual(
      []
    )
  })

  it('gives every step a distinct runbook number', () => {
    // Round 9 briefly had two steps numbered 4, which makes the generated doc
    // and the run output disagree about which step someone means.
    const seen = new Map<string, string>()
    const collisions: string[] = []
    for (const step of RUNBOOK) {
      const prev = seen.get(step.runbook)
      if (prev) collisions.push(`${step.runbook}: ${prev} and ${step.step}`)
      seen.set(step.runbook, step.step)
    }
    expect(collisions).toEqual([])
  })

  it('runs steps in runbook order', () => {
    // The array IS the order that executes, so a step inserted in the wrong
    // position runs in the wrong position. Sorting numerically-then-suffix
    // ("4" before "4a" before "5") must reproduce the array as written.
    const key = (n: string) => {
      const digits = parseInt(n, 10)
      const suffix = n.replace(/^\d+/, '')
      return [Number.isNaN(digits) ? 0 : digits, suffix] as const
    }
    const actual = RUNBOOK.map((s) => s.runbook)
    const sorted = [...actual].sort((a, b) => {
      const [an, as] = key(a)
      const [bn, bs] = key(b)
      return an - bn || as.localeCompare(bs)
    })
    expect(actual, 'RUNBOOK is not in runbook-number order').toEqual(sorted)
  })

  it('every DB-detectable step in the runbook is registered in STEP_DEFS', () => {
    // A runbook step with no STEP_DEFS entry cannot be detected as done, so
    // the runner re-runs it forever and verify-round cannot see it at all.
    // alwaysRun steps are exempt by design: they leave no per-plant evidence.
    const registered = new Set(STEP_DEFS.map((d) => d.step))
    const unregistered = RUNBOOK.filter(
      (step) => !step.alwaysRun && !registered.has(step.step)
    ).map((step) => step.step)

    expect(
      unregistered,
      'runbook steps that leave no detectable evidence and are not marked alwaysRun'
    ).toEqual([])
  })

  it('every per-round STEP_DEFS entry is actually in the runbook', () => {
    // The other direction, and the one that hid round 8's miss: a step can be
    // registered (so its column is claimed and verify-round is satisfied)
    // while nothing in the runbook ever runs it.
    const inRunbook = new Set(RUNBOOK.map((s) => s.step))
    const orphaned = STEP_DEFS.filter(
      (def) => def.perRound !== false && !inRunbook.has(def.step)
    ).map((def) => def.step)

    expect(
      orphaned,
      'steps a round owes that no runbook entry runs — this is the round-8 failure'
    ).toEqual([])
  })

  it('claims a stamp column for every step that has one', () => {
    // registeredStampColumns is what verify-round diffs against the live
    // table. If it silently returned nothing, that check would pass forever.
    const claimed = registeredStampColumns()
    expect(claimed.size).toBeGreaterThan(0)
    expect(claimed.has('image_verified_at')).toBe(true)
  })
})

describe('prerequisites are steps, not folklore', () => {
  it('runs the native-region plan before it applies the plan', () => {
    // Round 9 bug 2: only `--apply` was registered, and it replays a file the
    // unregistered plan half writes into gitignored reports/. The round died
    // on a clean checkout.
    const idx = (pred: (s: (typeof RUNBOOK)[number]) => boolean) =>
      RUNBOOK.findIndex(pred)

    const plan = idx(
      (s) =>
        s.script === 'regenerate-native-region.ts' &&
        !s.args?.includes('--apply')
    )
    const apply = idx(
      (s) =>
        s.script === 'regenerate-native-region.ts' &&
        !!s.args?.includes('--apply')
    )

    expect(
      plan,
      'the plan half of regenerate-native-region is not in the runbook'
    ).toBeGreaterThanOrEqual(0)
    expect(apply).toBeGreaterThanOrEqual(0)
    expect(
      plan,
      'the plan must be generated before it is applied'
    ).toBeLessThan(apply)
  })

  it('populates image candidates before the vision pass reads them', () => {
    // Round 9 bug 3: recover-image-categories fills image_candidates, and
    // pick-plant-images judges only rows that have them. It was in no runbook,
    // so the vision pass judged nothing and reported success.
    const recover = RUNBOOK.findIndex(
      (s) => s.script === 'recover-image-categories.ts'
    )
    const pick = RUNBOOK.findIndex((s) => s.script === 'pick-plant-images.ts')

    expect(
      recover,
      'recover-image-categories is not in the runbook, so the vision pass has nothing to judge'
    ).toBeGreaterThanOrEqual(0)
    expect(recover).toBeLessThan(pick)
  })

  it('widens the candidate pool before the vision pass is billed', () => {
    // The same shape as the bug above, one step along, and it cost round 13
    // three plants: feed-wikimedia-candidates is the ONLY source of a photo
    // for a species Trefle has none for, and it was in no runbook — reachable
    // only from a hand-written "needs a new photo" list, so "Trefle gave us
    // nothing" never triggered it.
    //
    // ORDER IS THE ASSERTION, not mere presence. Run after the pick it still
    // works, and is billed twice: the pass judges Trefle's candidates, the
    // feed then clears image_checked_at, and the pass pays to judge the row
    // again. Between 6 and 7a, one call sees both pools.
    const recover = RUNBOOK.findIndex(
      (s) => s.script === 'recover-image-categories.ts'
    )
    const feed = RUNBOOK.findIndex(
      (s) => s.script === 'feed-wikimedia-candidates.ts'
    )
    const pick = RUNBOOK.findIndex((s) => s.script === 'pick-plant-images.ts')

    expect(
      feed,
      'feed-wikimedia-candidates is in no runbook, so a plant Trefle has no photo for reaches production with a placeholder and nothing says so'
    ).toBeGreaterThanOrEqual(0)
    expect(
      recover,
      'the Wikimedia feed must run after Trefle candidates are in, or it cannot tell which plants have nothing'
    ).toBeLessThan(feed)
    expect(
      feed,
      'the vision pass would be billed once for Trefle and again for the widened pool'
    ).toBeLessThan(pick)
  })

  it('runs the Wikimedia feed with --apply, not as a dry run', () => {
    // It is dry-run-by-default house discipline, so the runbook has to ask for
    // the write explicitly. Without the flag the step succeeds, prints what it
    // would have added, writes nothing, and 7a judges the un-widened pool — a
    // green round carrying the exact defect the step was added to prevent.
    const feed = RUNBOOK.find(
      (s) => s.script === 'feed-wikimedia-candidates.ts'
    )!
    expect(feed?.args ?? []).toContain('--apply')
  })

  it('signs off last', () => {
    // curate-editorial judges the output of every step above it, so it can
    // only be last. If something is appended after it, that work is never
    // part of the verdict.
    const editorial = RUNBOOK.findIndex((s) => s.step === 'curate-editorial')
    const after = RUNBOOK.slice(editorial + 1).filter((s) => !s.alwaysRun)

    expect(
      after.map((s) => s.step),
      'these steps run after sign-off, so their output is never judged'
    ).toEqual([])
  })
})

/**
 * TRAP 36 — a step reads a column the status query never fetched.
 *
 * THE INCIDENT. Round 13, `curate-common-names` step 1a. The step was properly
 * registered in STEP_DEFS with the right stampColumn and the right evidence
 * string, and `curate-common-names --apply` correctly stamped all 33 rows. It
 * still reported `0 already done`, because `common_name_checked_at` was absent
 * from `roundStatus`'s `.select()` projection and had been for the life of the
 * step.
 *
 * WHY NOTHING CAUGHT IT. `StatusRow` declares the field, so
 * `ran: (p) => Boolean(p.common_name_checked_at)` typechecks and quietly reads
 * `undefined` on every row; PostgREST raises nothing for a column you did not
 * ask for. A projection is a string — the one part of a typed query the
 * compiler cannot see into.
 *
 * WHAT IT WOULD HAVE COST. A step that can never be detected as done is a step
 * `run-round` re-runs and re-bills every single round, and `verify-round`
 * reports as an outstanding gap forever. This is trap 4's family seen one layer
 * down: there the step was missing from the registry, here it is in the
 * registry and missing from the query.
 *
 * THE WITNESS is the projection itself, which is why it is now exported rather
 * than inline. Against the pre-fix code the first assertion below fails,
 * naming `common_name_checked_at`.
 */
describe('every registered stamp column is actually fetched (trap 36)', () => {
  const fetched = new Set(STATUS_PROJECTION.split(',').map((c) => c.trim()))

  it('fetches every column a step detects itself by', () => {
    const missing = [...registeredStampColumns()].filter((c) => !fetched.has(c))
    expect(
      missing,
      'these steps read a column the status query never selected, so they can ' +
        'never report as done and will be re-run and re-billed every round'
    ).toEqual([])
  })

  it('fetches the identity columns the report prints', () => {
    // A missing id or name does not break detection, it breaks the output that
    // a person reads to decide whether the round is finished.
    expect(fetched.has('id')).toBe(true)
    expect(fetched.has('scientific_name')).toBe(true)
  })

  it('fetches the non-stamp evidence columns steps read', () => {
    // Not every step detects itself by a *_checked_at stamp: curate-plants
    // reads ai_drafted_at, seasonal care reads seasonal_care, and the image
    // verify step reads image_pick_confidence to compute its scope. A missing
    // one of these fails the same way and is invisible to the check above.
    for (const column of [
      'ai_drafted_at',
      'native_region',
      'seasonal_care',
      'image_pick_confidence',
    ]) {
      expect(fetched.has(column), `${column} is read but never fetched`).toBe(
        true
      )
    }
  })
})
