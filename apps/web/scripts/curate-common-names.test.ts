/**
 * The common-name pass, at the three seams that decide what it writes.
 *
 * WHY THIS PASS EXISTS AT ALL, since the assertions only make sense against it:
 * `common_name` came straight from Trefle, a botanical source, and nothing
 * between Trefle and the catalog ever judged it. Three consecutive rounds paid
 * for that with a hand-written correction table (`fix-round8-names.ts`,
 * `fix-round11-names.ts`, `fix-round12-names.ts`), and round 7 paid before the
 * pattern had a name.
 *
 * THE INTRA-BATCH CASE IS THE ONE WORTH READING. Round 12's collision was not
 * with the catalog — Trefle returned "Japanese iris" for BOTH Iris ensata and
 * Iris laevigata, so the seed batch collided with ITSELF. The catalog-side
 * check cannot see that, because during a round neither plant is in the catalog
 * when the other is judged. It is why the batch is judged in one call and why
 * `intraBatchCollisions` exists beside `findCollisions` rather than inside it.
 *
 * The parser is asserted on its REFUSALS as much as its successes. A rename
 * with no target, or a verdict this pass does not understand, must throw rather
 * than be coerced into something writable — a name pass that guesses is how a
 * collision gets created by the pass that exists to remove them.
 */

import { describe, expect, it } from 'vitest'

import {
  intraBatchCollisions,
  isBinomialFallback,
  parseVerdicts,
  type NameVerdict,
} from './curate-common-names'

const rename = (scientific_name: string, to: string): NameVerdict => ({
  scientific_name,
  verdict: 'rename',
  to,
  why: 'test',
})

describe('isBinomialFallback', () => {
  it('catches the Trefle fallback, which is the most visible defect', () => {
    // lib/trefle.ts: `detail.common_name ?? detail.scientific_name`. This is
    // the row that reads "Rodgersia pinnata" on an Explore card.
    expect(
      isBinomialFallback({
        common_name: 'Rodgersia pinnata',
        scientific_name: 'Rodgersia pinnata',
      })
    ).toBe(true)
  })

  it('ignores case and spacing, which the fallback does not preserve', () => {
    expect(
      isBinomialFallback({
        common_name: 'rodgersia  pinnata',
        scientific_name: 'Rodgersia pinnata',
      })
    ).toBe(true)
  })

  it('leaves a real common name alone', () => {
    expect(
      isBinomialFallback({
        common_name: 'Marsh marigold',
        scientific_name: 'Caltha palustris',
      })
    ).toBe(false)
  })

  it('is false when there is no scientific name to compare against', () => {
    expect(
      isBinomialFallback({ common_name: 'Anything', scientific_name: null })
    ).toBe(false)
  })
})

describe('intraBatchCollisions (the round-12 iris case)', () => {
  it('catches two plants in one batch given the same name', () => {
    const collisions = intraBatchCollisions([
      rename('Iris ensata', 'Japanese iris'),
      rename('Iris laevigata', 'Japanese iris'),
      rename('Caltha palustris', 'Marsh marigold'),
    ])
    expect([...collisions.keys()]).toEqual(['japanese iris'])
    expect(collisions.get('japanese iris')).toEqual([
      'Iris ensata',
      'Iris laevigata',
    ])
  })

  it('compares case-insensitively, since a display name is not a key', () => {
    const collisions = intraBatchCollisions([
      rename('Iris ensata', 'Japanese iris'),
      rename('Iris laevigata', 'japanese  IRIS'.replace(/\s+/g, ' ')),
    ])
    expect(collisions.size).toBe(1)
  })

  it('ignores kept rows — only a proposed name can collide', () => {
    const collisions = intraBatchCollisions([
      { scientific_name: 'Iris ensata', verdict: 'keep', why: 'fine' },
      { scientific_name: 'Iris laevigata', verdict: 'keep', why: 'fine' },
    ])
    expect(collisions.size).toBe(0)
  })

  it('finds nothing in a batch of distinct names', () => {
    expect(
      intraBatchCollisions([
        rename('Caltha palustris', 'Marsh marigold'),
        rename('Myosotis scorpioides', 'Water forget-me-not'),
      ]).size
    ).toBe(0)
  })
})

describe('parseVerdicts', () => {
  it('reads a plain array', () => {
    const out = parseVerdicts(
      '[{"scientific_name":"Caltha palustris","verdict":"rename","to":"Marsh marigold","why":"Cowflock is a flora name"}]'
    )
    expect(out).toEqual([
      {
        scientific_name: 'Caltha palustris',
        verdict: 'rename',
        to: 'Marsh marigold',
        why: 'Cowflock is a flora name',
      },
    ])
  })

  it('survives the code fence the model is told not to use', () => {
    const out = parseVerdicts(
      '```json\n[{"scientific_name":"X","verdict":"keep","why":"fine"}]\n```'
    )
    expect(out[0]!.verdict).toBe('keep')
  })

  it('drops a stray "to" on a keep, so nothing can be written from it', () => {
    const out = parseVerdicts(
      '[{"scientific_name":"X","verdict":"keep","to":"Something","why":"fine"}]'
    )
    expect(out[0]).not.toHaveProperty('to')
  })

  it('THROWS on a rename with no target rather than writing nothing quietly', () => {
    expect(() =>
      parseVerdicts('[{"scientific_name":"X","verdict":"rename","why":"bad"}]')
    ).toThrow(/rename with no "to"/)
  })

  it('THROWS on a verdict it does not understand', () => {
    expect(() =>
      parseVerdicts('[{"scientific_name":"X","verdict":"maybe","why":"?"}]')
    ).toThrow(/keep or rename/)
  })

  it('THROWS when the row cannot be identified', () => {
    expect(() => parseVerdicts('[{"verdict":"keep","why":"fine"}]')).toThrow(
      /missing scientific_name/
    )
  })

  it('THROWS on an object where an array belongs', () => {
    expect(() => parseVerdicts('{"scientific_name":"X"}')).toThrow(
      /expected a JSON array/
    )
  })

  it('trims a proposed name, which the collision checks compare on', () => {
    const out = parseVerdicts(
      '[{"scientific_name":"X","verdict":"rename","to":"  Marsh marigold  ","why":"w"}]'
    )
    expect(out[0]!.to).toBe('Marsh marigold')
  })
})
