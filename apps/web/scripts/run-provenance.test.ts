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
  recipeHash,
  withRunRecord,
  type RunRecord,
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
      countRows: async (column: string) => observed[column] ?? 0,
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
        run.countWritten(25)
      }
    )
    expect(h.written).toHaveLength(1)
    expect(h.written[0]!.outcome).toBe('completed')
    expect(h.written[0]!.row_count).toBe(25)
    expect(h.written[0]!.verification.agrees).toBe(true)
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
          run.countWritten(4)
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
    run.countWritten(279)
    await run.finish('interrupted', { error: 'received SIGINT' })

    const rec = h.written[0]!
    expect(rec.outcome).toBe('interrupted')
    expect(rec.row_count).toBe(279)
    expect(rec.verification.agrees).toBe(true)
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
    first.countWritten(279)
    await first.finish('interrupted')

    const h2 = harness({ native_checked_at: 215 })
    const second = beginRun({
      step: 'cross-check-native-to',
      writeSet: ['native_checked_at'],
      recipe: RECIPE,
      ...h2.opts,
    })
    second.countWritten(215)
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
    run.countWritten(25)
    const rec = await run.finish('completed')
    expect(rec.verification.agrees).toBe(false)
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
    expect(rec.verification.agrees).toBe(false)
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
    run.countWritten(25)
    const rec = await run.finish('completed')
    expect(rec.verification.agrees).toBe(true)
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
    run.countWritten(2)
    const rec = await run.finish('completed')
    expect(rec.verification.checked).toBe(false)
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
