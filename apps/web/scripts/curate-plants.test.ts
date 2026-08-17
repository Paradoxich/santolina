/**
 * Trap 26, pinned at the patch builder: a guard written as `column == null`
 * against a NOT NULL DEFAULT column can never fire, so for three weeks
 * curate-plants "asked" the style question and never wrote an answer. The
 * only honest witness for a defaulted column is its stamp — `[]` style_tags
 * and `false` is_greenery are real verdicts that look exactly like the
 * default.
 *
 * Assertions are on the STAMP, never on tag counts: 134 of 720 rows in the
 * round 11 snapshot legitimately carry a stamp with empty tags.
 */
import { describe, expect, it } from 'vitest'

import type { DbPlant } from '../lib/plants-db'
import {
  buildPatch,
  restrictPatch,
  type CurationResponse,
} from './curate-plants'

/** A row exactly as the DB default leaves it for the two defaulted columns. */
const freshRow = (overrides: Partial<DbPlant> = {}): DbPlant =>
  ({
    id: 'plant-1',
    common_name: 'Test plant',
    scientific_name: 'Testus plantus',
    plant_type: 'perennial',
    style_tags: [], // NOT NULL DEFAULT '{}' — never null, whence trap 26
    style_checked_at: null,
    is_greenery: false, // NOT NULL DEFAULT false — same shape
    greenery_checked_at: null,
    ...overrides,
  }) as DbPlant

const response = (
  overrides: Partial<CurationResponse> = {}
): CurationResponse =>
  ({
    style_tags: [],
    is_greenery: false,
    ...overrides,
  }) as CurationResponse

describe('buildPatch: defaulted columns are guarded by their stamp', () => {
  it('an unstamped row with default-shaped values still gets the answer written', () => {
    // THE trap-26 case: style_tags [] and is_greenery false are byte-identical
    // to the DB defaults, so a value-based guard sees nothing to do. The
    // stamp-based guard must write both the verdict and the stamp anyway.
    const patch = buildPatch(freshRow(), response())
    expect(patch.style_tags).toEqual([])
    expect(patch.style_checked_at).toBeTruthy()
    expect(patch.is_greenery).toBe(false)
    expect(patch.greenery_checked_at).toBeTruthy()
  })

  it('a stamped row is not re-answered — the stamp is the guard', () => {
    const patch = buildPatch(
      freshRow({
        style_checked_at: '2026-07-29T00:00:00Z',
        greenery_checked_at: '2026-07-29T00:00:00Z',
      } as Partial<DbPlant>),
      response({ style_tags: ['cottage'], is_greenery: true })
    )
    expect(patch).not.toHaveProperty('style_tags')
    expect(patch).not.toHaveProperty('style_checked_at')
    expect(patch).not.toHaveProperty('is_greenery')
    expect(patch).not.toHaveProperty('greenery_checked_at')
  })

  it('no answer in the response means no stamp — the stamp never outruns the write', () => {
    const patch = buildPatch(
      freshRow(),
      response({ style_tags: undefined, is_greenery: undefined })
    )
    expect(patch).not.toHaveProperty('style_checked_at')
    expect(patch).not.toHaveProperty('greenery_checked_at')
  })
})

/**
 * Field-scoped mode (`--only <field>`), added 2026-08-17 so the 27 rows with a
 * blank `common_issues` could be filled — 14 of which are `is_curated = true`
 * and therefore invisible to the drafting pass, whose selection filters them
 * out.
 *
 * WHAT THESE PIN. Reaching signed-off rows means dropping that filter, so the
 * safety property moves to the patch: no column watched by
 * `invalidate_editorial_verdict` (migration 20260729101133) may survive
 * restrictPatch. Asserting it on the PATCH rather than on the prompt is the
 * point — the prompt asks, the patch is what reaches the database, and a
 * response that volunteers extra fields must not be able to un-curate a row.
 */
describe('restrictPatch — field-scoped mode cannot un-curate a row', () => {
  const fullPatch = {
    ai_drafted_at: '2026-08-17T00:00:00Z',
    common_issues: 'Generally pest and disease free.',
    description: 'A rewritten description.',
    style_tags: ['cottage'],
    style_checked_at: '2026-08-17T00:00:00Z',
    space_types: ['border'],
    best_placement: 'Sunny borders.',
  } as unknown as Parameters<typeof restrictPatch>[0]

  it('keeps only the named field and the drafting stamp', () => {
    const patch = restrictPatch(fullPatch, 'common_issues')
    expect(Object.keys(patch).sort()).toEqual([
      'ai_drafted_at',
      'common_issues',
    ])
  })

  it('drops every editorially-watched column the response volunteered', () => {
    const patch = restrictPatch(fullPatch, 'common_issues')
    for (const watched of [
      'description',
      'style_tags',
      'space_types',
      'image_url_curated',
      'image_pick_confidence',
    ]) {
      expect(patch).not.toHaveProperty(watched)
    }
  })

  it('drops an unrelated field even though buildPatch would have written it', () => {
    const patch = restrictPatch(fullPatch, 'common_issues')
    expect(patch).not.toHaveProperty('best_placement')
  })

  it('omits the field entirely when the response had nothing for it, so the caller can fail the row', () => {
    const patch = restrictPatch(fullPatch, 'environment_benefits')
    expect(patch).not.toHaveProperty('environment_benefits')
    expect('environment_benefits' in patch).toBe(false)
  })

  it('is a no-op without a scope, so a full draft is unaffected', () => {
    expect(restrictPatch(fullPatch, null)).toBe(fullPatch)
  })
})
