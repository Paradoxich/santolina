/**
 * Pins TRAP 31 — a write that retires an editorial verdict and cannot say so.
 *
 * THE INCIDENT. 2026-08-15, `curate-styles --round 9` and `--round 10` re-tagged
 * 86 rows. `invalidate_editorial_verdict` cleared `is_curated` on every one of
 * them inside the database. The script printed "86 tagged", had never selected
 * `is_curated`, and so could not print "86 un-curated". Nobody noticed for two
 * days.
 *
 * WHAT THIS ASSERTS, AND WHY IT IS THE DEFECT'S OWN WITNESS. The witness is not
 * "the tags changed" — that was never in doubt and was reported correctly at the
 * time. It is the RETIREMENT COUNT: `MutationReport.verdict_retired`, observed
 * by reading `is_curated` back rather than inferred from what the trigger is
 * believed to watch. Against the pre-fix code there is no such field and no such
 * read, so `verdict_retired` does not compile.
 *
 * `verdict_survived` is the same assertion from the other side: a curated row
 * that was written and stayed curated means the trigger's watch set is not what
 * `lib/plants-write.ts`'s CRITERION_FIELDS says, which that module's header
 * states outright is unverified.
 */

import { describe, expect, it } from 'vitest'

import {
  classify,
  formatReport,
  openReviewedMutation,
  type MutationDb,
  type MutationIntent,
} from './reviewed-mutation'

interface FakeRow {
  id: string
  is_curated: boolean
  [column: string]: unknown
}

/**
 * A `plants` stand-in with the one behaviour that matters: a trigger that
 * clears `is_curated` when a watched column changes. Everything trap 31 is
 * about happens in that clause.
 */
function fakeDb(
  rows: FakeRow[],
  opts: { watches?: string[] } = {}
): MutationDb & { rows: Map<string, FakeRow>; updates: number } {
  const watches = opts.watches ?? ['style_tags', 'description']
  const store = new Map(rows.map((r) => [r.id, { ...r }]))
  const state = { rows: store, updates: 0 }

  return {
    ...state,
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            in(_column: string, ids: string[]) {
              return Promise.resolve({
                data: ids
                  .map((id) => store.get(id))
                  .filter((r): r is FakeRow => Boolean(r))
                  .map((r) => ({ ...r })),
                error: null,
              })
            },
          }
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              state.updates++
              const row = store.get(id)
              if (!row) return Promise.resolve({ error: null })
              const touchesWatched = Object.keys(patch).some((c) =>
                watches.includes(c)
              )
              Object.assign(row, patch)
              // The trigger.
              if (touchesWatched) row.is_curated = false
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  } as MutationDb & { rows: Map<string, FakeRow>; updates: number }
}

const intent = (over: Partial<MutationIntent> = {}): MutationIntent => ({
  id: 'p1',
  label: 'Salvia nemorosa',
  from: { style_tags: ['cottage'] },
  to: { style_tags: ['prairie'] },
  why: 'the grasses-and-late-perennials look is prairie, not cottage',
  ...over,
})

describe('classify', () => {
  it('reports a row already holding `to` as noop, not drift', () => {
    // The ordering bug apply-description-fixes shipped once: a committed
    // decision file's steady state is "already applied", and calling that
    // drift makes the default invocation fail forever.
    const row = {
      id: 'p1',
      is_curated: false,
      values: { style_tags: ['prairie'] },
    }
    expect(classify(intent(), row, 'skip').disposition).toBe('noop')
  })

  it('skips a row holding neither `from` nor `to`', () => {
    const row = {
      id: 'p1',
      is_curated: false,
      values: { style_tags: ['modern'] },
    }
    const out = classify(intent(), row, 'skip')
    expect(out.disposition).toBe('drift')
    expect(out.detail).toContain('found {"style_tags":["modern"]}')
  })

  it('freezes a curated row under `skip` and writes it under `retire`', () => {
    const row = {
      id: 'p1',
      is_curated: true,
      values: { style_tags: ['cottage'] },
    }
    expect(classify(intent(), row, 'skip').disposition).toBe('frozen')
    expect(classify(intent(), row, 'retire').disposition).toBe('written')
  })

  it('reports a missing row rather than writing one', () => {
    expect(classify(intent(), undefined, 'skip').disposition).toBe('missing')
  })
})

describe('the retirement count (trap 31)', () => {
  it('counts a verdict this run retired, observed by reading is_curated back', async () => {
    const db = fakeDb([
      { id: 'p1', is_curated: true, style_tags: ['cottage'] },
      { id: 'p2', is_curated: false, style_tags: ['cottage'] },
    ])
    const session = openReviewedMutation({
      db,
      table: 'plants',
      onCurated: 'retire',
    })

    const report = await session.apply([
      intent(),
      intent({ id: 'p2', label: 'Nepeta racemosa' }),
    ])

    expect(report.written).toBe(2)
    // The sentence trap 31 could not print.
    expect(report.verdict_retired).toBe(1)
    expect(report.retired).toEqual(['Salvia nemorosa'])
    // p2 held no verdict, so it lost none.
    expect(report.verdict_survived).toEqual([])
  })

  it('is zero under `skip`, because that policy never writes a curated row', async () => {
    const db = fakeDb([{ id: 'p1', is_curated: true, style_tags: ['cottage'] }])
    const session = openReviewedMutation({
      db,
      table: 'plants',
      onCurated: 'skip',
    })

    const report = await session.apply([intent()])
    expect(report.written).toBe(0)
    expect(report.skipped_frozen).toBe(1)
    expect(report.verdict_retired).toBe(0)
    expect(db.updates).toBe(0)
  })

  it('flags a curated row that was written and KEPT its verdict', async () => {
    // The trigger does not watch common_name, so the verdict survives a write
    // this session made. That is the CRITERION_FIELDS divergence lib/plants-write
    // says nothing verifies.
    const db = fakeDb(
      [{ id: 'p1', is_curated: true, common_name: 'Wood sage' }],
      { watches: ['style_tags'] }
    )
    const session = openReviewedMutation({
      db,
      table: 'plants',
      onCurated: 'retire',
    })

    const report = await session.apply([
      intent({
        from: { common_name: 'Wood sage' },
        to: { common_name: 'Woodland sage' },
      }),
    ])

    expect(report.verdict_retired).toBe(0)
    expect(report.verdict_survived).toEqual(['Salvia nemorosa'])
    expect(formatReport(report)).toContain('KEPT their verdict')
  })

  it('does not flag a curated row that was only STAMPED', async () => {
    // THE FALSE ALARM STEP D FOUND, 2026-08-17. The first catalog-wide run
    // warned that 26 curated rows had been "written and KEPT their verdict".
    // All 26 had identical tags before and after: they were stamp-only writes,
    // and `style_checked_at` is not a column the trigger watches, so keeping the
    // verdict was correct. The bug was that `curatedBefore` counted `stamped`
    // rows alongside `written` ones, so a row that could not possibly retire a
    // verdict was checked for having failed to.
    //
    // A warning that cries wolf is trap 31 inverted — wrong in the direction
    // that teaches people to skip the report.
    const db = fakeDb([{ id: 'p1', is_curated: true, style_tags: ['cottage'] }])
    const session = openReviewedMutation({
      db,
      table: 'plants',
      onCurated: 'retire',
    })

    const report = await session.apply([
      intent({
        from: { style_tags: ['cottage'] },
        to: { style_tags: ['cottage'] }, // unchanged
        alsoWrite: { style_checked_at: '2026-08-17T00:00:00Z' },
      }),
    ])

    expect(report.stamped).toBe(1)
    expect(report.written).toBe(0)
    expect(report.verdict_retired).toBe(0)
    expect(report.verdict_survived).toEqual([])
    expect(formatReport(report)).not.toContain('KEPT their verdict')
  })

  it('names the retired rows in the printed report', async () => {
    const db = fakeDb([{ id: 'p1', is_curated: true, style_tags: ['cottage'] }])
    const session = openReviewedMutation({
      db,
      table: 'plants',
      onCurated: 'retire',
    })
    const text = formatReport(await session.apply([intent()]), {
      reJudgeWith: 'curate-editorial --ids p1',
    })
    expect(text).toContain('1 row(s) lost an editorial verdict')
    expect(text).toContain('Salvia nemorosa')
    expect(text).toContain('curate-editorial --ids p1')
  })
})

describe('the provenance seam', () => {
  it('reports every written id to the run handle, and only written ones', async () => {
    const db = fakeDb([
      { id: 'p1', is_curated: false, style_tags: ['cottage'] },
      { id: 'p2', is_curated: false, style_tags: ['modern'] }, // drifted
    ])
    const session = openReviewedMutation({
      db,
      table: 'plants',
      onCurated: 'skip',
    })

    const wrote: string[] = []
    const report = await session.apply(
      [intent(), intent({ id: 'p2', label: 'Nepeta racemosa' })],
      { wrote: (id) => wrote.push(id) }
    )

    expect(wrote).toEqual(['p1'])
    expect(report.skipped_drift).toBe(1)
  })

  it('issues no update and calls no run handle on a dry run', async () => {
    const db = fakeDb([
      { id: 'p1', is_curated: false, style_tags: ['cottage'] },
    ])
    const session = openReviewedMutation({
      db,
      table: 'plants',
      onCurated: 'skip',
      dryRun: true,
    })
    const wrote: string[] = []
    const report = await session.apply([intent()], {
      wrote: (id) => wrote.push(id),
    })

    expect(report.written).toBe(1)
    expect(db.updates).toBe(0)
    expect(wrote).toEqual([])
  })
})

describe('validation', () => {
  const db = fakeDb([{ id: 'p1', is_curated: false, style_tags: ['cottage'] }])
  const session = openReviewedMutation({
    db,
    table: 'plants',
    onCurated: 'skip',
  })

  it('refuses an intent with no reasoning', async () => {
    await expect(session.apply([intent({ why: '  ' })])).rejects.toThrow(
      /no `why`/
    )
  })

  it('refuses a written column with no expected prior value', async () => {
    await expect(
      session.apply([intent({ from: {}, to: { style_tags: ['prairie'] } })])
    ).rejects.toThrow(/without an expected prior value/)
  })

  it('refuses an entry that does nothing', async () => {
    await expect(
      session.apply([
        intent({ from: { style_tags: ['x'] }, to: { style_tags: ['x'] } }),
      ])
    ).rejects.toThrow(/does nothing/)
  })
})
