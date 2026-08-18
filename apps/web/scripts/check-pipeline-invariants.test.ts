/**
 * Shape 19's two pure seams — `a catalog column the product never reads`.
 *
 * WHY THIS FILE EXISTS AT ALL, given check-pipeline-invariants.ts is a source
 * scan and its own header says a scan is not a vitest file. The SCAN is not
 * what is tested here; the two functions that decide what it sees are. Shape 1
 * of that same file is "a guard predicate that can never fire", and a reader
 * built on a regex over `.select()` strings is exactly the shape that silently
 * matches nothing and reports a clean run forever.
 *
 * The measurement is the subtle half. A word search for the column name clears
 * `notes` against an unrelated diary variable — that is, it would have cleared
 * the very column that prompted the shape.
 */

import { describe, expect, it } from 'vitest'

import { productReadSet } from './check-pipeline-invariants'

const src = (text: string) => [{ file: 'lib/x.ts', text }]

describe('productReadSet', () => {
  it('reads the projection the product actually asks for', () => {
    const set = productReadSet(
      'plant_combinations',
      src(
        `supabase.from('plant_combinations').select('plant_id_a, plant_id_b')`
      )
    )
    expect(set).toEqual(new Set(['plant_id_a', 'plant_id_b']))
  })

  it('survives the chained calls the real query has between from and select', () => {
    // lib/plant-detail.ts wraps these across lines inside a Promise.all.
    const set = productReadSet(
      'plant_combinations',
      src(`
        supabase
          .from('plant_combinations')
          .select('plant_id_a, plant_id_b')
          .or(\`plant_id_a.eq.\${plantId}\`)
      `)
    )
    expect(set).toEqual(new Set(['plant_id_a', 'plant_id_b']))
  })

  it('returns null for select(*) — the whole row is read', () => {
    expect(
      productReadSet('plants', src(`db.from('plants').select('*')`))
    ).toBeNull()
  })

  it('returns null when the product never queries the table', () => {
    expect(
      productReadSet(
        'plant_combinations',
        src(`db.from('plants').select('id')`)
      )
    ).toBeNull()
  })

  // The false-clear this shape exists to avoid: `notes` as a local name in
  // unrelated product code must not count as a read of the combos column.
  it('does not count a bare identifier as a read', () => {
    const set = productReadSet(
      'plant_combinations',
      src(`
        const notes = entry.notes
        db.from('plant_combinations').select('plant_id_a, plant_id_b')
      `)
    )
    expect(set?.has('notes')).toBe(false)
  })

  it('unions the projections when the product queries a table twice', () => {
    const set = productReadSet(
      'plant_combinations',
      src(`
        db.from('plant_combinations').select('plant_id_a')
        db.from('plant_combinations').select('plant_id_b, strength')
      `)
    )
    expect(set).toEqual(new Set(['plant_id_a', 'plant_id_b', 'strength']))
  })

  it('ignores an embedded join rather than treating it as a column', () => {
    const set = productReadSet(
      'plant_combinations',
      src(
        `db.from('plant_combinations').select('plant_id_a, plants(common_name)')`
      )
    )
    expect(set).toEqual(new Set(['plant_id_a']))
  })
})
