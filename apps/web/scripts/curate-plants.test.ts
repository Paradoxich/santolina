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
  missingFields,
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

/**
 * A ROW THAT OWES NOTHING MUST NOT BE CALLED FOR.
 *
 * THE INCIDENT. Round 13: one bad row out of 33 failed the step, and the retry
 * re-billed all 33. Nothing was wrong with the other 32 — the pass has no skip,
 * so every selected row is sent to Claude whether or not it has a gap.
 *
 * THE WITNESS IS THE MISSING LIST, not the cost, because the cost is only
 * observable on a bill. `missingFields` is what the loop now consults before
 * spending, and its emptiness is the exact condition under which `buildPatch`
 * — fill-only for every column — can produce nothing but a fresh timestamp.
 * Against the pre-fix code this block does not compile: the list was inline in
 * `buildPrompt` and there was no seam to call.
 *
 * The pairing matters more than either half: `missingFields(row) === []` and
 * `buildPatch(row, anything)` writing only `ai_drafted_at` are the same claim
 * seen from the two ends, and the last test here asserts they agree.
 */
describe('a fully drafted row owes nothing, and is not worth a call', () => {
  /** Every column the prompt asks about, filled. */
  const completeRow = (overrides: Partial<DbPlant> = {}): DbPlant =>
    ({
      ...freshRow(),
      plant_type: 'perennial',
      plant_type_label: 'Perennial',
      description: 'A plant.',
      care_level: 'low',
      height_min_cm: 10,
      height_max_cm: 20,
      spread_min_cm: 10,
      spread_max_cm: 20,
      hardiness_zone_min: 5,
      hardiness_zone_max: 9,
      // The two defaulted columns are answered by their STAMP, never their
      // value — trap 26, which is what the rest of this file is about.
      style_checked_at: '2026-08-18T00:00:00Z',
      greenery_checked_at: '2026-08-18T00:00:00Z',
      foliage_checked_at: '2026-08-18T00:00:00Z',
      space_types: ['ground_garden'],
      garden_use_tags: ['sunny borders'],
      bloom_color: ['pink'],
      foliage_color: 'green',
      sun_thrives: ['full_sun'],
      sun_tolerates: [],
      bloom_months: [6, 7],
      water_needs: 'moderate',
      water_needs_summary: 'Water weekly.',
      light_needs: 'Full sun.',
      soil_needs: 'Well drained.',
      maintenance_notes: 'Cut back in winter.',
      common_issues: 'Generally pest and disease free.',
      best_placement: 'A sunny border.',
      environment_benefits: 'Nectar for pollinators.',
      seasonal_rhythm: { autumn: 'Fades.' },
      native_to: 'southern Europe',
      ...overrides,
    }) as DbPlant

  it('reports no missing fields for a row with everything', () => {
    expect(missingFields(completeRow())).toEqual([])
  })

  it('still owes a field the row is genuinely missing', () => {
    // The reason the skip is NOT `ai_drafted_at IS NOT NULL`: a partially
    // drafted row is drafted and still owes its gaps. Skipping on the stamp
    // would strand them, silently, which is the failure this pipeline keeps
    // finding.
    expect(missingFields(completeRow({ common_issues: null }))).toEqual([
      'common_issues',
    ])
  })

  it('owes the style question on a stamp, not on a tag count', () => {
    // Trap 26 again, from the selection side: `style_tags: []` is a real
    // verdict and looks exactly like the default, so only the stamp can say
    // whether the question was asked.
    expect(missingFields(completeRow({ style_checked_at: null }))).toContain(
      'style_tags'
    )
    expect(missingFields(completeRow({ greenery_checked_at: null }))).toContain(
      'is_greenery'
    )
  })

  it('treats a null foliage_color WITH its stamp as answered, not unasked', () => {
    // THE ASSERTION THE MIGRATION EXISTS FOR (20260818100000). "Typical green"
    // IS null, so before the stamp this row was re-asked on every run: 587 of
    // 780 drafted rows, 538 of them selected every time. The value cannot say
    // whether the question was asked; only the stamp can.
    expect(missingFields(completeRow({ foliage_color: null }))).toEqual([])
  })

  it('owes foliage_color when the stamp is absent, whatever the value says', () => {
    // The other direction: a row carrying a colour but no stamp was never
    // asked by this pass (the value came from elsewhere), so it still owes it.
    expect(missingFields(completeRow({ foliage_checked_at: null }))).toContain(
      'foliage_color'
    )
  })

  it('agrees with the patch builder: nothing missing means nothing to write', () => {
    // The two ends of one claim. If these ever disagree, the skip is either
    // stranding a field the patch would have filled, or paying for a call
    // whose patch is a timestamp.
    const row = completeRow()
    const patch = buildPatch(
      row,
      response({
        description: 'A different description the model volunteered.',
        common_issues: 'Something else.',
      })
    )
    expect(missingFields(row)).toEqual([])
    expect(Object.keys(patch)).toEqual(['ai_drafted_at'])
  })
})
