/**
 * The collision pre-check, which is the one property a name pass can violate by
 * doing its job.
 *
 * WHAT IT GUARDS. Round 8 renamed `Anemonoides nemorosa` to "Wood anemone" onto
 * a catalog that already held one, and needed a third group of corrections to
 * undo it — the entry in its own decision table still reads "SELF-INFLICTED".
 * Round 12 hit the intra-batch form: Trefle returned "Japanese iris" for both
 * _Iris ensata_ and _I. laevigata_ (docs/database-log.md, the 2026-08-16 round-12
 * session entry).
 *
 * `findCollisions` is the callable seam for it. The three name scripts used to
 * carry three copies of the check — round 8's copy being no copy at all — so
 * what is asserted here is a property of all three at once.
 *
 * THIS PINS NO TRAP, and the header says so on purpose. The nearest one records
 * that Trefle's common names are botanical, whose remedy is a human name pass
 * and not a code property; an earlier draft of this header cited it by number
 * and `docs:claims` promptly counted that trap as pinned, disagreeing with the
 * ratchet in `check-pipeline-invariants.ts` by one. A test header naming a trap
 * it does not close is a false green in the one place built to be believed.
 */

import { describe, it, expect } from 'vitest'
import { findCollisions, type NameFix, type HeldName } from './name-fixes'

const fix = (scientific_name: string, from: string, to: string): NameFix => ({
  scientific_name,
  from,
  to,
  why: 'test',
})

describe('findCollisions', () => {
  it('refuses a target another row already holds', () => {
    const blocked = findCollisions(
      [fix('Anemonoides nemorosa', 'Anemonoides nemorosa', 'Wood anemone')],
      [
        {
          scientific_name: 'Anemone quinquefolia',
          common_name: 'Wood anemone',
        },
        {
          scientific_name: 'Anemonoides nemorosa',
          common_name: 'Anemonoides nemorosa',
        },
      ]
    )
    expect(blocked.get('Anemonoides nemorosa')).toEqual([
      'Anemone quinquefolia',
    ])
  })

  it('lets a row keep the name it already holds', () => {
    // The idempotent case. Without it, a re-run refuses every fix it once
    // wrote, and a script that always fails is a script people stop reading.
    const blocked = findCollisions(
      [fix('Cercis canadensis', 'Judastree', 'Eastern redbud')],
      [{ scientific_name: 'Cercis canadensis', common_name: 'Eastern redbud' }]
    )
    expect(blocked.size).toBe(0)
  })

  it('compares case-insensitively', () => {
    // "Grape-hyacinth" and "grape-hyacinth" are one name to a reader, and the
    // catalog has carried both spellings.
    const blocked = findCollisions(
      [fix('Muscari botryoides', 'Grape-hyacinth', 'grape hyacinth')],
      [{ scientific_name: 'Muscari neglectum', common_name: 'Grape Hyacinth' }]
    )
    expect(blocked.get('Muscari botryoides')).toEqual(['Muscari neglectum'])
  })

  it('ignores rows with no common name', () => {
    const blocked = findCollisions(
      [fix('Danae racemosa', 'Danae racemosa', 'Alexandrian laurel')],
      [{ scientific_name: 'Ruscus aculeatus', common_name: null } as HeldName]
    )
    expect(blocked.size).toBe(0)
  })

  it('names every holder when more than one row shares the target', () => {
    const blocked = findCollisions(
      [fix('Iris laevigata', 'Japanese iris', 'Water iris')],
      [
        { scientific_name: 'Iris ensata', common_name: 'Water iris' },
        { scientific_name: 'Iris pseudacorus', common_name: 'water iris' },
      ]
    )
    expect(blocked.get('Iris laevigata')).toEqual([
      'Iris ensata',
      'Iris pseudacorus',
    ])
  })
})
