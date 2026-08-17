/**
 * Trap 31's own distinction, pinned: a withdrawn editorial verdict is not a
 * never-judged row, and `editorial_checked_at` cannot tell you which you have.
 *
 * WHY THIS TEST EXISTS. Trap 31 (docs/database-log.md) is the 2026-08-15 repair
 * that re-tagged 86 rows and silently un-curated all 86, unnoticed for two days.
 * The reporting half of its remedy is that a pass names the verdicts it retires;
 * the MEASURING half is being able to look at the catalog afterwards and say how
 * many rows are in that state — which is only possible because the trigger clears
 * per criterion, leaving the untouched legs stamped.
 *
 * These fail against a `splitEditorial` that keys on `editorial_checked_at`
 * alone, which is the obvious implementation and the wrong one: the trigger nulls
 * that column on withdrawal, so it reports every withdrawn row as never judged
 * and the regression disappears into the retrofit backlog.
 */

import { describe, it, expect } from 'vitest'
import { splitEditorial, type EditorialRow } from './catalog-status'

const AT = '2026-08-15T10:00:00Z'

const row = (p: Partial<EditorialRow> = {}): EditorialRow => ({
  editorial_checked_at: null,
  editorial_image_at: null,
  editorial_description_at: null,
  editorial_tags_at: null,
  ...p,
})

describe('splitEditorial', () => {
  it('leaves a row with a live verdict out of both buckets', () => {
    const judged = row({
      editorial_checked_at: AT,
      editorial_image_at: AT,
      editorial_description_at: AT,
      editorial_tags_at: AT,
    })
    const { neverJudged, withdrawn } = splitEditorial([judged])
    expect(neverJudged).toHaveLength(0)
    expect(withdrawn).toHaveLength(0)
  })

  it('counts an untouched row as never judged', () => {
    const { neverJudged, withdrawn } = splitEditorial([row()])
    expect(neverJudged).toHaveLength(1)
    expect(withdrawn).toHaveLength(0)
  })

  it('counts trap 31s shape as withdrawn, not never judged', () => {
    // The exact state the 2026-08-15 curate-styles repair left behind: tags
    // changed, so the trigger cleared editorial_tags_at AND
    // editorial_checked_at, while the image and description legs — which the
    // repair never touched — stayed stamped.
    const trap31 = row({
      editorial_image_at: AT,
      editorial_description_at: AT,
      editorial_tags_at: null,
    })
    const { neverJudged, withdrawn } = splitEditorial([trap31])
    expect(withdrawn).toHaveLength(1)
    expect(neverJudged).toHaveLength(0)
  })

  it('treats any surviving criterion stamp as evidence of a past verdict', () => {
    // Whichever leg the trigger spared is enough. A row is only "never judged"
    // when nothing ever stamped any of the three.
    for (const leg of [
      'editorial_image_at',
      'editorial_description_at',
      'editorial_tags_at',
    ] as const) {
      const { withdrawn, neverJudged } = splitEditorial([row({ [leg]: AT })])
      expect(withdrawn, `${leg} should read as withdrawn`).toHaveLength(1)
      expect(neverJudged).toHaveLength(0)
    }
  })

  it('splits a mixed catalog without double-counting', () => {
    const plants = [
      row({ editorial_checked_at: AT, editorial_image_at: AT }), // live verdict
      row(), // never judged
      row(), // never judged
      row({ editorial_tags_at: AT }), // withdrawn
    ]
    const { neverJudged, withdrawn } = splitEditorial(plants)
    expect(neverJudged).toHaveLength(2)
    expect(withdrawn).toHaveLength(1)
    // Every row with no verdict lands in exactly one bucket, and a row with a
    // verdict lands in neither.
    expect(neverJudged.length + withdrawn.length).toBe(
      plants.filter((p) => !p.editorial_checked_at).length
    )
  })
})
