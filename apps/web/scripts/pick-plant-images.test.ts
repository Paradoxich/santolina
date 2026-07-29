import { describe, expect, it } from 'vitest'
import { mapVerdict } from './pick-plant-images'

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
