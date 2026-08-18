/**
 * The price table, pinned at the property that makes the report trustworthy:
 * an unpriced model returns NULL, never 0.
 *
 * TRAP 37, the scope half, is pinned at the foot: a round is attributed by a
 * STRING MATCH on each run's scope, so a step that writes something else —
 * `pick-plant-images` wrote its batch id — vanishes from the round's cost
 * without a word. `unattributedInWindow` bounds the question to the round's own
 * window, where the miss is a short list instead of noise. The metering half is
 * in run-provenance.test.ts.
 *
 * WHY THAT IS THE ONE TO PIN. `pnpm runs:cost` exists to answer "what did this
 * round cost" with a number somebody will budget against. Every way that number
 * can be wrong is a way of turning a missing measurement into a confident one —
 * the same shape as trap 1, where a rate-limited fetch degraded into data that
 * looked like an answer. A model absent from the table costing $0.00 would be
 * exactly that: silently complete-looking, and understated by however much the
 * new model actually costs. So `priceOf` returns null and the caller reports it
 * under a loud heading, which is what these cases hold it to.
 *
 * The rates themselves are quoted in the script's header with their source and
 * the date they were read. These cases pin the ARITHMETIC and the SHAPE, not
 * the prices — a price change is a legitimate edit that should not fail a test,
 * while pricing batch at sync rates never is.
 */
import { describe, expect, it } from 'vitest'

import {
  PRICES,
  priceOf,
  scopeNamesRound,
  unattributedInWindow,
} from './report-run-costs'
import type { RunRecord } from './run-provenance'

const totals = (over: Partial<Parameters<typeof priceOf>[1]> = {}) => ({
  calls: 1,
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  ...over,
})

describe('an unpriced model is not a free model', () => {
  it('returns null for a model the table does not know', () => {
    expect(
      priceOf('claude-opus-5:sync', totals({ input_tokens: 1_000_000 }))
    ).toBeNull()
  })

  it('returns null rather than 0, so a caller cannot sum it away', () => {
    // The distinction the whole report rests on. `?? 0` at a call site would
    // reintroduce the defect, which is why the caller branches on null instead.
    const price = priceOf('claude-haiku-4-5:sync', totals())
    expect(price).not.toBe(0)
    expect(price).toBeNull()
  })

  it('treats an unknown MODE of a known model as unpriced too', () => {
    // Batch bills at half rate. A model priced for sync must not answer for a
    // mode nobody entered a rate for — that would be a 2x error in the
    // confident direction.
    expect(priceOf('claude-sonnet-4-5:priority', totals())).toBeNull()
  })
})

describe('the arithmetic', () => {
  it('prices a million input tokens at the table rate', () => {
    expect(
      priceOf('claude-sonnet-4-5:sync', totals({ input_tokens: 1_000_000 }))
    ).toBeCloseTo(PRICES['claude-sonnet-4-5:sync']!.input, 10)
  })

  it('sums all four token classes, not just input and output', () => {
    // Cache reads are a tenth of input and cache writes are 1.25x; a report
    // that ignored them would understate a cached pass.
    const rate = PRICES['claude-sonnet-4-5:sync']!
    const price = priceOf(
      'claude-sonnet-4-5:sync',
      totals({
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
      })
    )
    expect(price).toBeCloseTo(
      rate.input + rate.output + rate.cache_write + rate.cache_read,
      10
    )
  })

  it('charges nothing for a run that spent no tokens', () => {
    expect(priceOf('claude-sonnet-4-5:sync', totals())).toBe(0)
  })
})

describe('the table shape', () => {
  it('prices batch at half of sync for every model it knows', () => {
    // The published Batch API discount is 50% on input AND output. A batch row
    // transcribed at sync rates would double the reported cost of the image
    // pass, which is the most expensive step in a round.
    const models = new Set(Object.keys(PRICES).map((k) => k.split(':')[0]!))
    for (const model of models) {
      const sync = PRICES[`${model}:sync`]
      const batch = PRICES[`${model}:batch`]
      expect(sync, `${model} has no sync rate`).toBeDefined()
      expect(batch, `${model} has no batch rate`).toBeDefined()
      expect(batch!.input).toBeCloseTo(sync!.input / 2, 10)
      expect(batch!.output).toBeCloseTo(sync!.output / 2, 10)
    }
  })

  it('keeps cache rates at the published multiples of base input', () => {
    // 1.25x for a 5-minute write, 0.1x for a read. Pinned because these are the
    // two rows most easily mistyped, and a wrong multiplier is invisible in a
    // total.
    for (const [key, rate] of Object.entries(PRICES)) {
      expect(rate.cache_write, `${key} cache write`).toBeCloseTo(
        rate.input * 1.25,
        10
      )
      expect(rate.cache_read, `${key} cache read`).toBeCloseTo(
        rate.input * 0.1,
        10
      )
    }
  })

  it('prices both models the pipeline actually runs', () => {
    // CURATION_MODEL and VISION_MODEL in lib/anthropic-client.ts. If either is
    // changed without adding a rate, every future report silently lands in the
    // UNPRICED section instead of the total.
    expect(PRICES['claude-sonnet-4-5:sync']).toBeDefined()
    expect(PRICES['claude-sonnet-5:batch']).toBeDefined()
  })
})

/**
 * TRAP 37, the scope half — a round's own step whose cost is silently missing.
 *
 * THE INCIDENT. Round 13's `pick-plant-images` wrote the BATCH ID as its run
 * scope instead of the round label. Attribution is a string match on `scope`,
 * so the run was excluded without a word and `runs:cost --round 13` reported
 * $2.25 against an actual $2.57. The step ran, was billed, and the report was
 * confidently wrong.
 *
 * WHY THE EXISTING COUNT DID NOT SHOW IT. The report already said "N runs do
 * not name round 13" — but N counts every run in the file, mostly from other
 * rounds, so the one that mattered was invisible inside it. Bounded to the
 * round's own window, the same fact is a short list of suspects.
 */
describe('a round names its own runs (trap 37)', () => {
  const record = (over: Partial<RunRecord>): RunRecord =>
    ({
      step: 'pick-plant-images',
      started_at: '2026-08-17T12:00:00.000Z',
      scope: 'round 13',
      ...over,
    }) as RunRecord

  const SEEDED = '2026-08-17T10:00:00.000Z'

  it('matches a scope that names the round', () => {
    expect(
      scopeNamesRound(record({ scope: 'round 13 — 33 plant(s)' }), '13')
    ).toBe(true)
  })

  it('does not let round 1 swallow rounds 10 to 13', () => {
    // The word boundary, pinned: `--round 1` must not match "round 13".
    expect(scopeNamesRound(record({ scope: 'round 13' }), '1')).toBe(false)
  })

  it('flags a run in the round window whose scope names something else', () => {
    // The round-13 case exactly: the batch id where the round label belongs.
    const runs = [
      record({ scope: 'round 13 — 33 plant(s)' }),
      record({ step: 'pick-plant-images', scope: 'batch msgbatch_01ABC' }),
    ]
    const suspects = unattributedInWindow(runs, '13', SEEDED)
    expect(suspects.map((r) => r.scope)).toEqual(['batch msgbatch_01ABC'])
  })

  it('ignores runs that predate the round, however they are scoped', () => {
    // The reason the window matters: without it this list is every other
    // round's runs, which is the noise the bare count already drowned in.
    const runs = [
      record({ started_at: '2026-08-01T00:00:00.000Z', scope: 'round 12' }),
      record({ started_at: '2026-08-16T00:00:00.000Z', scope: 'round 12' }),
    ]
    expect(unattributedInWindow(runs, '13', SEEDED)).toEqual([])
  })

  it('says nothing when every run in the window names the round', () => {
    expect(
      unattributedInWindow([record({ scope: 'round 13' })], '13', SEEDED)
    ).toEqual([])
  })
})
