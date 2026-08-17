/**
 * The copy rules, pinned — and in particular their FALSE POSITIVES.
 *
 * Both halves matter equally here. A guard that misses a violation leaves bad
 * copy on the page; a guard that flags correct prose gets ignored, and then it
 * misses violations too. Every "does not flag" case below is a real sentence
 * from the catalog, measured 2026-08-18, that a naive version of the rule
 * flagged: /\bfall\b/ alone raised 4, and lifting the seasonal-care "feed" ban
 * onto descriptive prose raised about 50.
 */

import { describe, it, expect } from 'vitest'
import { checkCopy, isSeasonFall, PROSE_FIELDS } from './copy-rules'

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
    // "Cloud-prune", "golden-bronze", "3-4 years" are everywhere in the
    // catalog and are not what the rule bans.
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
    // 4 of the 40 raw hits. Flagging these would ask an editor to write
    // "as leaves autumn", which is how a guard loses its reader.
    expect(rules(text, 'descriptive')).toEqual([])
  })

  it('leaves an unaccompanied "fall" alone rather than guessing', () => {
    // Deliberate under-report. The missed case is one a reader still catches;
    // a flagged correct sentence is one they learn to skip past.
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
    // THE FINDING THIS TEST RECORDS. The ruling is "fertilize, never feed",
    // and it is about the gardener's action. Ported wholesale onto descriptive
    // prose it flags about 50 correct sentences, most of them in
    // environment_benefits, where "feed" is the only right verb for what a
    // berry does for a bird.
    expect(rules(text, 'descriptive')).toEqual([])
  })

  it('names the bulb case separately, because its fix differs', () => {
    expect(
      rules('Allow foliage to die back to fertilize the bulb.', 'prescriptive')
    ).toEqual(['replenish-not-fertilize'])
  })
})

describe('every prose field is classified', () => {
  it('gives each field a kind, so none is silently unguarded', () => {
    // The hole this module closes is a field nobody checked. An unclassified
    // field would be exactly that, one layer up.
    for (const [field, kind] of Object.entries(PROSE_FIELDS)) {
      expect(['prescriptive', 'descriptive'], field).toContain(kind)
    }
    expect(Object.keys(PROSE_FIELDS).length).toBeGreaterThan(0)
  })

  it('reports every violation in a piece of prose, not just the first', () => {
    // A report that stops at one makes a field look one fix away when it is
    // two, and the second is found only after the first is deployed.
    expect(rules('In fall — feed the plants.', 'prescriptive').sort()).toEqual([
      'autumn-not-fall',
      'fertilize-not-feed',
      'no-dash',
    ])
  })
})
