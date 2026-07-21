import { describe, expect, it } from 'vitest'
import {
  creditLine,
  isCommercialSafeLicense,
  type ImageAttribution,
} from './image-attribution'

const attr = (over: Partial<ImageAttribution>): ImageAttribution => ({
  artist: null,
  license: null,
  license_url: null,
  source_url: null,
  ...over,
})

describe('creditLine', () => {
  it('formats artist and licence together', () => {
    expect(
      creditLine(attr({ artist: 'HitroMilanese', license: 'CC BY-SA 3.0' }))
    ).toBe('Photo: HitroMilanese, CC BY-SA 3.0')
  })

  it('renders whichever of artist or licence is present', () => {
    expect(creditLine(attr({ artist: 'Jane Doe' }))).toBe('Photo: Jane Doe')
    expect(creditLine(attr({ license: 'CC0' }))).toBe('Photo: CC0')
  })

  it('returns null when there is nothing to credit', () => {
    // A Trefle/PlantNet pick has null attribution — the drawer skips the line.
    expect(creditLine(null)).toBeNull()
    expect(creditLine(undefined)).toBeNull()
    expect(creditLine(attr({}))).toBeNull()
    expect(creditLine(attr({ artist: '  ' }))).toBeNull()
  })
})

describe('isCommercialSafeLicense', () => {
  it('accepts the permissive commercial-OK licences', () => {
    for (const l of [
      'CC0',
      'Public domain',
      'CC BY 2.0',
      'CC BY 4.0',
      'CC BY-SA 3.0',
      'CC BY-SA 4.0',
    ]) {
      expect(isCommercialSafeLicense(l), l).toBe(true)
    }
  })

  it('rejects NC, ND, GFDL, and unknown licences', () => {
    for (const l of [
      'CC BY-NC 4.0',
      'CC BY-NC-SA 3.0',
      'CC BY-ND 4.0',
      'GFDL 1.2',
      'GPL',
      null,
      '',
    ]) {
      expect(isCommercialSafeLicense(l), String(l)).toBe(false)
    }
  })
})
