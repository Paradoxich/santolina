/**
 * The bloom-prose detector, and the false positives it was tuned against.
 * Every "does not flag" sentence is real catalog prose that an earlier setting
 * flagged: a naive flower-word-near-season-word match hits 71% of the catalog,
 * and each class below cost a measured iteration to remove.
 */

import { describe, it, expect } from 'vitest'
import {
  assertedBloomSeasons,
  contradictions,
  seasonOfMonth,
  seasonsOfMonths,
} from './bloom-prose'

describe('an assertion of flowering, with a season', () => {
  it.each([
    ['Flowering continues into early autumn.', 'autumn'],
    ['The first flowers begin to open from late August onwards.', 'summer'],
    ['Elegant blooms appear from late winter through early spring.', 'winter'],
    ['Produces goblet-shaped flowers in early autumn.', 'autumn'],
  ])('reads %j as %s', (text, season) => {
    expect(assertedBloomSeasons(text)).toContain(season)
  })
})

describe('prose that names a season without claiming flowering', () => {
  it.each([
    // Aftermath: the flowers are over.
    'The blooms are followed by seedheads that persist into autumn.',
    'Old flower heads may persist and provide winter interest.',
    'Flowers fade and seed heads develop through autumn.',
    // Anticipation: buds and stalks are not flowers.
    'Flower buds begin to form at stem tips by late spring.',
    'Flower buds begin to emerge from the soil in late August.',
    // A time reference, not a claim: the subject is the foliage.
    'The grassy foliage emerges during or after flowering and persists through winter into spring.',
    'The strap-like foliage emerges after flowering and persists through winter before dying back in late spring.',
    // Persistence: the plume is still standing, the plant is not flowering.
    // All six were reported by --all on 2026-08-18; correcting the scalar as
    // the guard advised would have put winter in a summer grass's bloom.
    'Bears airy, feathery flower plumes in summer that catch the light beautifully and persist into winter.',
    'In summer, it produces feathery flower plumes that rise well above the foliage and persist through winter, turning golden as they age.',
    'A rounded, bushy shrub grown for its dramatic smoke-like flower plumes that appear in summer and persist into autumn.',
    'Cone-shaped white flower clusters appear in early summer, aging to pink and tan and persisting through winter.',
    // The season belongs to a clause about the leaves, not the flowers.
    'The rosettes of fresh green leaves emerge in spring before the impressive flower spikes appear.',
    // A stem developing is not a flower opening.
    'Green clumps remain attractive with fine-textured foliage. Flower stems begin to develop in late summer.',
    // Hedged: conditional on a mild year or a sheltered spot.
    'In milder areas, early flowers may begin to open in winter.',
    'Occasional flowers may appear through winter.',
  ])('does not flag %j', (text) => {
    expect(assertedBloomSeasons(text)).toEqual([])
  })

  it('does not read a season in the plant own name as a claim', () => {
    // "Winter savory", "Autumn sage": the season is part of the name.
    expect(
      assertedBloomSeasons('Autumn sage produces flowers in summer.', [
        'autumn',
        'sage',
      ])
    ).toEqual(['summer'])
  })
})

describe('contradiction against the stored months', () => {
  it('flags a season the scalar does not cover', () => {
    // Garden thyme: bloom_months [5,6,7], prose says flowering runs on.
    expect(
      contradictions('Flowering continues into early autumn.', [5, 6, 7])
    ).toEqual(['autumn'])
  })

  it('says nothing when the scalar already covers the season', () => {
    expect(
      contradictions('Flowering continues into early autumn.', [8, 9, 10])
    ).toEqual([])
  })

  it('says nothing when there are no stored months to contradict', () => {
    // A foliage plant with no bloom_months is not a disagreement.
    expect(contradictions('Flowers appear in spring.', [])).toEqual([])
  })
})

describe('the month to season mapping', () => {
  it('puts December with the winter months', () => {
    expect(seasonOfMonth(12)).toBe('winter')
    expect(seasonOfMonth(1)).toBe('winter')
  })

  it('collapses a month list to its distinct seasons', () => {
    expect(seasonsOfMonths([6, 7, 8, 9]).sort()).toEqual(['autumn', 'summer'])
  })
})
