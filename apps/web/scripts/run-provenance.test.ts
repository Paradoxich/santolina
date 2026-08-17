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
 *
 * TRAP 28, both halves, in the last describe block: a stamp can only witness a
 * write that SET it, on every row counted. A cleared stamp matches no window and
 * a conditionally-set one covers a subset, so in both cases the default witness
 * makes a CORRECT run record `contradicted` — the mechanism accusing itself.
 * The witness asserted is `verification.substantiation`, the field that carries
 * the accusation, and the DEFECT is asserted alongside the fix: a clearing run
 * left on the default must keep failing that way, or `invariants:check` shape 12
 * is guarding nothing. The conditional cases use curate-plants' real write-set,
 * because that is where the live instance was — merged, reviewed and cited as
 * the pattern, a day before writing this found it.
 *
 * TRAP 29, in the block after it: a timestamp window is coincidence, not
 * authorship. Two overlapping invocations of one stamp-writing step each query a
 * window holding BOTH sets of stamps, so the old `count >= rowCount` test let
 * both record `confirmed` for work neither did. `confirmed` requires
 * ESTABLISHED exclusivity, and that block asserts that claiming it without a
 * mechanism does not buy it back.
 *
 * The mechanism arrived 2026-08-17 and is in the LAST block: a per-column row
 * lock (`public.stamp_locks`), taken in `beginRun` and re-verified at
 * finalisation rather than remembered. It could not have been built earlier for
 * the reason the trap itself gives — a lock cannot bind a script that does not
 * take it, and six writers were still off run provenance.
 * `RUNS_WITHOUT_PROVENANCE` reached zero that same morning, which is what made
 * the lock mean something instead of licensing a claim it could not keep.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  beginRun,
  defaultEvidence,
  isWindowQueryable,
  recipeHash,
  withRunRecord,
  type Exclusivity,
  type LockClient,
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
      // No database in a unit test. Every case that cares about exclusivity
      // passes its own locks; the default here is "locking is off", which is
      // what every run recorded before 2026-08-17 and keeps these cases
      // asserting what they were written to assert.
      lockPolicy: 'none' as const,
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
    expect(h.written[0]!.verification.substantiation).toBe('corroborated')
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
    expect(rec.verification.substantiation).toBe('corroborated')
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
      // No database in a unit test. Every case that cares about exclusivity
      // passes its own locks; the default here is "locking is off", which is
      // what every run recorded before 2026-08-17 and keeps these cases
      // asserting what they were written to assert.
      lockPolicy: 'none' as const,
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
    expect(rec.verification.substantiation).toBe('corroborated')
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
      // No database in a unit test. Every case that cares about exclusivity
      // passes its own locks; the default here is "locking is off", which is
      // what every run recorded before 2026-08-17 and keeps these cases
      // asserting what they were written to assert.
      lockPolicy: 'none' as const,
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
      // No database in a unit test. Every case that cares about exclusivity
      // passes its own locks; the default here is "locking is off", which is
      // what every run recorded before 2026-08-17 and keeps these cases
      // asserting what they were written to assert.
      lockPolicy: 'none' as const,
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
      // No database in a unit test. Every case that cares about exclusivity
      // passes its own locks; the default here is "locking is off", which is
      // what every run recorded before 2026-08-17 and keeps these cases
      // asserting what they were written to assert.
      lockPolicy: 'none' as const,
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
      // No database in a unit test. Every case that cares about exclusivity
      // passes its own locks; the default here is "locking is off", which is
      // what every run recorded before 2026-08-17 and keeps these cases
      // asserting what they were written to assert.
      lockPolicy: 'none' as const,
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
      // No database in a unit test. Every case that cares about exclusivity
      // passes its own locks; the default here is "locking is off", which is
      // what every run recorded before 2026-08-17 and keeps these cases
      // asserting what they were written to assert.
      lockPolicy: 'none' as const,
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

/**
 * TRAP 28, both halves: a stamp can only witness a write that SET it, on every
 * row counted. The failure mode is a CORRECT run recording `contradicted` —
 * the mechanism accusing itself — so the assertions below are on
 * `substantiation`, which is the field that carries the accusation.
 */
describe('trap 28: a stamp witnesses only a write that set it', () => {
  const withEvidence = (
    writeSet: string[],
    observed: Record<string, number>,
    evidence?: Witness[]
  ) => {
    const h = harness(observed)
    const run = beginRun({
      step: 'cross-check-native-to --apply',
      writeSet,
      ...(evidence ? { evidence } : {}),
      recipe: RECIPE,
      ...h.opts,
    })
    return { run, written: h.written }
  }

  it('the DEFAULT witness accuses a correct clearing run of lying', async () => {
    // THE TRAP. --apply nulls native_checked_at on 20 rows and does it
    // correctly. Left on the default, the column witnesses itself: a nulled row
    // matches no window, so the count is 0 against a claim of 20.
    //
    // This asserts the DEFECT, not the fix — it is what shape 12 exists to stop
    // anyone writing, and it must keep failing this way for the guard to be
    // worth having.
    const { run } = withEvidence(['native_checked_at'], {
      native_checked_at: 0,
    })
    wrote(run, 20)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('contradicted')
    expect(rec.verification.notes.join(' ')).toMatch(
      /claim is larger than its evidence/
    )
  })

  it('a bounding witness records the same clearing run honestly', async () => {
    // The fix: updated_at establishes rows moved without attributing the moves
    // to this run, which is all the evidence supports and is not an accusation.
    const { run } = withEvidence(['native_checked_at'], { updated_at: 20 }, [
      {
        kind: 'row-touched',
        covers: 'native_checked_at',
        table: 'plants',
        column: 'updated_at',
      },
    ])
    wrote(run, 20)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('bounded')
  })

  it('the default IS right for a stamp the run sets, so the fix is not "never default"', async () => {
    // Stated as its own case because the cheap over-correction — make every
    // witness bounding — would throw away the only evidence that can confirm
    // anything, and every record in the log would read `bounded` forever.
    const { run } = withEvidence(['native_checked_at'], {
      native_checked_at: 20,
    })
    wrote(run, 20)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('corroborated')
  })

  /**
   * The second half, on the invocation that actually had it: curate-plants,
   * which was called correct for a day. Its write-set is real and so are the
   * numbers — `ai_drafted_at` is written on every row, while `style_checked_at`
   * and `greenery_checked_at` are guarded by their own stamp in buildPatch, so
   * a run over a mix of already-judged and never-judged rows moves them on a
   * SUBSET.
   *
   * Not scannable: whether a column is written on every row is a control-flow
   * question, the same limit shape 10 is worded around. This is the only place
   * the rule is executable.
   */
  const CURATE_PLANTS_WRITE_SET = [
    'ai_drafted_at',
    'style_checked_at',
    'greenery_checked_at',
  ]

  it('a CONDITIONALLY set stamp undercounts the run, and that reads as a lie too', async () => {
    // 25 rows drafted; 10 of them already carried a style verdict, so only 15
    // style stamps moved. Left on the default, all three are confirming and the
    // run accuses itself.
    const { run } = withEvidence(
      CURATE_PLANTS_WRITE_SET,
      { ai_drafted_at: 25, style_checked_at: 15, greenery_checked_at: 15 },
      defaultEvidence(CURATE_PLANTS_WRITE_SET)
    )
    wrote(run, 25)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('contradicted')
    expect(rec.verification.observed.style_checked_at).toBe(15)
  })

  it('the same run records `confirmed` once the conditional stamps only bound it', async () => {
    // The fix now in curate-plants: the unconditional stamp confirms, the two
    // guarded ones bound. Same run, same numbers, no accusation.
    const { run } = withEvidence(
      CURATE_PLANTS_WRITE_SET,
      { ai_drafted_at: 25, updated_at: 25 },
      [
        { kind: 'stamp', covers: 'ai_drafted_at', column: 'ai_drafted_at' },
        {
          kind: 'row-touched',
          covers: 'style_checked_at',
          table: 'plants',
          column: 'updated_at',
        },
        {
          kind: 'row-touched',
          covers: 'greenery_checked_at',
          table: 'plants',
          column: 'updated_at',
        },
      ]
    )
    wrote(run, 25)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('corroborated')
  })
})

/**
 * TRAP 29: a timestamp window is coincidence, not authorship. Two invocations of
 * one stamp-writing step overlap — the normal operating model here, parallel
 * worktrees against one production database with no lock — and each queries a
 * window containing BOTH sets of stamps.
 */
describe('trap 29: overlapping runs cannot confirm each other apart', () => {
  /** A and B each stamp 20 rows; both windows see all 40. */
  const overlapping = (observed: number, exclusivity?: Exclusivity) => {
    const h = harness({ botanical_checked_at: observed })
    const run = beginRun({
      step: 'cross-check-plants',
      writeSet: ['botanical_checked_at'],
      recipe: RECIPE,
      ...(exclusivity ? { exclusivity } : {}),
      ...h.opts,
    })
    return { run, written: h.written }
  }

  it('neither overlapping run claims the other run stamps as confirmation', async () => {
    // THE DEFECT. Before this, `count >= rowCount` was the whole test, so run A
    // claiming 20 against a window holding A's 20 and B's 20 satisfied it and
    // recorded `confirmed`. Both runs could do it. Neither produced the 40.
    const a = overlapping(40)
    wrote(a.run, 20)
    const recA = await a.run.finish('completed')

    const b = overlapping(40)
    wrote(b.run, 20)
    const recB = await b.run.finish('completed')

    expect(recA.verification.substantiation).toBe('corroborated')
    expect(recB.verification.substantiation).toBe('corroborated')
    expect(recA.verification.substantiation).not.toBe('confirmed')
  })

  it('records WHY it could not confirm, so the record is readable without this file', async () => {
    const { run } = overlapping(40)
    wrote(run, 20)
    const rec = await run.finish('completed')
    expect(rec.verification.exclusivity.kind).toBe('none')
    expect(rec.verification.notes.join(' ')).toMatch(
      /corroborating, not confirming/
    )
  })

  it('still contradicts a claim larger than its evidence', async () => {
    // The half worth keeping without exclusivity. A concurrent CLEARER could in
    // principle drive this too, but a false alarm sends a person to look, while
    // a false `confirmed` is a silent lie in a record someone will cite.
    const { run } = overlapping(15)
    wrote(run, 20)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('contradicted')
  })

  it('confirmation is reachable only by ESTABLISHING exclusivity, never by asserting it', async () => {
    // Nothing in the pipeline can produce this today — there is no lock, and
    // `Exclusivity` has one variant. The case exists so that whoever adds the
    // lock has the assertion waiting, and so that the downgrade cannot be
    // quietly undone by widening the default.
    const { run } = overlapping(20, {
      kind: 'none',
      reason: 'a reason string is not a mechanism',
    })
    wrote(run, 20)
    const rec = await run.finish('completed')
    expect(rec.verification.substantiation).toBe('corroborated')
  })
})

/**
 * Per-column exclusivity — TRAP 29's second half, added 2026-08-17.
 *
 * The trap's own entry says what was owed: "A per-step lock would not have
 * fixed it... exclusivity has to be per-COLUMN across every writer. And six of
 * those writers are among the 16 passes not yet on run provenance, so a lock
 * added today would not bind them: it would fail to lock while licensing
 * `confirmed`. Wire the writers first, then the lock means something."
 *
 * The writers were wired the same day — `RUNS_WITHOUT_PROVENANCE` reached zero
 * — so a lock taken in `beginRun` now binds every script that writes a stamp.
 * That is the precondition, and it is why these cases could not have been
 * written a week ago.
 *
 * WHAT MUST STAY TRUE, and each has a case below:
 *   · holding the lock is what upgrades a stamp to `confirming`
 *   · a lock LOST mid-run downgrades, and is re-checked rather than remembered
 *   · a refusal names the holder, because "locked" with no owner is unactionable
 *   · a refused run releases what it already took
 *   · only window-queryable members are locked at all
 */
describe('per-column exclusivity', () => {
  const lockClient = (over: Partial<LockClient> = {}): LockClient => ({
    acquire: async () => ({
      acquired: true,
      holder_run_id: null,
      holder_step: null,
      holder_expires_at: null,
    }),
    holds: async () => true,
    release: async () => {},
    ...over,
  })

  it('earns confirming when the lock is held throughout', async () => {
    const h = harness({ native_checked_at: 279 })
    const run = beginRun({
      step: 'cross-check-native-to',
      writeSet: ['native_checked_at'],
      recipe: RECIPE,
      ...h.opts,
      lockPolicy: 'lock',
      locks: lockClient(),
    })
    await run.claimExclusivity()
    wrote(run, 279)
    await run.finish('completed')

    const record = h.written[0]!
    expect(record.verification.exclusivity).toEqual({
      kind: 'locked',
      columns: ['native_checked_at'],
    })
    expect(record.verification.substantiation).toBe('confirmed')
  })

  it('downgrades to corroborated when the lock was lost before the end', async () => {
    // The SIGKILL-elsewhere case, and the pass that outlives its TTL. A run
    // cannot detect this from a boolean it set at the start, which is why the
    // check is a question asked at finalisation.
    const h = harness({ native_checked_at: 279 })
    const run = beginRun({
      step: 'cross-check-native-to',
      writeSet: ['native_checked_at'],
      recipe: RECIPE,
      ...h.opts,
      lockPolicy: 'lock',
      locks: lockClient({ holds: async () => false }),
    })
    await run.claimExclusivity()
    wrote(run, 279)
    await run.finish('completed')

    const record = h.written[0]!
    expect(record.verification.exclusivity.kind).toBe('none')
    expect(record.verification.substantiation).toBe('corroborated')
    expect(record.verification.notes.join(' ')).toContain(
      'exclusivity DOWNGRADED'
    )
  })

  it('treats a failed lock CHECK as lost, never as held', async () => {
    // A database error at finalisation must not read as exclusivity. The safe
    // direction is the quiet claim losing, not the loud one.
    const h = harness({ native_checked_at: 279 })
    const run = beginRun({
      step: 'cross-check-native-to',
      writeSet: ['native_checked_at'],
      recipe: RECIPE,
      ...h.opts,
      lockPolicy: 'lock',
      locks: lockClient({
        holds: async () => {
          throw new Error('connection reset')
        },
      }),
    })
    await run.claimExclusivity()
    wrote(run, 279)
    await run.finish('completed')

    expect(h.written[0]!.verification.exclusivity.kind).toBe('none')
  })

  it('refuses to start and names the holder', async () => {
    const h = harness({})
    const run = beginRun({
      step: 'curate-plants',
      writeSet: ['native_checked_at'],
      recipe: RECIPE,
      ...h.opts,
      lockPolicy: 'lock',
      locks: lockClient({
        acquire: async () => ({
          acquired: false,
          holder_run_id: 'cross-check-native-to-2026-abc',
          holder_step: 'cross-check-native-to',
          holder_expires_at: '2026-08-17T23:00:00.000Z',
        }),
      }),
    })
    await expect(run.claimExclusivity()).rejects.toThrow(
      /cross-check-native-to-2026-abc/
    )
    // And no record is filed: nothing was written, so an optimistic record
    // would describe an invocation that never started.
    expect(h.written).toHaveLength(0)
  })

  it('releases what it already took when a later column is refused', async () => {
    // Otherwise a run that cannot be exclusive sits on locks that block the
    // run that can.
    const released: string[] = []
    const h = harness({})
    const run = beginRun({
      step: 'curate-plants',
      writeSet: ['native_checked_at', 'style_checked_at'],
      recipe: RECIPE,
      ...h.opts,
      lockPolicy: 'lock',
      locks: lockClient({
        acquire: async (column) =>
          column === 'native_checked_at'
            ? {
                acquired: true,
                holder_run_id: null,
                holder_step: null,
                holder_expires_at: null,
              }
            : {
                acquired: false,
                holder_run_id: 'other-run',
                holder_step: 'curate-styles',
                holder_expires_at: '2026-08-17T23:00:00.000Z',
              },
        release: async (column) => {
          released.push(column)
        },
      }),
    })
    await expect(run.claimExclusivity()).rejects.toThrow(/other-run/)
    expect(released).toEqual(['native_checked_at'])
  })

  it('locks only window-queryable members, never value columns', async () => {
    // Locking `style_tags` would serialise runs to buy evidence that column can
    // never supply — it is bounded by updated_at whatever happens.
    const asked: string[] = []
    const h = harness({ style_checked_at: 3 })
    const run = beginRun({
      step: 'curate-styles',
      writeSet: ['style_tags', 'style_checked_at'],
      evidence: [
        {
          kind: 'stamp',
          covers: 'style_checked_at',
          column: 'style_checked_at',
        },
        {
          kind: 'row-touched',
          covers: 'style_tags',
          table: 'plants',
          column: 'updated_at',
        },
      ],
      recipe: RECIPE,
      ...h.opts,
      lockPolicy: 'lock',
      locks: lockClient({
        acquire: async (column) => {
          asked.push(column)
          return {
            acquired: true,
            holder_run_id: null,
            holder_step: null,
            holder_expires_at: null,
          }
        },
      }),
    })
    await run.claimExclusivity()
    wrote(run, 3)
    await run.finish('completed')
    expect(asked).toEqual(['style_checked_at'])
  })
})
