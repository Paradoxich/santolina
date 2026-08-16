/**
 * Trap 24 at its second site: a guard stamp must record that the finding was
 * ACTED ON, not merely that the check ran.
 *
 * `cross-check-native-to` stamped `native_checked_at` on any verdict. That
 * column is FAIL-level evidence in round-status that the step ran and settled
 * the row, and `--new-only` selects on it, so a `gross` or `contradicts` row
 * whose rewrite nobody had written yet was stamped out of every later sweep and
 * certified at round close. The sibling guard's version of this fired in round 8
 * and again in round 11.
 *
 * The assertions are on the STAMP DECISION, not on the verdict function that
 * feeds it: the verdict was never wrong, the stamp was.
 *
 * This is deliberately NOT the same rule as `rowsToStamp` in
 * cross-check-native-region.ts, and the last two cases below are the difference
 * — `no_data` is settled here and unsettled there, and a reviewed-and-kept row
 * is settled with no correction at all.
 */
import { describe, expect, it } from 'vitest'

import { shouldStamp } from './cross-check-native-to'

const row = (
  verdict: 'ok' | 'minor' | 'gross' | 'contradicts' | 'no_data',
  native_to_reviewed_at: string | null = null
) => ({ verdict, native_to_reviewed_at })

describe('shouldStamp: the stamp may not outrun the correction', () => {
  it('withholds the stamp on a pending gross correction', () => {
    expect(shouldStamp(row('gross'))).toBe(false)
  })

  it('withholds the stamp on a pending contradicts correction', () => {
    expect(shouldStamp(row('contradicts'))).toBe(false)
  })

  it('stamps a row whose phrase and evidence agree', () => {
    expect(shouldStamp(row('ok'))).toBe(true)
    expect(shouldStamp(row('minor'))).toBe(true)
  })
})

describe('shouldStamp: where this guard differs from the region guard', () => {
  it('stamps no_data, which the region guard refuses', () => {
    // There, no-data means GBIF returned nothing and nothing was learned. Here
    // it means the model found no continents on one side, which for a cultigen
    // is the settled answer — and a cultigen that does carry a phrase is routed
    // to contradicts before the no_data branch. Refusing it would leave every
    // cultigen permanently failing a FAIL-level step.
    expect(shouldStamp(row('no_data'))).toBe(true)
  })

  it('stamps a gross or contradicts row a person read and kept', () => {
    // native_to_reviewed_at is the "settled without a correction" decision. A
    // trigger clears it on any native_to edit, so it cannot outlive the phrase
    // it was about — which is what makes it safe to treat as settlement.
    const reviewed = '2026-07-30T00:00:00.000Z'
    expect(shouldStamp(row('gross', reviewed))).toBe(true)
    expect(shouldStamp(row('contradicts', reviewed))).toBe(true)
  })

  it('does not treat review as a licence for a rewritten phrase', () => {
    // Guarding the assumption above rather than the trigger itself: if the
    // stamp is absent, the row is unsettled again regardless of verdict.
    expect(shouldStamp(row('contradicts', null))).toBe(false)
  })
})
