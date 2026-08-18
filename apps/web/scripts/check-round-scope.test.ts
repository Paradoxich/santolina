/**
 * `cleared_at` on a closed round, and the timestamp an added pairing carries.
 *
 * Trap 16, pinned by `applyClearedAt` below: "a closed round's PAIRING check
 * still rots, because pairings carry no timestamp". The premise was FALSE: `plant_combinations` has carried
 * `created_at` since the initial schema, and the queued migration died on its
 * first local replay with "column already exists". The real fix was code-only —
 * an added-pairing finding carries its row's `created_at` in `writtenAt`, and
 * `applyClearedAt` demotes it past `cleared_at` exactly like a plant write.
 * Round 9 went from 120 FAILs to 0 that way.
 *
 * Two halves of the trap have to hold at once, and the second is the one that
 * makes it a trap rather than a filter: a REMOVED pairing has no timestamp to
 * judge, because the row is gone, so it must stay FAIL and be waived by name.
 * A demotion rule that quietly swallowed those would turn a deletion into
 * silence.
 *
 * The ratchet used to credit `scope.test.ts` with pinning this. It does not —
 * that file tests CLI scope parsing in `scope.ts` and never touches pairings,
 * `cleared_at` or `created_at`.
 */

import { describe, it, expect } from 'vitest'
import { applyClearedAt, type Finding } from './check-round-scope'

const CLEARED = { at: '2026-08-01T00:00:00Z', why: 'round 9 closed' }

const pairing = (writtenAt?: string): Finding => ({
  level: 'FAIL',
  check: 'out-of-scope pairing added',
  plant: 'sage + thyme',
  detail: 'both plants predate the round',
  ...(writtenAt ? { writtenAt } : {}),
})

const plantWrite = (id: string): Finding => ({
  level: 'FAIL',
  check: 'out-of-scope column write',
  plant: 'sage',
  id,
  detail: 'style_tags changed',
})

const rows = (id: string, updated_at: string) => [{ id, updated_at }]

describe('applyClearedAt', () => {
  it('demotes a pairing written after the round closed, on its own created_at', () => {
    const [out] = applyClearedAt([pairing('2026-08-05T00:00:00Z')], CLEARED, [])
    expect(out!.level).toBe('ALLOWED')
    expect(out!.why).toMatch(/after this round closed/)
  })

  it('keeps a pairing written while the round was open', () => {
    const [out] = applyClearedAt([pairing('2026-07-20T00:00:00Z')], CLEARED, [])
    expect(out!.level).toBe('FAIL')
  })

  it('keeps a REMOVED pairing, which has no timestamp to judge', () => {
    const removed: Finding = {
      level: 'FAIL',
      check: 'out-of-scope pairing removed',
      plant: 'sage + thyme',
      detail: 'row is gone',
    }
    expect(applyClearedAt([removed], CLEARED, [])[0]!.level).toBe('FAIL')
  })

  it('demotes a plant write on updated_at, looked up by id', () => {
    const out = applyClearedAt(
      [plantWrite('p1')],
      CLEARED,
      rows('p1', '2026-08-05T00:00:00Z')
    )
    expect(out[0]!.level).toBe('ALLOWED')
  })

  it('leaves a finding alone when the round was never cleared', () => {
    const out = applyClearedAt([pairing('2026-08-05T00:00:00Z')], null, [])
    expect(out[0]!.level).toBe('FAIL')
  })

  it('never promotes a WARN, only demotes a FAIL', () => {
    const warn: Finding = { ...pairing('2026-08-05T00:00:00Z'), level: 'WARN' }
    expect(applyClearedAt([warn], CLEARED, [])[0]!.level).toBe('WARN')
  })

  it('keeps a finding whose timestamp is unparseable rather than demoting it', () => {
    const out = applyClearedAt([pairing('not a date')], CLEARED, [])
    expect(out[0]!.level).toBe('FAIL')
  })
})
