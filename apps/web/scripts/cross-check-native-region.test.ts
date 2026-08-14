/**
 * Trap 24, pinned: a report-only cross-check run must not stamp a
 * disagreement it did not fix. The stamp is what round-status.ts accepts as
 * FAIL-level proof the row is settled, so a stamp that outruns the write
 * turns "correction pending" into "positively certified" and every later
 * --new-only sweep skips the row. It fired in round 8 and again in round 11.
 *
 * One gap deliberately outside the pure selector: applyCorrections skips a
 * row whose value changed since the report, and main() subtracts those ids
 * from the stamp list itself. That subtraction is exercised here against the
 * same shape main() uses, not against the DB.
 */
import { describe, expect, it } from 'vitest'

import { rowsToStamp } from './cross-check-native-region'

const f = (
  id: string,
  verdict: Parameters<typeof rowsToStamp>[0][number]['verdict']
) => ({
  id,
  verdict,
})

describe('rowsToStamp: the stamp never outruns the write', () => {
  it('a report-only run does not stamp a disagreement it did not fix', () => {
    const ids = rowsToStamp([f('a', 'disagrees')], false, false)
    expect(ids).toEqual([])
  })

  it('an applied run stamps the disagreement it corrected', () => {
    const ids = rowsToStamp([f('a', 'disagrees')], true, false)
    expect(ids).toEqual(['a'])
  })

  it('no-native-range needs BOTH --apply and --allow-empty', () => {
    // applyCorrections withholds the clear without --allow-empty, so the
    // stamp must be withheld on exactly the same condition.
    expect(rowsToStamp([f('a', 'no-native-range')], false, false)).toEqual([])
    expect(rowsToStamp([f('a', 'no-native-range')], true, false)).toEqual([])
    expect(rowsToStamp([f('a', 'no-native-range')], false, true)).toEqual([])
    expect(rowsToStamp([f('a', 'no-native-range')], true, true)).toEqual(['a'])
  })

  it('no-data is never stamped — a failed fetch is not a check', () => {
    expect(rowsToStamp([f('a', 'no-data')], true, true)).toEqual([])
  })

  it('match and reviewed are always stamped — nothing was pending', () => {
    const findings = [f('a', 'match'), f('b', 'reviewed')]
    expect(rowsToStamp(findings, false, false)).toEqual(['a', 'b'])
    expect(rowsToStamp(findings, true, true)).toEqual(['a', 'b'])
  })

  it('stale-skip subtraction removes an applied row whose write was withheld', () => {
    // main(): rowsToStamp(...).filter((id) => !staleSkipped.has(id))
    const staleSkipped = new Set(['b'])
    const ids = rowsToStamp(
      [f('a', 'disagrees'), f('b', 'disagrees')],
      true,
      false
    ).filter((id) => !staleSkipped.has(id))
    expect(ids).toEqual(['a'])
  })
})
