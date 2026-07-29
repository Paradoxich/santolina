/**
 * Unit tests for the decision half of `plants-write.ts`.
 *
 * These run in CI, where the trigger contract test cannot: they need no
 * database. The split is deliberate — every judgment this module makes is a
 * pure function of a patch and a set of stamps, so the part that decides is
 * testable everywhere and the part that writes is thin.
 *
 * What the trigger itself DOES is asserted in `scripts/test-editorial-trigger.ts`
 * against real Postgres. Neither file is sufficient alone: this one would
 * happily agree with itself about a trigger that had changed underneath it.
 */

import { describe, it, expect } from 'vitest'
import {
  criteriaTouchedBy,
  isCurated,
  verdictToRestore,
  CRITERION_FIELDS,
  CRITERION_STAMP,
} from './plants-write'

const T = '2026-01-01T00:00:00+00:00'

const noStamps = {
  editorial_image_at: null,
  editorial_description_at: null,
  editorial_tags_at: null,
}

const allStamps = {
  editorial_image_at: T,
  editorial_description_at: T,
  editorial_tags_at: T,
}

describe('criteriaTouchedBy', () => {
  it('names no criterion for a patch that touches none', () => {
    expect(criteriaTouchedBy({ bloom_color: ['white'] })).toEqual([])
  })

  it('names the image criterion for either of its columns', () => {
    expect(criteriaTouchedBy({ image_url_curated: 'x' })).toEqual(['image'])
    expect(criteriaTouchedBy({ image_pick_confidence: 'high' })).toEqual([
      'image',
    ])
  })

  it('names the tags criterion for either of its columns', () => {
    expect(criteriaTouchedBy({ style_tags: [] })).toEqual(['tags'])
    expect(criteriaTouchedBy({ space_types: [] })).toEqual(['tags'])
  })

  it('names every criterion a patch spans', () => {
    expect(
      criteriaTouchedBy({ description: 'x', style_tags: [], bloom_color: [] })
    ).toEqual(['description', 'tags'])
  })

  // Presence, not equality. The trigger compares values and this cannot, so it
  // errs toward "might be re-opened" — the safe side when the answer decides
  // whether a stamp gets written.
  it('counts a column present with an unchanged value', () => {
    expect(criteriaTouchedBy({ description: undefined })).toEqual([
      'description',
    ])
  })

  it('covers every criterion in the map', () => {
    for (const [criterion, fields] of Object.entries(CRITERION_FIELDS)) {
      for (const field of fields) {
        expect(criteriaTouchedBy({ [field]: 'v' })).toEqual([criterion])
      }
    }
  })
})

describe('isCurated', () => {
  it('is false when nothing is cleared', () => {
    expect(isCurated(noStamps)).toBe(false)
  })

  it('is true only when all three are cleared', () => {
    expect(isCurated(allStamps)).toBe(true)
  })

  // The round 8 shape: held on the image alone. Confirming the photograph is
  // what makes this row curated, and nothing recomputed that before.
  it('is false while any single criterion is outstanding', () => {
    for (const stamp of Object.values(CRITERION_STAMP)) {
      expect(isCurated({ ...allStamps, [stamp]: null })).toBe(false)
    }
  })
})

describe('verdictToRestore', () => {
  const signedOff = {
    ...allStamps,
    is_curated: true,
    editorial_checked_at: T,
  }

  it('restores the stamp of each re-opened criterion', () => {
    expect(verdictToRestore(signedOff, ['image'])).toEqual({
      editorial_image_at: T,
      editorial_checked_at: T,
      is_curated: true,
    })
  })

  it('restores only what the change re-opened', () => {
    const restore = verdictToRestore(signedOff, ['image'])
    expect(restore).not.toHaveProperty('editorial_description_at')
    expect(restore).not.toHaveProperty('editorial_tags_at')
  })

  it('restores nothing when the change re-opened nothing', () => {
    expect(verdictToRestore(signedOff, [])).toBeNull()
  })

  // A row that was never judged has no verdict to preserve, and asserting one
  // would be inventing an approval — the exact thing the trigger exists to
  // prevent.
  it('restores nothing when the criterion had no stamp', () => {
    const held = {
      ...noStamps,
      is_curated: false,
      editorial_checked_at: null,
    }
    expect(verdictToRestore(held, ['image'])).toBeNull()
  })

  it('does not re-assert is_curated when the row was not curated', () => {
    const partial = {
      ...allStamps,
      editorial_description_at: null,
      is_curated: false,
      editorial_checked_at: T,
    }
    const restore = verdictToRestore(partial, ['image'])
    expect(restore).toEqual({
      editorial_image_at: T,
      editorial_checked_at: T,
    })
    expect(restore).not.toHaveProperty('is_curated')
  })
})
