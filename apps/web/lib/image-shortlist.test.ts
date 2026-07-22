import { describe, expect, it } from 'vitest'
import {
  MAX_FOR_VISION,
  rankAndCap,
  shortlist,
  type ImageCandidate,
  type Measured,
} from './image-shortlist'

function candidates(
  spec: Record<string, number>,
  prefix = ''
): ImageCandidate[] {
  return Object.entries(spec).flatMap(([category, n]) =>
    Array.from({ length: n }, (_, i) => ({
      url: `${prefix}${category}-${i}`,
      category,
    }))
  )
}

function measured(
  entries: [url: string, short: number, incumbent?: boolean][]
): Measured[] {
  return entries.map(([url, short, incumbent = false]) => ({
    url,
    category: 'flower',
    // Landscape, so the short edge is the height.
    width: short * 2,
    height: short,
    isIncumbent: incumbent,
  }))
}

function wikimedia(url: string, short: number): Measured {
  return {
    url,
    category: 'wikimedia',
    width: short * 2,
    height: short,
    isIncumbent: false,
    source: 'wikimedia',
  }
}

describe('shortlist', () => {
  it('interleaves flower and habit rather than exhausting one first', () => {
    const picked = shortlist(candidates({ flower: 5, habit: 5 }), null)
    expect(picked.slice(0, 4).map((c) => c.category)).toEqual([
      'flower',
      'habit',
      'flower',
      'habit',
    ])
  })

  it('ignores detail categories when primaries are plentiful', () => {
    const picked = shortlist(
      candidates({ flower: 5, habit: 5, bark: 5, leaf: 5 }),
      null
    )
    expect(
      picked.every((c) => c.category === 'flower' || c.category === 'habit')
    ).toBe(true)
  })

  it('tops up from fallback categories when primaries are thin', () => {
    // Actaea simplex is the real case: flower shots but no habit shots at all.
    const picked = shortlist(candidates({ flower: 2, leaf: 3, bark: 3 }), null)
    expect(picked.length).toBeGreaterThanOrEqual(4)
    expect(picked.filter((c) => c.category === 'flower')).toHaveLength(2)
  })

  it('puts the incumbent first even when its category is a fallback', () => {
    const all = candidates({ flower: 5, habit: 5, bark: 3 })
    const picked = shortlist(all, 'bark-1')
    expect(picked[0]!.url).toBe('bark-1')
  })

  it('does not duplicate the incumbent when it is already a primary', () => {
    const picked = shortlist(candidates({ flower: 5, habit: 5 }), 'flower-0')
    expect(picked.filter((c) => c.url === 'flower-0')).toHaveLength(1)
  })

  it('handles a plant with no candidates at all', () => {
    expect(shortlist([], null)).toEqual([])
    expect(shortlist([], 'anything')).toEqual([])
  })

  it('ignores an incumbent that is not among the candidates', () => {
    const picked = shortlist(candidates({ flower: 2 }), 'https://gone.example')
    expect(picked.map((c) => c.url)).not.toContain('https://gone.example')
  })

  it('always includes a Wikimedia candidate even when primaries are plentiful', () => {
    const all: ImageCandidate[] = [
      ...candidates({ flower: 5, habit: 5 }),
      { url: 'wm-p18', category: 'wikimedia', source: 'wikimedia' },
    ]
    expect(shortlist(all, null).map((c) => c.url)).toContain('wm-p18')
  })

  it('caps how many Wikimedia candidates it force-includes', () => {
    const all: ImageCandidate[] = [
      ...candidates({ flower: 3 }),
      ...Array.from({ length: 8 }, (_, i) => ({
        url: `wm-${i}`,
        category: 'wikimedia',
        source: 'wikimedia' as const,
      })),
    ]
    const picked = shortlist(all, null)
    expect(picked.filter((c) => c.source === 'wikimedia')).toHaveLength(4)
  })
})

describe('rankAndCap', () => {
  it('ranks by short edge, not total pixel count', () => {
    const { kept } = rankAndCap(
      measured([
        ['wide', 400],
        ['balanced', 900],
      ])
    )
    expect(kept[0]!.url).toBe('balanced')
  })

  it('caps the list and reports what it left behind', () => {
    const { kept, capped } = rankAndCap(
      measured(Array.from({ length: 10 }, (_, i) => [`img-${i}`, 900 - i]))
    )
    expect(kept).toHaveLength(MAX_FOR_VISION)
    expect(capped).toBe(4)
  })

  it('pins a low-resolution incumbent inside the cap', () => {
    // The bug this guards: the incumbent sorts last on resolution, gets sliced
    // off by the cap, and the pass silently replaces it without ever having
    // compared the two.
    const { kept } = rankAndCap(
      measured([
        ['a', 1000],
        ['b', 900],
        ['c', 800],
        ['d', 700],
        ['e', 600],
        ['f', 500],
        ['g', 400],
        ['incumbent', 300, true],
      ])
    )
    expect(kept).toHaveLength(MAX_FOR_VISION)
    expect(kept.map((k) => k.url)).toContain('incumbent')
  })

  it('leaves a high-resolution incumbent where it ranked', () => {
    const { kept } = rankAndCap(
      measured([
        ['incumbent', 1000, true],
        ['b', 900],
        ['c', 800],
      ])
    )
    expect(kept[0]!.url).toBe('incumbent')
  })

  it('pins a lower-resolution Wikimedia photo inside the cap', () => {
    // A curated Wikimedia image behind a burst of sharp Trefle snapshots must
    // still reach the vision call, the same guarantee the incumbent gets.
    const { kept } = rankAndCap([
      ...measured([
        ['a', 1000],
        ['b', 900],
        ['c', 800],
        ['d', 700],
        ['e', 600],
        ['f', 500],
      ]),
      wikimedia('wm', 400),
    ])
    expect(kept).toHaveLength(MAX_FOR_VISION)
    expect(kept.map((k) => k.url)).toContain('wm')
  })

  it('keeps the incumbent and a Wikimedia photo together under the cap', () => {
    const { kept } = rankAndCap([
      ...measured([
        ['a', 1000],
        ['b', 900],
        ['c', 800],
        ['d', 700],
        ['e', 600],
        ['incumbent', 200, true],
      ]),
      wikimedia('wm', 150),
    ])
    expect(kept).toHaveLength(MAX_FOR_VISION)
    expect(kept.map((k) => k.url)).toEqual(
      expect.arrayContaining(['incumbent', 'wm'])
    )
  })

  it('does not lose a candidate while pinning', () => {
    const input = measured([
      ['a', 1000],
      ['b', 900],
      ['c', 800],
      ['d', 700],
      ['e', 600],
      ['f', 500],
      ['incumbent', 100, true],
    ])
    const { kept, capped } = rankAndCap(input)
    expect(new Set(kept.map((k) => k.url)).size).toBe(kept.length)
    expect(kept.length + capped).toBe(input.length)
  })
})
