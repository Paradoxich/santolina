/**
 * The two decisions the eight copies of the seed loop disagreed about.
 *
 * THE INCIDENT. Until 2026-08-17 every `seed-round<n>.ts` carried its own copy
 * of the loop — rounds 8 through 11 byte-identical at 133 lines, round 12
 * differing by ten. Those ten lines were not a round-12 requirement. They were
 * two fixes that landed in the newest copy and reached none of the other seven,
 * which is what eight copies of anything guarantees. `seed-runner.ts` is now the
 * only copy; against the pre-fix tree it does not exist and this file does not
 * compile.
 *
 * WHY THESE TWO FUNCTIONS AND NOT THE LOOP. The loop's body is Trefle calls and
 * database writes, and no test here mocks either — this repo asserts pure seams
 * instead, so the seams are the two places the copies actually differed. Both
 * are one-liners, which is the point: the defect was never complexity, it was
 * that a one-liner had eight homes.
 *
 * THE EXIT CONTRACT IS THE ONE THAT COST SOMETHING. Rounds 6-11 exit 0 when a
 * candidate could not be resolved, so a round could ask for 29 plants, seed 26,
 * and report success — a step that did not fully run and said nothing. The
 * first case below fails against that rule.
 */

import { describe, expect, it } from 'vitest'

import { seedRunIncomplete, shouldWriteManifest } from './seed-runner'

describe('the exit contract', () => {
  it('is INCOMPLETE when a candidate went unresolved and nothing failed', () => {
    // The case rounds 6-11 exited 0 on: `if (!dryRun && failures.length)`
    // is false here, so the pre-fix rule called this a clean run.
    expect(
      seedRunIncomplete({ unresolved: ['Aruncus aethusifolius'], failures: [] })
    ).toBe(true)
  })

  it('is INCOMPLETE when a row failed and nothing went unresolved', () => {
    expect(
      seedRunIncomplete({
        unresolved: [],
        failures: [{ entry: 1, error: 'x' }],
      })
    ).toBe(true)
  })

  it('is COMPLETE only when both are empty', () => {
    expect(seedRunIncomplete({ unresolved: [], failures: [] })).toBe(false)
  })

  it('does not exempt a dry run, which has no dryRun parameter to exempt it', () => {
    // A dry run that cannot resolve a name has found the problem a day early.
    // Encoded as an absence, so the assertion is on the signature.
    expect(seedRunIncomplete.length).toBe(1)
  })
})

describe('whether a manifest is written', () => {
  const base = { dryRun: false, label: '13', rowCount: 4 }

  it('writes one for a labelled apply run that seeded rows', () => {
    expect(shouldWriteManifest(base)).toBe(true)
  })

  it('writes none for a dry run, which seeded nothing to record', () => {
    expect(shouldWriteManifest({ ...base, dryRun: true })).toBe(false)
  })

  it('writes none when no rows were seeded, rather than an empty manifest', () => {
    expect(shouldWriteManifest({ ...base, rowCount: 0 })).toBe(false)
  })

  it('writes none without a label — the rounds that predate manifests', () => {
    // Rounds 6 and 7 pass no label. A manifest claims what a run seeded, and
    // building one now from a candidate list would be a claim about a run that
    // happened months ago.
    expect(shouldWriteManifest({ ...base, label: undefined })).toBe(false)
  })
})
