/**
 * Merge rules for the editorial report.
 *
 * EVERY ASSERTION HERE IS A BUG THAT HAPPENED, not a hypothetical. Round 10
 * produced two of them within an hour of each other, in opposite directions,
 * and the second was introduced by the fix for the first:
 *
 *   1. A row cleared by an --ids run still read as HELD in the next --round
 *      run's report, quoting a description the database no longer had. A row
 *      clear on all three criteria emitted no finding, so the merge had
 *      nothing to overwrite its previous finding with.
 *
 *   2. Fixing that by emitting a synthetic "cleared" finding then destroyed
 *      the rewrite provenance: the report went from 29 rewrites to 0, because
 *      a synthetic finding carries rewritten:false and flattened each row's
 *      history.
 *
 * Both are the same underlying mistake in different clothes — treating "this
 * run has no news about X" as "there is no X". That is the fourth instance of
 * that shape in this pipeline (see StepStatus.vacuous and the pick-plant-images
 * review report), which is why the rules get a test rather than a comment.
 *
 * These assertions were mutation-tested: reverting the provenance fix in
 * editorial-report.ts fails exactly the three tests that name it, and nothing
 * else. Bug 1 is only PARTLY covered here and the test that mentions it says
 * so out loud — its other half lives in curate-editorial.ts, which exits on
 * import and so is out of reach of a unit test. Claiming otherwise would make
 * this file the same kind of confident-looking wrong answer it exists to
 * prevent.
 */

import { describe, it, expect } from 'vitest'
import {
  mergeFindings,
  carryDescriptionProvenance,
  CLEARED_PREVIOUSLY,
  buildEditorialPatch,
  type Finding,
} from './editorial-report'

/** A held row, blocked on whatever `blocker` says. */
const held = (id: string, name: string, blocker: string): Finding => ({
  id,
  common_name: name,
  scientific_name: `Sci ${name}`,
  image: { verdict: 'pass', reason: 'image pass: high confidence' },
  description: { verdict: 'pass', reason: 'ok', rewritten: false },
  tags: { verdict: 'fail', reason: blocker },
  approved: false,
  blockers: [`tags: ${blocker}`],
})

/** A row whose description this run actually rewrote, with the receipt. */
const rewritten = (id: string, name: string): Finding => ({
  id,
  common_name: name,
  scientific_name: `Sci ${name}`,
  image: { verdict: 'pass', reason: 'image pass: high confidence' },
  description: {
    verdict: 'pass',
    reason: 'weak, rewritten',
    rewritten: true,
    before: 'A charming plant.',
    after: 'A low evergreen with grey leaves.',
    blind_verdict: 'ok',
    blind_reason: 'concrete and on-voice',
  },
  tags: { verdict: 'pass', reason: 'ok' },
  approved: true,
  blockers: [],
})

/**
 * What a fully-clear row emits: every criterion cleared in an EARLIER run, so
 * this run judged nothing and has no opinion about the description.
 */
const clearedNow = (id: string, name: string): Finding => ({
  id,
  common_name: name,
  scientific_name: `Sci ${name}`,
  image: { verdict: 'pass', reason: CLEARED_PREVIOUSLY },
  description: {
    verdict: 'pass',
    reason: CLEARED_PREVIOUSLY,
    rewritten: false,
  },
  tags: { verdict: 'pass', reason: CLEARED_PREVIOUSLY },
  approved: true,
  blockers: [],
})

describe('mergeFindings', () => {
  it('carries forward a row this run did not touch', () => {
    // The original reason this merge exists: a 9-row re-run must not delete
    // the other 92 rows' recorded blockers.
    const merged = mergeFindings(
      [held('a', 'Aster', 'tree tagged for balconies')],
      [clearedNow('b', 'Bellflower')]
    )
    expect(merged).toHaveLength(2)
    expect(merged.find((f) => f.id === 'a')?.blockers).toEqual([
      'tags: tree tagged for balconies',
    ])
  })

  it('lets an emitted cleared finding win over a stale hold', () => {
    // Cyclamen persicum: held on tags, fixed, cleared by an --ids run, then
    // still reported as held by the next --round run.
    //
    // HONESTY NOTE, because this test is weaker than it looks: it does NOT
    // reproduce that bug, and it passes against the pre-fix merge. The bug was
    // that curate-editorial emitted NO finding for an already-clear row, so
    // there was nothing for this merge to apply — and that half lives in a
    // file which calls requireScope() and main() at import, so a unit test
    // cannot reach it. Verified by mutation: reverting the merge fix leaves
    // this test green.
    //
    // What it does buy is the downstream half of the contract the fix depends
    // on: if a cleared finding IS emitted, it must beat the stale one. That is
    // the part a future refactor could silently break.
    const merged = mergeFindings(
      [held('a', 'Cyclamen', 'houseplant tagged for balconies')],
      [clearedNow('a', 'Cyclamen')]
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]!.approved).toBe(true)
    expect(merged[0]!.blockers).toEqual([])
  })

  it('BUG 2: a cleared row keeps the rewrite receipt it already had', () => {
    // The before/after is not recoverable elsewhere for a freshly seeded
    // plant, so re-stating an already-clear row must not blank it.
    const merged = mergeFindings(
      [rewritten('a', 'Allium')],
      [clearedNow('a', 'Allium')]
    )
    expect(merged[0]!.description.rewritten).toBe(true)
    expect(merged[0]!.description.before).toBe('A charming plant.')
    expect(merged[0]!.description.after).toBe(
      'A low evergreen with grey leaves.'
    )
    expect(merged[0]!.description.blind_verdict).toBe('ok')
  })

  it('counts rewrites correctly after a full re-state of clear rows', () => {
    // The shape that actually broke: 2 rewritten rows, then a --round run
    // that re-states every already-clear row. The report's headline count is
    // what regressed (29 -> 0), so assert the count, not just one row.
    const previous = [rewritten('a', 'Allium'), rewritten('b', 'Bellflower')]
    const current = [clearedNow('a', 'Allium'), clearedNow('b', 'Bellflower')]
    const merged = mergeFindings(previous, current)
    expect(merged.filter((f) => f.description.rewritten)).toHaveLength(2)
  })

  it('sorts by common name so the report diff is stable', () => {
    const merged = mergeFindings(
      [clearedNow('c', 'Zinnia')],
      [clearedNow('a', 'Allium'), clearedNow('b', 'Mint')]
    )
    expect(merged.map((f) => f.common_name)).toEqual([
      'Allium',
      'Mint',
      'Zinnia',
    ])
  })
})

describe('carryDescriptionProvenance', () => {
  it('does NOT carry provenance when the run really re-judged the description', () => {
    // The guard on the guard. A real re-judgment is authoritative, including
    // when it decides the description no longer needs a rewrite — otherwise a
    // stale before/after would outlive the judgment that retired it.
    const next: Finding = {
      ...clearedNow('a', 'Allium'),
      description: {
        verdict: 'pass',
        reason: 'ok', // judged this run, NOT the cleared-previously sentinel
        rewritten: false,
      },
    }
    const merged = carryDescriptionProvenance(rewritten('a', 'Allium'), next)
    expect(merged.description.rewritten).toBe(false)
    expect(merged.description.before).toBeUndefined()
  })

  it('keeps the NEW verdict while carrying the OLD provenance', () => {
    // A row can be rewritten, approved, then later held again on its image.
    // The receipt survives; the verdict is the current one.
    const priorRewritten = rewritten('a', 'Allium')
    const nowHeldOnImage: Finding = {
      ...clearedNow('a', 'Allium'),
      image: { verdict: 'open', reason: 'image pass: medium confidence' },
      approved: false,
      blockers: ['image: image pass: medium confidence'],
    }
    const merged = carryDescriptionProvenance(priorRewritten, nowHeldOnImage)
    expect(merged.approved).toBe(false)
    expect(merged.blockers).toEqual(['image: image pass: medium confidence'])
    expect(merged.description.rewritten).toBe(true)
    expect(merged.description.before).toBe('A charming plant.')
  })

  it('leaves a row alone when there was no prior provenance to carry', () => {
    const merged = carryDescriptionProvenance(
      held('a', 'Allium', 'some blocker'),
      clearedNow('a', 'Allium')
    )
    expect(merged.description.rewritten).toBe(false)
    expect(merged.approved).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildEditorialPatch — the `editorial-approval-never-withdrawn` finding,
// recorded 2026-08-14 by the schema design review and fixed 2026-08-18.
//
// PRE-FIX, EVERY CASE BELOW EXCEPT THE FIRST FAILS. The write was
// `if (approved) patch.is_curated = true` with the stamps set only on pass, so
// a hold could not withdraw an approval and could not clear the stamp that
// approval rested on. The defect's own witness is the patch, which is why the
// builder had to be extracted before it could be pinned.
// ---------------------------------------------------------------------------

const NOW = '2026-08-18T00:00:00.000Z'

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'id-1',
  common_name: 'Magnolia',
  scientific_name: 'Magnolia liliiflora',
  image: { verdict: 'pass', reason: 'ok' },
  description: { verdict: 'pass', reason: 'ok', rewritten: false },
  tags: { verdict: 'pass', reason: 'ok' },
  approved: true,
  blockers: [],
  ...over,
})

describe('buildEditorialPatch (editorial-approval-never-withdrawn)', () => {
  it('approves and stamps all three criteria', () => {
    expect(buildEditorialPatch(finding(), NOW)).toEqual({
      editorial_checked_at: NOW,
      is_curated: true,
      editorial_image_at: NOW,
      editorial_description_at: NOW,
      editorial_tags_at: NOW,
    })
  })

  it('WITHDRAWS an approval when the row is re-judged to a hold', () => {
    const patch = buildEditorialPatch(
      finding({
        approved: false,
        description: { verdict: 'fail', reason: 'weak', rewritten: false },
        blockers: ['description: weak'],
      }),
      NOW
    )
    // The old write left this true, and nothing downstream could tell.
    expect(patch.is_curated).toBe(false)
  })

  it('nulls the stamp of the criterion that failed, and only that one', () => {
    const patch = buildEditorialPatch(
      finding({
        approved: false,
        tags: { verdict: 'fail', reason: 'cottage is not defensible here' },
      }),
      NOW
    )
    expect(patch.editorial_tags_at).toBeNull()
    expect(patch.editorial_image_at).toBe(NOW)
    expect(patch.editorial_description_at).toBe(NOW)
  })

  it('nulls an open criterion too — unresolved is not cleared', () => {
    const patch = buildEditorialPatch(
      finding({
        approved: false,
        image: { verdict: 'open', reason: 'no url' },
      }),
      NOW
    )
    expect(patch.editorial_image_at).toBeNull()
  })

  it('carries a rewrite in the same patch as the stamps', () => {
    const patch = buildEditorialPatch(
      finding({
        description: {
          verdict: 'pass',
          reason: 'ok',
          rewritten: true,
          before: 'old',
          after: 'new',
        },
      }),
      NOW
    )
    // Same statement as the stamp on purpose: the trigger skips a criterion
    // whose stamp this UPDATE changes, so the rewrite cannot invalidate the
    // approval it is part of.
    expect(patch.description).toBe('new')
    expect(patch.editorial_description_at).toBe(NOW)
  })

  it('never writes a description key when nothing was rewritten', () => {
    expect('description' in buildEditorialPatch(finding(), NOW)).toBe(false)
  })

  // A criterion this run did not examine is always `pass` with reason
  // `cleared previously`, so nulling on fail can never touch one.
  it('re-stamps a criterion carried forward as cleared previously', () => {
    const patch = buildEditorialPatch(
      finding({
        tags: { verdict: 'pass', reason: CLEARED_PREVIOUSLY },
      }),
      NOW
    )
    expect(patch.editorial_tags_at).toBe(NOW)
  })
})
