import { describe, expect, it } from 'vitest'
import { getBloomStatus, getStageNote, toDisplayStatus } from './bloom-status'

// Months in the Date constructor are 0-indexed; these helpers keep the tests
// readable in 1-indexed calendar months, matching bloom_months.
const inMonth = (month: number) => new Date(2026, month - 1, 15)

describe('getBloomStatus', () => {
  it('handles a normal contiguous window', () => {
    const window = [5, 6, 7]
    expect(getBloomStatus(window, inMonth(6))).toBe('blooming')
    expect(getBloomStatus(window, inMonth(4))).toBe('pre-bloom')
    expect(getBloomStatus(window, inMonth(8))).toBe('done')
    expect(getBloomStatus(window, inMonth(1))).toBe('resting')
    expect(getBloomStatus(window, inMonth(11))).toBe('resting')
  })

  it('treats a December-wrapping window as one circular window', () => {
    // Winter jasmine: December through March.
    const window = [12, 1, 2, 3]
    expect(getBloomStatus(window, inMonth(1))).toBe('blooming')
    expect(getBloomStatus(window, inMonth(12))).toBe('blooming')
    expect(getBloomStatus(window, inMonth(11))).toBe('pre-bloom')
    expect(getBloomStatus(window, inMonth(4))).toBe('done')
    expect(getBloomStatus(window, inMonth(8))).toBe('resting')
  })

  it('handles a wrapping window regardless of array order', () => {
    expect(getBloomStatus([1, 2, 12], inMonth(11))).toBe('pre-bloom')
    expect(getBloomStatus([2, 12, 1], inMonth(3))).toBe('done')
  })

  it('is always blooming for an all-year window', () => {
    const allYear = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    for (let m = 1; m <= 12; m++) {
      expect(getBloomStatus(allYear, inMonth(m))).toBe('blooming')
    }
  })

  it('handles a single-month window', () => {
    expect(getBloomStatus([6], inMonth(5))).toBe('pre-bloom')
    expect(getBloomStatus([6], inMonth(6))).toBe('blooming')
    expect(getBloomStatus([6], inMonth(7))).toBe('done')
  })

  it('is evergreen with no bloom months', () => {
    expect(getBloomStatus([], inMonth(8))).toBe('evergreen')
  })
})

describe('getStageNote', () => {
  it('points a resting winter bloomer at its real start month, not January', () => {
    // The December-wrap bug: min([12,1,2,3]) is 1, so every wrapping plant
    // said "Blooms again in January". The window starts in December.
    expect(getStageNote([12, 1, 2, 3], inMonth(8))).toBe(
      'Blooms again in December'
    )
    // Florist's cyclamen: October through March, resting in August.
    expect(getStageNote([10, 11, 12, 1, 2, 3], inMonth(8))).toBe(
      'Blooms again in October'
    )
  })

  it('keeps the normal-window resting lookahead', () => {
    expect(getStageNote([5, 6, 7], inMonth(1))).toBe('Blooms again in May')
  })

  it('positions within a wrapping window', () => {
    const window = [12, 1, 2, 3]
    expect(getStageNote(window, inMonth(12))).toBe('First flowers opening')
    expect(getStageNote(window, inMonth(3))).toBe('Bloom ending soon')
    expect(getStageNote(window, inMonth(1))).toBe('Peak flowering now')
  })

  it('positions within a normal window', () => {
    const window = [5, 6, 7]
    expect(getStageNote(window, inMonth(5))).toBe('First flowers opening')
    expect(getStageNote(window, inMonth(7))).toBe('Bloom ending soon')
    expect(getStageNote(window, inMonth(6))).toBe('Peak flowering now')
  })

  it('never pins an all-year bloomer to a window position', () => {
    const allYear = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    expect(getStageNote(allYear, inMonth(8))).toBe('Flowering all year')
  })

  it('always returns a non-empty string', () => {
    const windows = [[], [6], [12, 1], [5, 6, 7], [9, 10, 11, 12, 1, 2, 3, 4]]
    for (const w of windows) {
      for (let m = 1; m <= 12; m++) {
        expect(getStageNote(w, inMonth(m)).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('toDisplayStatus', () => {
  it('folds done into resting and passes everything else through', () => {
    expect(toDisplayStatus('done')).toBe('resting')
    expect(toDisplayStatus('blooming')).toBe('blooming')
    expect(toDisplayStatus('evergreen')).toBe('evergreen')
  })
})
