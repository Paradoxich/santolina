import { describe, expect, it } from 'vitest'
import { toDiaryPhotoPath } from './diary-photos'

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
