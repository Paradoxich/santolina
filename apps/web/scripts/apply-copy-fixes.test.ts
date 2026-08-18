/**
 * What the sweep would WRITE, asserted without a database.
 *
 * A dry run against the live catalog tells you this last and only for the rows
 * that happen to exist today. The two properties below are the ones a wrong
 * answer costs real prose for: writing a column the fix did not change, and
 * splitting one row's fields across two guarded statements.
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
    // Two intents for one row would have the second guard against a value the
    // first had already changed, and report drift against its own sibling.
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
    // reviewed-mutation refuses an intent that writes a column with no expected
    // prior, but the hole would be exactly where the caller was least sure.
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
    // The expensive mistake: rewriting a whole row on the strength of one
    // field, so an unrelated column is re-written and (for description) an
    // editorial verdict retires for nothing.
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
      // fixed
      autumn: 'Flowering persists into autumn.',
      // the verb, untouched — and it travels through unchanged rather than
      // being dropped, because the whole object is the unit of storage
      winter: 'Dormant, as leaves fall.',
      summer: null,
    })
  })

  it('names the stage in `why`, not just the column', () => {
    // The `why` is the only record of why a sentence reads as it does, and
    // "seasonal_rhythm" alone sends the next reader through six stages.
    const intent = intentsFor(
      row({ seasonal_rhythm: { autumn: 'Persists into fall.' } })!
    )!
    expect(intent.why).toContain('seasonal_rhythm.autumn')
  })
})
