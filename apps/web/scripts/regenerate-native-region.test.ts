/**
 * Trap 3's live half, pinned: --apply replays reports/native-region-regen.json,
 * a gitignored file of unknown age. Until 2026-08-14 it did so with no scope
 * check at all, so a stale --all plan replayed after a seed would rewrite the
 * whole catalog while every message on screen said "round N" — the shape that
 * changed 20 settled rows in round 8. assertPlanScope is the refusal.
 */
import { describe, expect, it } from 'vitest'

import { assertPlanScope } from './regenerate-native-region'

describe('assertPlanScope: --apply refuses a plan its scope did not generate', () => {
  it('a plan from --all replayed under --round throws', () => {
    expect(() =>
      assertPlanScope({ kind: 'all' }, { kind: 'round', label: '11' })
    ).toThrow(/does not match/)
  })

  it('a plan from another round throws', () => {
    expect(() =>
      assertPlanScope(
        { kind: 'round', label: '8' },
        { kind: 'round', label: '11' }
      )
    ).toThrow(/does not match/)
  })

  it('a plan with no recorded scope is refused, not trusted', () => {
    // The legacy format wrote { generatedAt: null, plan } — indistinguishable
    // from a stale --all sweep, so it must never be applied as-is.
    expect(() =>
      assertPlanScope(undefined, { kind: 'round', label: '11' })
    ).toThrow(/records no scope/)
    expect(() => assertPlanScope(null, { kind: 'round', label: '11' })).toThrow(
      /records no scope/
    )
    expect(() =>
      assertPlanScope({ kind: 'sideways' }, { kind: 'round', label: '11' })
    ).toThrow(/records no scope/)
  })

  it('the matching scope passes', () => {
    expect(() =>
      assertPlanScope(
        { kind: 'round', label: '11' },
        { kind: 'round', label: '11' }
      )
    ).not.toThrow()
    expect(() =>
      assertPlanScope({ kind: 'all' }, { kind: 'all' })
    ).not.toThrow()
  })

  it('--ids plans match on the set, not the order', () => {
    expect(() =>
      assertPlanScope(
        { kind: 'ids', ids: ['b', 'a'] },
        { kind: 'ids', ids: ['a', 'b'] }
      )
    ).not.toThrow()
    expect(() =>
      assertPlanScope(
        { kind: 'ids', ids: ['a'] },
        { kind: 'ids', ids: ['a', 'b'] }
      )
    ).toThrow(/does not match/)
  })
})
