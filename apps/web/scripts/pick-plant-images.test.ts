/**
 * `pick-plant-images`: which candidate clears the bar, and which failure is an
 * answer about the photograph rather than about the network.
 *
 * Trap 1, pinned by `partitionProbes` below: a failed fetch must never look
 * like a negative result. A probe that kept failing transiently — a 429 that
 * was still a 429 after every retry — learned NOTHING about the photograph, so
 * filing it with the dead links converts "we could not look" into "we looked
 * and it was no good", and the caller then stamps the row so nothing ever looks
 * again. That is how 9 of 14 hand-sourced Commons photographs were lost on
 * 2026-07-30, judged against the inadequate Trefle images instead.
 *
 * THE THIRD OUTCOME IS THE ASSERTION, and the trap's own record is explicit
 * that having one is not enough on its own: `probeImage` already had a backoff,
 * and the caller still printed the drop and carried on. So what the cases pin
 * down is that `unresolved` stays a SEPARATE list and is never folded into
 * `rejected`. `lib/image-probe.test.ts` covers the layer below — a 429 is
 * retried, it waits seconds rather than milliseconds, and a 404 is not retried
 * at all.
 *
 * The promotion rule is the other argument here: `--verify` is a second
 * QUESTION rather than a second attempt at the same one, which is why it is
 * asserted rather than left to a prompt. If someone later makes `unsure` clear
 * the bar, `mapVerdict`'s cases are what should stop them.
 */

import { describe, expect, it } from 'vitest'
import {
  describeBatchFailure,
  mapVerdict,
  partitionProbes,
} from './pick-plant-images'
import type { ImageCandidate } from '../lib/image-shortlist'
import type { ProbeResult } from '../lib/image-probe'

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

describe('partitionProbes', () => {
  const candidate = (category: string): ImageCandidate =>
    ({
      url: `https://example.test/${category}.jpg`,
      category,
    }) as unknown as ImageCandidate

  const good = { ok: true, width: 1600, height: 1200 } as ProbeResult
  const rateLimited = {
    ok: false,
    reason: 'HTTP 429',
    transient: true,
  } as unknown as ProbeResult
  const deadLink = {
    ok: false,
    reason: 'HTTP 404',
    transient: false,
  } as unknown as ProbeResult

  it('never files a rate-limited probe as a rejection', () => {
    const out = partitionProbes(
      [{ candidate: candidate('wikimedia'), probe: rateLimited }],
      null
    )
    expect(out.unresolved).toEqual(['wikimedia: HTTP 429'])
    expect(out.rejected).toEqual([])
    expect(out.kept).toEqual([])
  })

  it('files a dead link as a rejection, because that IS an answer', () => {
    const out = partitionProbes(
      [{ candidate: candidate('trefle'), probe: deadLink }],
      null
    )
    expect(out.rejected).toEqual(['trefle: HTTP 404'])
    expect(out.unresolved).toEqual([])
  })

  it('keeps the two apart in one batch, which is the whole point', () => {
    const out = partitionProbes(
      [
        { candidate: candidate('wikimedia'), probe: rateLimited },
        { candidate: candidate('trefle'), probe: deadLink },
        { candidate: candidate('curated'), probe: good },
      ],
      null
    )
    expect(out.unresolved).toHaveLength(1)
    expect(out.rejected).toHaveLength(1)
    expect(out.kept).toHaveLength(1)
  })

  it('rejects a photo it COULD measure and found too small', () => {
    const tiny = { ok: true, width: 200, height: 150 } as ProbeResult
    const out = partitionProbes(
      [{ candidate: candidate('trefle'), probe: tiny }],
      null
    )
    expect(out.rejected[0]).toMatch(/too small/)
    expect(out.unresolved).toEqual([])
  })
})
