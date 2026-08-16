import { describe, expect, it } from 'vitest'
import { describeBatchFailure, mapVerdict } from './pick-plant-images'

/**
 * The promotion rule is the whole argument that --verify is a second question
 * rather than a second attempt at the same one, so it is pinned here rather
 * than left to a prompt. If someone later makes `unsure` clear the bar, this
 * is the test that should stop them.
 */
describe('mapVerdict', () => {
  it('clears only a confirmed species', () => {
    expect(
      mapVerdict({ species_match: 'yes', hero_quality: 'good', reason: '' })
    ).toBe('high')
    expect(
      mapVerdict({
        species_match: 'yes',
        hero_quality: 'acceptable',
        reason: '',
      })
    ).toBe('high')
  })

  it('holds an unconfirmed species at medium however good the photo is', () => {
    expect(
      mapVerdict({ species_match: 'unsure', hero_quality: 'good', reason: '' })
    ).toBe('medium')
    expect(
      mapVerdict({
        species_match: 'unsure',
        hero_quality: 'acceptable',
        reason: '',
      })
    ).toBe('medium')
  })

  it('demotes a wrong species even when the photograph is beautiful', () => {
    expect(
      mapVerdict({ species_match: 'no', hero_quality: 'good', reason: '' })
    ).toBe('low')
  })

  it('demotes a poor photo even when the species is confirmed', () => {
    expect(
      mapVerdict({ species_match: 'yes', hero_quality: 'poor', reason: '' })
    ).toBe('low')
  })

  it('can only ever move a medium row up, down, or nowhere — never past a check', () => {
    // Every combination resolves, so no answer falls through to a default.
    const all = (['yes', 'unsure', 'no'] as const).flatMap((s) =>
      (['good', 'acceptable', 'poor'] as const).map((q) =>
        mapVerdict({ species_match: s, hero_quality: q, reason: '' })
      )
    )
    expect(all).toHaveLength(9)
    expect(all.every((v) => ['high', 'medium', 'low'].includes(v))).toBe(true)
    // And the strict bar holds: nothing without a confirmed species is high.
    expect(all.filter((v) => v === 'high')).toHaveLength(2)
  })
})

/**
 * Round 12 printed seven bare UUIDs followed by the word "errored", and the
 * only way to learn whether those rows were retryable was to query the Batch
 * API by hand. A transient timeout and a permanently dead candidate URL both
 * arrive as `type: 'errored'`, and they need opposite responses — so the
 * category is not the message.
 *
 * The payload in the first case is copied verbatim from what the API returned
 * for round 12's `Persicaria bistorta` request. These assertions fail against
 * the pre-fix line, which printed `result.type` and nothing else.
 */
describe('describeBatchFailure', () => {
  const timedOut = {
    type: 'errored',
    error: {
      type: 'error',
      request_id: 'workerreq_017u8eYAU8yEuhfZ8D2d7HR1',
      error: {
        type: 'invalid_request_error',
        message:
          'The request timed out while trying to download the file. Please try again later.',
      },
    },
  } as const

  it('names the reason, not just the category', () => {
    const line = describeBatchFailure(timedOut)
    expect(line).toContain('invalid_request_error')
    expect(line).toContain('timed out while trying to download the file')
    // The bare category alone is exactly the round-12 defect.
    expect(line).not.toBe('errored')
  })

  it('carries the request id, which is the handle support asks for', () => {
    expect(describeBatchFailure(timedOut)).toContain(
      'workerreq_017u8eYAU8yEuhfZ8D2d7HR1'
    )
  })

  it('separates a retryable timeout from a dead candidate URL', () => {
    const notFound = {
      type: 'errored',
      error: {
        type: 'error',
        request_id: null,
        error: { type: 'not_found_error', message: 'image not found' },
      },
    } as const
    // Same `result.type` on both, different text — which is the whole point.
    expect(timedOut.type).toBe(notFound.type)
    expect(describeBatchFailure(timedOut)).not.toBe(
      describeBatchFailure(notFound)
    )
    expect(describeBatchFailure(notFound)).toContain('not_found_error')
  })

  it('leaves canceled and expired alone — they carry no detail to add', () => {
    expect(describeBatchFailure({ type: 'canceled' })).toBe('canceled')
    expect(describeBatchFailure({ type: 'expired' })).toBe('expired')
  })
})
