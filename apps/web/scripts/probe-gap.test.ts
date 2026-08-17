/**
 * The round-9 kill rule, pinned.
 *
 * WHY THIS EXISTS. "A theme whose signature palette the catalog already holds
 * at >=70% is dead" governed rounds 9 through 12 as a sentence in four
 * different script headers. A sentence cannot be off by one, cannot be
 * accidentally inverted, and cannot tell you it stopped being applied — which
 * is the whole argument for `probe-gap.ts` existing as committed code. The rule
 * being executable and the rule being tested are not the same claim, so the
 * boundary is asserted here rather than trusted.
 *
 * `probeThemes` takes `holds` as a parameter precisely so this file needs no
 * database.
 */

import { describe, expect, it } from 'vitest'
import { probeThemes, type ThemeProbeResult } from './probe-gap'
import type { StyleTag } from '../lib/style-tags'

/** A theme of `size` candidates, of which the first `heldCount` are held. */
function themeWhere(size: number, heldCount: number) {
  const candidates = Array.from({ length: size }, (_, i) => `Genus sp${i}`)
  const held = new Set(candidates.slice(0, heldCount))
  const theme = {
    style: 'japanese' as StyleTag,
    note: 'fixture',
    candidates,
  }
  return { theme, holds: (name: string) => held.has(name) }
}

function probeOne(size: number, heldCount: number): ThemeProbeResult {
  const { theme, holds } = themeWhere(size, heldCount)
  return probeThemes([theme], holds)[0]
}

describe('the round-9 kill rule', () => {
  it('kills a theme exactly AT the threshold, not merely above it', () => {
    // 7 of 10 is 70%. The rule is ">=", and an off-by-one here would revive
    // every theme rounds 9-12 killed on precisely this number.
    expect(probeOne(10, 7).killed).toBe(true)
  })

  it('spares a theme one candidate below the threshold', () => {
    expect(probeOne(10, 6).killed).toBe(false)
  })

  it('kills the round-12 small-space result and spares the damp one', () => {
    // The two real measurements from round 12's header, as a regression on the
    // rule's direction: 84% held killed small-space (the LEADING hypothesis),
    // 33% held is what made damp ground the round. An inverted comparison
    // passes every synthetic case above and fails both of these.
    expect(probeOne(58, 49).killed).toBe(true) // 84%
    expect(probeOne(63, 21).killed).toBe(false) // 33%
  })
})

describe('what the probe reports', () => {
  it('partitions the palette into held and absent with nothing lost', () => {
    const r = probeOne(32, 15)
    expect(r.held).toHaveLength(15)
    expect(r.absent).toHaveLength(17)
    expect(r.held.length + r.absent.length).toBe(r.total)
  })

  it('holds no candidate in both piles', () => {
    const r = probeOne(20, 8)
    expect(r.held.filter((h) => r.absent.includes(h))).toEqual([])
  })

  it('reports an empty catalog as a surviving theme, not an error', () => {
    // The degenerate case a `heldCount / total` division invites. A theme
    // nothing is held for is the strongest possible gap, so it must survive.
    const r = probeOne(12, 0)
    expect(r.heldShare).toBe(0)
    expect(r.killed).toBe(false)
    expect(r.absent).toHaveLength(12)
  })

  it('flags a cultivar-bound style regardless of how empty it looks', () => {
    // gothic reads as the emptiest style in the vocabulary and cannot be filled
    // by any species-level round. The percentage must not be the only signal.
    const candidates = ['Genus a', 'Genus b']
    const [r] = probeThemes(
      [{ style: 'gothic' as StyleTag, note: 'fixture', candidates }],
      () => false
    )
    expect(r.killed).toBe(false)
    expect(r.cultivarBound).not.toBeNull()
  })

  it('leaves a fillable style unflagged', () => {
    expect(probeOne(10, 1).cultivarBound).toBeNull()
  })
})
