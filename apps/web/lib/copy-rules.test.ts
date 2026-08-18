/**
 * The copy rules, and in particular the sentences a naive version of each rule
 * flagged wrongly. Every "does not flag" case is real catalog prose.
 */

import { describe, it, expect } from 'vitest'
import {
  checkCopy,
  isSeasonFall,
  fixSeasonFall,
  proseOf,
  PROSE_COLUMNS,
  PROSE_FIELDS,
} from './copy-rules'
import { VERIFY_PROJECTION } from '../scripts/verify-round'

const rules = (text: string, kind: Parameters<typeof checkCopy>[1]) =>
  checkCopy(text, kind).map((v) => v.rule)

describe('no-dash binds every reader-facing field', () => {
  it('flags an em dash in descriptive prose', () => {
    expect(
      rules('Minimal pruning required — remove dead wood.', 'descriptive')
    ).toEqual(['no-dash'])
  })

  it('flags an en dash, and one per occurrence', () => {
    expect(
      rules('Yellowing – alkaline soil – apply compost.', 'prescriptive')
    ).toEqual(['no-dash', 'no-dash'])
  })

  it('leaves a hyphen alone', () => {
    expect(
      rules(
        'Divide clumps every 3-4 years; golden-bronze foliage.',
        'descriptive'
      )
    ).toEqual([])
  })
})

describe('autumn-not-fall reads the company the word keeps', () => {
  it.each([
    'Blooms from late summer into fall.',
    'The leaves turn burgundy in fall.',
    'Divide clumps in spring or fall to maintain vigor.',
    'Cut back stems to ground level in late fall.',
    'Offers structural interest through the fall.',
    'One of the best fall color displays of any perennial.',
    'A flush of new blooms in cooler fall weather.',
  ])('flags the season in %j', (text) => {
    expect(rules(text, 'descriptive')).toEqual(['autumn-not-fall'])
  })

  it.each([
    'The bark becomes prominent as leaves fall.',
    'Leaves yellow and drop as temperatures fall.',
    'Dried flower heads add interest as leaves fall.',
  ])('does not flag the verb in %j', (text) => {
    expect(rules(text, 'descriptive')).toEqual([])
  })

  it('leaves an unaccompanied "fall" alone rather than guessing', () => {
    expect(isSeasonFall('Petals fall quickly.', 7)).toBe(false)
  })
})

describe('fertilize-not-feed is a rule about the gardener, so it binds one kind', () => {
  it('flags a feeding instruction in prescriptive prose', () => {
    expect(
      rules(
        'Feed regularly with citrus fertilizer during spring.',
        'prescriptive'
      )
    ).toEqual(['fertilize-not-feed'])
  })

  it.each([
    'Small fruits feed birds in autumn and winter.',
    'Japanese beetles may feed on foliage in some regions.',
    'Slugs and snails feeding on ripe fruit.',
    'Flowers that attract nectar-feeding birds.',
  ])('does not flag wildlife feeding in descriptive prose: %j', (text) => {
    expect(rules(text, 'descriptive')).toEqual([])
  })

  it('names the bulb case separately, because its fix differs', () => {
    expect(
      rules('Allow foliage to die back to fertilize the bulb.', 'prescriptive')
    ).toEqual(['replenish-not-fertilize'])
  })

  // The report said "must be fertilize" for all 36 hits on 2026-08-18. Taking
  // that advice on a bulb sentence produces "fertilize the bulb", which
  // replenish-not-fertilize then flags: the fix tripped its own sibling rule.
  it.each([
    'Allow foliage to die back naturally after flowering to feed the bulbs.',
    'Let the leaves die back to feed the tuber for next year.',
    'Allow foliage to die back naturally to feed the rhizome.',
  ])(
    'asks for "replenish", not "fertilize", when a storage organ is fed: %j',
    (text) => {
      expect(rules(text, 'prescriptive')).toEqual(['replenish-not-feed'])
    }
  )

  // Real Foxglove maintenance_notes. kind is per column, so a descriptive
  // clause at the end of a prescriptive field was flagged, and the mechanical
  // fix turned it into "fertilize birds".
  it('does not flag wildlife feeding inside a prescriptive field', () => {
    expect(
      rules(
        'Allow some seed heads to remain for self-sowing and to feed birds.',
        'prescriptive'
      )
    ).toEqual([])
  })

  it('still asks for "fertilize" when the gardener is the one feeding', () => {
    expect(
      rules('Feed monthly through the growing season.', 'prescriptive')
    ).toEqual(['fertilize-not-feed'])
  })
})

describe('the fix rewrites exactly what the detector flags', () => {
  it.each([
    [
      'Blooms from late summer into fall.',
      'Blooms from late summer into autumn.',
    ],
    [
      'In fall, the foliage turns soft yellow.',
      'In autumn, the foliage turns soft yellow.',
    ],
    ['Divide in spring or fall.', 'Divide in spring or autumn.'],
    ['The best fall color displays.', 'The best autumn color displays.'],
  ])('rewrites %j', (before, after) => {
    expect(fixSeasonFall(before)).toBe(after)
  })

  it('leaves the verb untouched, in the same sentence as a season it fixes', () => {
    expect(fixSeasonFall('In fall the bark shows as leaves fall.')).toBe(
      'In autumn the bark shows as leaves fall.'
    )
  })

  it('keeps the capitalisation it found', () => {
    expect(fixSeasonFall('Fall color is reliable.')).toBe(
      'Autumn color is reliable.'
    )
  })

  it('is idempotent, and clean text is returned unchanged', () => {
    const clean = 'Blooms into autumn as leaves fall.'
    expect(fixSeasonFall(clean)).toBe(clean)
    expect(fixSeasonFall(fixSeasonFall('Blooms into fall.'))).toBe(
      'Blooms into autumn.'
    )
  })

  it('leaves nothing behind for the detector to find', () => {
    const samples = [
      'Blooms from late summer into fall.',
      'In fall, the foliage turns.',
      'The best fall color displays.',
      'In fall the bark shows as leaves fall.',
    ]
    for (const s of samples) {
      expect(checkCopy(fixSeasonFall(s), 'descriptive')).toEqual([])
    }
  })
})

describe('the round check fetches every field it judges', () => {
  it('selects every prose column in verify-round', () => {
    const fetched = new Set(VERIFY_PROJECTION.split(',').map((c) => c.trim()))
    const missing = PROSE_COLUMNS.filter((c) => !fetched.has(c))
    expect(
      missing,
      'verify-round judges these prose columns without fetching them, so they read undefined and pass'
    ).toEqual([])
  })
})

describe('a row is flattened into every piece of prose it holds', () => {
  it('labels a jsonb stage with its key and carries the field kind', () => {
    const found = proseOf({
      description: 'In fall the leaves turn.',
      seasonal_care: { autumn: 'Feed the roses.', winter: null },
      maintenance_notes: '   ',
    })
    expect(found.map((f) => f.field)).toEqual([
      'description',
      'seasonal_care.autumn',
    ])
    expect(found.map((f) => f.kind)).toEqual(['descriptive', 'prescriptive'])
  })
})

describe('every prose field is classified', () => {
  it('gives each field a kind, so none is silently unguarded', () => {
    for (const [field, kind] of Object.entries(PROSE_FIELDS)) {
      expect(['prescriptive', 'descriptive'], field).toContain(kind)
    }
    expect(Object.keys(PROSE_FIELDS).length).toBeGreaterThan(0)
  })

  it('reports every violation in a piece of prose, not just the first', () => {
    expect(rules('In fall — feed the plants.', 'prescriptive').sort()).toEqual([
      'autumn-not-fall',
      'fertilize-not-feed',
      'no-dash',
    ])
  })
})
