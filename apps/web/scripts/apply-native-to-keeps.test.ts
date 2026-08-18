/**
 * `--review-keep`: the writer `native_to_reviewed_at` did not have.
 *
 * The column gates real behaviour — `shouldStamp()` in cross-check-native-to.ts
 * reads it as the only way a `gross`/`contradicts` row settles without the
 * phrase being rewritten — and until 2026-08-18 the sole write in repo history
 * was migration 20260813110500's backfill. So the column could only drain: the
 * trigger `invalidate_native_to_review` withdraws a stamp on any phrase edit,
 * and nothing could re-assert one.
 *
 * What is pinned here is the DECISION, not the write: which kept rows have
 * earned the stamp. The dangerous half is that a keep is about exact words, so
 * a row whose phrase drifted since the review must not inherit the verdict.
 */

import { describe, it, expect } from 'vitest'
import {
  keepsToStamp,
  reviewTimestampFor,
  type StoredPhrase,
} from './apply-native-to-fixes'

const REVIEWED = reviewTimestampFor('2026-07-30')

const review = [
  {
    verdict: 'keep',
    scientific_name: 'Salvia officinalis',
    common_name: 'sage',
    phrase_at_review: 'the Mediterranean',
    reason: 'WCVP agrees',
  },
  {
    verdict: 'keep',
    scientific_name: 'Thymus vulgaris',
    common_name: 'thyme',
    phrase_at_review: 'western Mediterranean',
    reason: 'WCVP agrees',
  },
  {
    verdict: 'rewritten',
    scientific_name: 'Imperata cylindrica',
    common_name: 'blood grass',
    phrase_at_review: 'eastern and southeastern Asia',
    reason: 'introduced range',
  },
]

const stored = (over: Partial<StoredPhrase>[]): StoredPhrase[] =>
  over.map((o, i) => ({
    id: `id-${i}`,
    scientific_name: null,
    native_to: null,
    native_to_reviewed_at: null,
    ...o,
  }))

describe('keepsToStamp', () => {
  it('stamps a keep whose phrase still reads as reviewed', () => {
    const out = keepsToStamp(
      review,
      stored([
        {
          scientific_name: 'Salvia officinalis',
          native_to: 'the Mediterranean',
        },
        {
          scientific_name: 'Thymus vulgaris',
          native_to: 'western Mediterranean',
        },
      ]),
      REVIEWED
    )
    expect(out.filter((d) => d.kind === 'stamp')).toHaveLength(2)
  })

  it('refuses a row whose phrase changed since the review', () => {
    const out = keepsToStamp(
      review,
      stored([
        {
          scientific_name: 'Salvia officinalis',
          native_to: 'southern Europe and the Mediterranean',
        },
      ]),
      REVIEWED
    )
    const sage = out.find((d) => d.row.scientific_name === 'Salvia officinalis')
    expect(sage?.kind).toBe('stale')
    expect(out.some((d) => d.kind === 'stamp')).toBe(false)
  })

  it('never stamps a row the review rewrote rather than kept', () => {
    const out = keepsToStamp(
      review,
      stored([
        {
          scientific_name: 'Imperata cylindrica',
          native_to: 'eastern and southeastern Asia',
        },
      ]),
      REVIEWED
    )
    expect(
      out.some((d) => d.row.scientific_name === 'Imperata cylindrica')
    ).toBe(false)
  })

  it('does not re-write a stamp the row already carries', () => {
    const out = keepsToStamp(
      review,
      stored([
        {
          scientific_name: 'Salvia officinalis',
          native_to: 'the Mediterranean',
          native_to_reviewed_at: REVIEWED,
        },
      ]),
      REVIEWED
    )
    expect(
      out.find((d) => d.row.scientific_name === 'Salvia officinalis')?.kind
    ).toBe('already')
  })

  it('reports a reviewed row that has left the catalog', () => {
    const out = keepsToStamp(review, stored([]), REVIEWED)
    expect(out.every((d) => d.kind === 'missing')).toBe(true)
  })
})

describe('reviewTimestampFor', () => {
  it('dates the stamp to the review, matching the backfill literal', () => {
    expect(reviewTimestampFor('2026-07-30')).toBe('2026-07-30T12:00:00+00:00')
  })

  it('refuses a review file with no usable date', () => {
    expect(() => reviewTimestampFor('')).toThrow(/reviewed/)
  })
})
