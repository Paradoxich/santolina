/**
 * The gate on runbook step 6a. The step clears image_checked_at and is an
 * alwaysRun book-end, so the gate is what stops it re-arming judged rows.
 */

import { describe, it, expect } from 'vitest'
import {
  needsWikimediaCandidate,
  parseNameList,
} from './feed-wikimedia-candidates'
import type { ImageCandidate } from '../lib/image-shortlist'

const trefle = (
  category: string,
  url = `https://trefle/${category}`
): ImageCandidate => ({
  url,
  category,
})

const wikimedia: ImageCandidate = {
  url: 'https://commons/p18.jpg',
  category: 'wikimedia',
  source: 'wikimedia',
  attribution: { license: 'CC BY-SA 4.0' } as ImageCandidate['attribution'],
}

describe('the step selects only plants with nothing to judge', () => {
  it('selects a plant with no candidates at all', () => {
    expect(
      needsWikimediaCandidate({ image_url: null, image_candidates: null })
    ).toBe(true)
    expect(
      needsWikimediaCandidate({ image_url: null, image_candidates: [] })
    ).toBe(true)
  })

  it('selects a plant whose candidates the shortlist would never take', () => {
    // `seed` is in neither PRIMARY_CATEGORIES nor FALLBACK_CATEGORIES.
    const row = {
      image_url: null,
      image_candidates: Array.from({ length: 10 }, (_, i) =>
        trefle('seed', `https://trefle/seed-${i}`)
      ),
    }
    expect(needsWikimediaCandidate(row)).toBe(true)
  })

  it('leaves a plant Trefle already covered alone', () => {
    expect(
      needsWikimediaCandidate({
        image_url: null,
        image_candidates: [trefle('flower'), trefle('habit')],
      })
    ).toBe(false)
  })

  it('leaves a plant alone whose only candidate is its incumbent hero', () => {
    // The incumbent always earns a shortlist slot.
    const hero = 'https://trefle/bark-1'
    expect(
      needsWikimediaCandidate({
        image_url: hero,
        image_candidates: [trefle('bark', hero)],
      })
    ).toBe(false)
  })
})

describe('the gate is what makes an alwaysRun step idempotent', () => {
  it('does not select a plant this step has already widened', () => {
    // Must hold even though the shortlist is empty: that is the state a
    // successful run leaves behind.
    expect(
      needsWikimediaCandidate({
        image_url: null,
        image_candidates: [wikimedia],
      })
    ).toBe(false)
  })

  it('does not select it after the pass has picked the Wikimedia photo', () => {
    expect(
      needsWikimediaCandidate({
        image_url: wikimedia.url,
        image_candidates: [wikimedia],
      })
    ).toBe(false)
  })
})

describe('the human path still reads an explicit list', () => {
  it('drops comments and blanks and keeps the order, once each', () => {
    expect(
      parseNameList(
        '# heading\n\nCornelian cherry\nFringed bleeding heart\nCornelian cherry\n'
      )
    ).toEqual(['Cornelian cherry', 'Fringed bleeding heart'])
  })
})
