/**
 * Write provenance, pinned at the two properties the whole scheme rests on:
 * every invocation produces a record, and a record never claims more than
 * happened.
 *
 * The ugly paths are the point. A run killed at row 279 of 494 is not an edge
 * case in this pipeline — steps are resumable by design and one guard has
 * actually been killed there. If an interrupted invocation left no record, the
 * resumable steps would punch a hole in provenance every time someone hit
 * Ctrl-C, which is precisely where intent cannot reconstruct the answer later.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  beginRun,
  defaultEvidence,
  isWindowQueryable,
  recipeHash,
  withRunRecord,
  type RunRecord,
  type Witness,
} from './run-provenance'

/** A harness with no filesystem, no database and no signal handlers. */
const harness = (observed: Record<string, number> = {}) => {
  const written: RunRecord[] = []
  let tick = 0
  const times = [
    '2026-08-16T10:00:00.000Z',
    '2026-08-16T10:05:00.000Z',
    '2026-08-16T10:10:00.000Z',
  ]
  return {
    written,
    opts: {
      now: () => times[Math.min(tick++, times.length - 1)]!,
      countRows: async (witness: Witness) =>
        observed['column' in witness ? witness.column : witness.covers] ?? 0,
      append: (r: RunRecord) => {
        written.push(r)
        return `/runs/2026-08.jsonl`
      },
      log: () => {},
      trapSignals: false,
    },
  }
}

const RECIPE = { model: 'claude-sonnet-4-5', template: 'draft the fields' }

/** Record n distinct rows. row_count is distinct ids, never a call count. */
const wrote = (run: { wrote: (id: string) => void }, n: number) => {
  for (let i = 0; i < n; i++) run.wrote(`row-${i}`)
}

describe('the recipe hash', () => {
  it('is stable across key order, because the input is canonicalised', () => {
    const a = recipeHash({
      model: 'm',
      template: 't',
      ingredients: { vocab: ['a', 'b'], standard: 'x' },
    })
    const b = recipeHash({
      template: 't',
      ingredients: { standard: 'x', vocab: ['a', 'b'] },
      model: 'm',
    })
    expect(a).toBe(b)
  })

  it('changes when the embedded vocabulary changes, not just the template', () => {
    // The July case: the region vocabulary was replaced wholesale while the
    // prompt template held still. A hash over the template alone would have
    // been blind to exactly the change that should invalidate a cohort.
    const before = recipeHash({
      template: 'classify the range',
      ingredients: { regions: ['mediterranean', 'balkans', 'croatia'] },
    })
    const after = recipeHash({
      template: 'classify the range',
      ingredients: { regions: ['Southeastern Europe', 'Southwestern Europe'] },
    })
    expect(before).not.toBe(after)
  })

  it('changes when a decoding parameter appears, with no code change needed', () => {
    // "Nothing sets temperature today" is not a stable contract.
    const plain = recipeHash({ model: 'm', template: 't' })
    const warmed = recipeHash({
      model: 'm',
      template: 't',
      decoding: { temperature: 0.2 },
    })
    expect(plain).not.toBe(warmed)
  })

  it('does not change when only the per-row subject would differ', () => {
    // Subject and evidence are excluded by construction: including them would
    // give one hash per plant and destroy the cohort identity.
    expect(recipeHash({ model: 'm', template: 't' })).toBe(
      recipeHash({ model: 'm', template: 't' })
    )
  })
})

describe('every invocation produces a record', () => {
  it('records a completed run with its verified count', async () => {
    const h = harness({ style_checked_at: 25 })
    await withRunRecord(
      {
        step: 'curate-plants',
        writeSet: ['style_checked_at'],
        recipe: RECIPE,
        ...h.opts,
      },
      async (run) => {
        wrote(run, 25)
      }
    )
    expect(h.written).toHaveLength(1)
    expect(h.written[0]!.outcome).toBe('completed')
    expect(h.written[0]!.row_count).toBe(25)
    expect(h.written[0]!.verification.substantiation).toBe('confirmed')
  })

  it('records a FAILED run and re-throws, so the exit code is unchanged', async () => {
    const h = harness({ style_checked_at: 4 })
    await expect(
      withRunRecord(
        {
          step: 'curate-plants',
          writeSet: ['style_checked_at'],
          recipe: RECIPE,
          ...h.opts,
        },
        async (run) => {
          wrote(run, 4)
          throw new Error('API 429 at row 400')
        }
      )
    ).rejects.toThrow('API 429 at row 400')

    expect(h.written).toHaveLength(1)
    expect(h.written[0]!.outcome).toBe('failed')
    expect(h.written[0]!.error).toBe('API 429 at row 400')
    // The honest count is what it got through, never the intended scope.
    expect(h.written[0]!.row_count).toBe(4)
  })

  it('records an INTERRUPTED run truthfully — 279 of 494, not 494', async () => {
    const h = harness({ native_checked_at: 279 })
    const run = beginRun({
      step: 'cross-check-native-to',
      writeSet: ['native_checked_at'],
      recipe: RECIPE,
      ...h.opts,
    })
    wrote(run, 279)
    await run.finish('interrupted', { error: 'received SIGINT' })

    const rec = h.written[0]!
    expect(rec.outcome).toBe('interrupted')
    expect(rec.row_count).toBe(279)
    expect(rec.verification.substantiation).toBe('confirmed')
  })

  it('gives two invocations in the SAME millisecond different ids', async () => {
    // The id is an identity, not a label derived from step + instant + recipe.
    // The first version of beginRun derived it, and this assertion failed on
    // its first run — which is the collision that overlapping invocations
    // would produce in practice, since nothing serialises runs here.
    const frozen = {
      now: () => '2026-08-16T10:00:00.000Z',
      countRows: async () => 0,
      append: () => '/runs/2026-08.jsonl',
      log: () => {},
      trapSignals: false,
    }
    const one = {
      step: 'curate-plants',
      writeSet: ['style_checked_at'],
      recipe: RECIPE,
      ...frozen,
    }
    const a = beginRun(one)
    const b = beginRun(one)
    expect(a.startedAt).toBe(b.startedAt) // same instant...
    expect(a.runId).not.toBe(b.runId) // ...different identity
  })

  it('gives a resumed invocation its own run id', async () => {
    // A resumed run may have a different recipe, so one id spanning both halves
    // would be a lie. Two records, two ids, two honest counts.
    const h1 = harness({ native_checked_at: 279 })
    const first = beginRun({
      step: 'cross-check-native-to',
      writeSet: ['native_checked_at'],
      recipe: RECIPE,
      ...h1.opts,
    })
    wrote(first, 279)
    await first.finish('interrupted')

    const h2 = harness({ native_checked_at: 215 })
    const second = beginRun({
      step: 'cross-check-native-to',
      writeSet: ['native_checked_at'],
      recipe: RECIPE,
      ...h2.opts,
    })
    for (let i = 0; i < 215; i++) second.wrote(`resumed-${i}`)
    await second.finish('completed')

    expect(h1.written[0]!.run_id).not.toBe(h2.written[0]!.run_id)
    expect(h1.written[0]!.row_count + h2.written[0]!.row_count).toBe(494)
  })
})

describe('a record never claims more than its evidence', () => {
  it('flags a claim larger than the observed stamps', async () => {
    const h = harness({ style_checked_at: 3 })
    const run = beginRun({
      step: 'curate-plants',
      writeSet: ['style_checked_at'],
      recipe: RECIPE,
      ...h.opts,
    })
    wrote(run, 25)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('contradicted')
    expect(rec.verification.notes.join(' ')).toContain(
      'larger than its evidence'
    )
  })

  it('flags stamps moving while the run claims it wrote nothing', async () => {
    const h = harness({ style_checked_at: 7 })
    const run = beginRun({
      step: 'curate-plants',
      writeSet: ['style_checked_at'],
      recipe: RECIPE,
      ...h.opts,
    })
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('contradicted')
    expect(rec.verification.notes.join(' ')).toContain('claimed 0 rows')
  })

  it('tolerates a column showing MORE than this run wrote', async () => {
    // Overlapping invocations are a normal operating condition here: no global
    // lock, and worktrees encourage parallel sessions against one database. So
    // extra movement in the window is not evidence against this run's claim.
    const h = harness({ style_checked_at: 60 })
    const run = beginRun({
      step: 'curate-plants',
      writeSet: ['style_checked_at'],
      recipe: RECIPE,
      ...h.opts,
    })
    wrote(run, 25)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('confirmed')
  })

  it('records that verification could not run, rather than claiming it agreed', async () => {
    const written: RunRecord[] = []
    const run = beginRun({
      step: 'curate-plants',
      writeSet: ['style_checked_at'],
      recipe: RECIPE,
      now: () => '2026-08-16T10:00:00.000Z',
      countRows: async () => {
        throw new Error('no database in this environment')
      },
      append: (r) => {
        written.push(r)
        return '/runs/2026-08.jsonl'
      },
      log: () => {},
      trapSignals: false,
    })
    wrote(run, 2)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('unverified')
    expect(rec.verification.notes.join(' ')).toContain('could not observe')
  })
})

describe('the write-set is declared, never inferred', () => {
  it('refuses an empty write-set', () => {
    expect(() =>
      beginRun({
        step: 'curate-plants',
        writeSet: [],
        recipe: RECIPE,
        trapSignals: false,
      })
    ).toThrow('empty write-set')
  })

  it('records the declared columns, sorted, whatever the caller passed', async () => {
    const h = harness()
    const run = beginRun({
      step: 'curate-plants',
      writeSet: ['style_checked_at', 'ai_drafted_at', 'greenery_checked_at'],
      recipe: RECIPE,
      ...h.opts,
    })
    const rec = await run.finish('completed')
    expect(rec.write_set).toEqual([
      'ai_drafted_at',
      'greenery_checked_at',
      'style_checked_at',
    ])
  })
})

describe('declared mutation is not the same thing as verification evidence', () => {
  it('refuses a value column with no witness, at beginRun rather than at finish', () => {
    // The bug this replaced: seasonal_care in the write-set was "verified" by
    // comparing a jsonb column to an instant, which returns count=null with an
    // empty error message — verification that quietly stops working and reads
    // like bad luck. Failing here makes it a programming error instead.
    expect(() =>
      beginRun({
        step: 'curate-seasonal-care',
        writeSet: ['seasonal_care'],
        recipe: RECIPE,
        trapSignals: false,
      })
    ).toThrow('no evidence witness')
  })

  it('accepts a value column witnessed by the row-touched timestamp', async () => {
    const observed: Record<string, number> = { updated_at: 25 }
    const written: RunRecord[] = []
    const run = beginRun({
      step: 'curate-seasonal-care',
      writeSet: ['seasonal_care'],
      evidence: [
        {
          kind: 'row-touched',
          covers: 'seasonal_care',
          table: 'plants',
          column: 'updated_at',
        },
      ],
      recipe: RECIPE,
      now: () => '2026-08-16T10:00:00.000Z',
      countRows: async (w: Witness) =>
        observed['column' in w ? w.column : w.covers] ?? 0,
      append: (r) => {
        written.push(r)
        return '/runs/2026-08.jsonl'
      },
      log: () => {},
      trapSignals: false,
    })
    wrote(run, 25)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('bounded')
    // Keyed by what it covers — the thing claimed — not by what was queried.
    expect(rec.verification.observed['seasonal_care']).toBe(25)
    expect(rec.evidence[0]).toMatchObject({ column: 'updated_at' })
  })

  it('witnesses a different table, for a step that never touches plants', async () => {
    // curate-combinations writes plant_combinations, whose rows carry created_at
    // and are inserted rather than updated.
    const observed: Record<string, number> = { created_at: 60 }
    const run = beginRun({
      step: 'curate-combinations',
      writeSet: ['plant_combinations'],
      evidence: [
        {
          kind: 'row-touched',
          covers: 'plant_combinations',
          table: 'plant_combinations',
          column: 'created_at',
        },
      ],
      recipe: RECIPE,
      now: () => '2026-08-16T10:00:00.000Z',
      countRows: async (w: Witness) =>
        observed['column' in w ? w.column : w.covers] ?? 0,
      append: () => '/runs/2026-08.jsonl',
      log: () => {},
      trapSignals: false,
    })
    wrote(run, 60)
    const rec = await run.finish('completed')
    // BOUNDED, not confirmed: created_at says 60 rows appeared in the window and
    // cannot say this invocation put them there.
    expect(rec.verification.substantiation).toBe('bounded')
    expect(rec.evidence[0]).toMatchObject({ table: 'plant_combinations' })
    expect(rec.verification.notes.join(' ')).toContain('cannot be attributed')
  })

  it('records "unverified" rather than "agreed" when nothing is observable', async () => {
    const run = beginRun({
      step: 'apply-something',
      writeSet: ['native_region'],
      evidence: [
        {
          kind: 'none',
          covers: 'native_region',
          reason: 'text[], no own timestamp',
        },
      ],
      recipe: RECIPE,
      now: () => '2026-08-16T10:00:00.000Z',
      countRows: async () => 0,
      append: () => '/runs/2026-08.jsonl',
      log: () => {},
      trapSignals: false,
    })
    wrote(run, 4)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('unverified')
    expect(rec.verification.notes.join(' ')).toContain('recorded unverified')
  })

  it('derives stamp witnesses from the write-set, so a stamp pass declares nothing extra', () => {
    expect(defaultEvidence(['ai_drafted_at', 'style_checked_at'])).toEqual([
      { kind: 'stamp', covers: 'ai_drafted_at', column: 'ai_drafted_at' },
      { kind: 'stamp', covers: 'style_checked_at', column: 'style_checked_at' },
    ])
    // ai_drafted_at is window-queryable here and deliberately NOT a "stamp" in
    // stamp-columns.ts, where the question is the column's role, not its type.
    expect(isWindowQueryable('ai_drafted_at')).toBe(true)
    expect(isWindowQueryable('seasonal_care')).toBe(false)
  })
})

describe('a bounding witness can neither confirm nor contradict', () => {
  const bounded = (observed: number) => {
    const written: RunRecord[] = []
    const run = beginRun({
      step: 'curate-seasonal-care',
      writeSet: ['seasonal_care'],
      evidence: [
        {
          kind: 'row-touched',
          covers: 'seasonal_care',
          table: 'plants',
          column: 'updated_at',
        },
      ],
      recipe: RECIPE,
      now: () => '2026-08-16T10:00:00.000Z',
      countRows: async () => observed,
      append: (r) => {
        written.push(r)
        return '/runs/2026-08.jsonl'
      },
      log: () => {},
      trapSignals: false,
    })
    return { run, written }
  }

  it('does not report agreement when unrelated rows moved in the window', async () => {
    // The claim is 20. Another process touched 50 unrelated rows in the same
    // window. observed >= claimed, and the old code called that agreement — but
    // updated_at cannot attribute a single one of those touches to this run.
    const { run } = bounded(50)
    wrote(run, 20)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('bounded')
    expect(rec.verification.substantiation).not.toBe('confirmed')
  })

  it('does not contradict when it observes fewer rows than claimed', async () => {
    // A bounding witness legitimately sees fewer: it reports rows, not writes.
    const { run } = bounded(3)
    wrote(run, 20)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('bounded')
  })

  it('counts a row written twice once, so the count stays comparable', async () => {
    const { run } = bounded(1)
    run.wrote('plant-1')
    run.wrote('plant-1')
    const rec = await run.finish('completed')
    // Two writes, one row. Counting calls would have claimed 2 against evidence
    // that can only ever be 1, and a confirming witness would have called that a
    // contradiction.
    expect(rec.row_count).toBe(1)
  })
})
