import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  planPhotoRemoval,
  removeDiaryPhotos,
  toDiaryPhotoPath,
} from './diary-photos'

const PATH = '123e4567-e89b-12d3-a456-426614174000/abc/1720000000000-rose.jpg'

describe('toDiaryPhotoPath', () => {
  it('passes a bare storage path through unchanged', () => {
    expect(toDiaryPhotoPath(PATH)).toBe(PATH)
  })

  it('extracts the path from a legacy full public URL', () => {
    expect(
      toDiaryPhotoPath(
        `https://xyz.supabase.co/storage/v1/object/public/diary-photos/${PATH}`
      )
    ).toBe(PATH)
  })

  it('decodes percent-encoded filenames from legacy URLs', () => {
    expect(
      toDiaryPhotoPath(
        'https://xyz.supabase.co/storage/v1/object/public/diary-photos/g/p/1-my%20rose%20(1).jpg'
      )
    ).toBe('g/p/1-my rose (1).jpg')
  })

  it('falls back to the raw slice when decoding fails', () => {
    expect(
      toDiaryPhotoPath(
        'https://xyz.supabase.co/storage/v1/object/public/diary-photos/g/p/1-100%.jpg'
      )
    ).toBe('g/p/1-100%.jpg')
  })

  it('does not decode a bare path containing a literal percent', () => {
    expect(toDiaryPhotoPath('g/p/1-100%20done.jpg')).toBe(
      'g/p/1-100%20done.jpg'
    )
  })
})

describe('planPhotoRemoval', () => {
  it('normalizes legacy full URLs, so a removal targets the object', () => {
    expect(
      planPhotoRemoval([
        [
          `https://xyz.supabase.co/storage/v1/object/public/diary-photos/${PATH}`,
        ],
      ])
    ).toEqual([PATH])
  })

  it('deduplicates a path reached by both spellings', () => {
    expect(
      planPhotoRemoval([
        [PATH],
        [
          `https://xyz.supabase.co/storage/v1/object/public/diary-photos/${PATH}`,
        ],
      ])
    ).toEqual([PATH])
  })

  it('tolerates null photo_urls', () => {
    expect(planPhotoRemoval([null, [PATH], []])).toEqual([PATH])
  })
})

/** Minimal storage double: `remove` is the only method under test. */
function fakeDb(error: { message: string } | null) {
  return {
    storage: {
      from: () => ({
        remove: async () =>
          error ? { data: null, error } : { data: [], error: null },
      }),
    },
  } as unknown as SupabaseClient
}

describe('removeDiaryPhotos', () => {
  it('returns the failed paths instead of swallowing the error', async () => {
    const outcome = await removeDiaryPhotos(fakeDb({ message: 'nope' }), [
      [PATH],
    ])

    expect(outcome.orphaned).toEqual([PATH])
    expect(outcome.error).toBe('nope')
  })

  it('reports nothing orphaned when Storage accepts the request', async () => {
    const outcome = await removeDiaryPhotos(fakeDb(null), [[PATH]])

    expect(outcome.requested).toEqual([PATH])
    expect(outcome.orphaned).toEqual([])
    expect(outcome.error).toBeUndefined()
  })

  it('skips the round trip when there is nothing to remove', async () => {
    const outcome = await removeDiaryPhotos(fakeDb({ message: 'nope' }), [
      [],
      null,
    ])

    expect(outcome).toEqual({ requested: [], orphaned: [] })
  })
})
