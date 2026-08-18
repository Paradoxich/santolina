/**
 * What the sweep would write, asserted without a database.
 */

import { describe, it, expect } from 'vitest'
import { intentsFor } from './apply-copy-fixes'

const row = (fields: Record<string, unknown>) => ({
  id: 'p1',
  common_name: 'Test plant',
  ...fields,
})

describe('the sweep writes one statement per row', () => {
  it('folds every fixed column of a row into a single intent', () => {
    const intent = intentsFor(
      row({
        description: 'Blooms into fall.',
        maintenance_notes: 'Divide in spring or fall.',
      })
    )!
    expect(Object.keys(intent.to).sort()).toEqual([
      'description',
      'maintenance_notes',
    ])
    expect(intent.to['description']).toBe('Blooms into autumn.')
    expect(intent.to['maintenance_notes']).toBe('Divide in spring or autumn.')
  })

  it('guards every written column with its stored value', () => {
    const intent = intentsFor(row({ description: 'In fall it turns.' }))!
    for (const column of Object.keys(intent.to)) {
      expect(intent.from).toHaveProperty(column)
    }
  })

  it('writes nothing for a row that is already clean', () => {
    expect(
      intentsFor(
        row({
          description: 'Blooms into autumn as leaves fall.',
          maintenance_notes: 'Prune in winter.',
        })
      )
    ).toBeNull()
  })

  it('does not touch a column it did not change', () => {
    const intent = intentsFor(
      row({
        description: 'In fall it turns.',
        maintenance_notes: 'Prune in winter.',
        common_issues: 'Generally pest and disease free.',
      })
    )!
    expect(Object.keys(intent.to)).toEqual(['description'])
  })
})

describe('a jsonb prose column is rewritten whole, stage by stage', () => {
  it('keeps the untouched stages and fixes only the offending one', () => {
    const intent = intentsFor(
      row({
        seasonal_rhythm: {
          autumn: 'Flowering persists into fall.',
          winter: 'Dormant, as leaves fall.',
          summer: null,
        },
      })
    )!
    expect(intent.to['seasonal_rhythm']).toEqual({
      autumn: 'Flowering persists into autumn.',
      // the verb, untouched, and carried through unchanged
      winter: 'Dormant, as leaves fall.',
      summer: null,
    })
  })

  it('names the stage in `why`, not just the column', () => {
    const intent = intentsFor(
      row({ seasonal_rhythm: { autumn: 'Persists into fall.' } })!
    )!
    expect(intent.why).toContain('seasonal_rhythm.autumn')
  })
})
