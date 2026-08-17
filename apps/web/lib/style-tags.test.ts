/**
 * The style vocabulary and the filter derived from it.
 *
 * WHY THESE EXIST. Before the vocabulary expansion, STYLE_OPTIONS was a
 * hand-written list of six that had to be kept in sync with STYLE_TAGS by
 * someone remembering to — a sync obligation stated in a file header and
 * enforced nowhere. It is now derived from live counts, so the thing worth
 * pinning is that the derivation holds: every offered style is a real slug,
 * carries a display name, and cleared the floor.
 *
 * These are NOT a check on the counts themselves — those are generated from
 * the database by catalog-state.ts and held current by
 * `pnpm catalog:state:check`'s git diff, which is the right instrument for a
 * value that moves every round.
 */

import { describe, it, expect } from 'vitest'
import {
  STYLE_TAGS,
  STYLE_DISPLAY_NAMES,
  CONFUSABLE_STYLE_PAIRS,
  type StyleTag,
} from './style-tags'
import { STYLE_OPTIONS, STYLE_FILTER_FLOOR } from './explore-filters'
import { stylePlantCounts } from './style-availability.generated'

describe('the style vocabulary', () => {
  it('has no duplicate slugs', () => {
    expect(new Set(STYLE_TAGS).size).toBe(STYLE_TAGS.length)
  })

  it('gives every slug a display name', () => {
    for (const tag of STYLE_TAGS) {
      expect(
        STYLE_DISPLAY_NAMES[tag],
        `no display name for "${tag}"`
      ).toBeTruthy()
    }
  })

  it('keeps em and en dashes out of display names', () => {
    // Standing UI copy rule: no em or en dashes in anything a reader sees.
    for (const tag of STYLE_TAGS) {
      expect(STYLE_DISPLAY_NAMES[tag]).not.toMatch(/[—–]/)
    }
  })

  it('counts every slug, including the styles no plant holds yet', () => {
    // A missing key would be indistinguishable from a deleted style, and the
    // filter derivation would throw rather than simply omit it.
    for (const tag of STYLE_TAGS) {
      expect(stylePlantCounts[tag], `no count for "${tag}"`).toBeTypeOf(
        'number'
      )
    }
  })

  it('names only real slugs in the confusable pairs', () => {
    for (const [a, b] of CONFUSABLE_STYLE_PAIRS) {
      expect(STYLE_TAGS).toContain(a)
      expect(STYLE_TAGS).toContain(b)
      expect(a).not.toBe(b)
    }
  })
})

describe('the derived filter', () => {
  it('offers exactly the styles that cleared the floor', () => {
    const expected = STYLE_TAGS.filter(
      (t) => stylePlantCounts[t] >= STYLE_FILTER_FLOOR
    )
    expect(STYLE_OPTIONS.map((o) => o.value).sort()).toEqual(
      [...expected].sort()
    )
  })

  it('never offers a style below the floor', () => {
    // The failure this prevents is a tile that returns a near-empty page.
    for (const o of STYLE_OPTIONS) {
      expect(
        stylePlantCounts[o.value as StyleTag],
        `"${o.value}" is offered but below the floor`
      ).toBeGreaterThanOrEqual(STYLE_FILTER_FLOOR)
    }
  })

  it('labels each option with its display name, never the raw slug', () => {
    for (const o of STYLE_OPTIONS) {
      expect(o.label).toBe(STYLE_DISPLAY_NAMES[o.value as StyleTag])
    }
  })

  it('orders options by population, commonest first', () => {
    const counts = STYLE_OPTIONS.map(
      (o) => stylePlantCounts[o.value as StyleTag]
    )
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })
})
