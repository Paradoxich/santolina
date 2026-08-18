/**
 * "What did that cost?" — priced from the run log. `pnpm runs:cost`.
 *
 * WHY THIS EXISTS. Asked on 2026-08-17 how expensive a new round is, this repo
 * could not answer: runs recorded which rows moved and never what was billed to
 * move them, and the only figure anywhere was an estimate in a handoff. API
 * spend here is self-funded, so the answer is a budgeting input rather than
 * trivia. `withRunRecord` now meters tokens (see write-provenance.md); this
 * turns them into money.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none. It is a reporting command in the same
 * category as `backlog` and `catalog:status` — reachable from package.json,
 * read-only, run when somebody asks what a round cost. WHAT ENDS IT: nothing;
 * it is a standing query, not a one-off, and it stays correct as the run log
 * grows because it reads the log rather than restating it.
 *
 * Usage:
 *   pnpm runs:cost                        every month on record
 *   pnpm runs:cost --month 2026-08        one month
 *   pnpm runs:cost --round 12             one round (see the caveat below)
 *   pnpm runs:cost --step curate-plants   one step
 *   pnpm runs:cost --per-row              add cost per row written
 *
 * THE HALF THAT MATTERS IS WHAT IT REFUSES TO PRICE. Three ways a total can
 * lie, each reported rather than absorbed:
 *
 *   1. A run with no `usage` field. Every record before 2026-08-17 is one, and
 *      so is any run whose script never called the API. Those are UNMEASURED,
 *      counted separately, and never summed as zero — a round that predates the
 *      meter must not read as free. This is the failed-fetch rule (trap 1) one
 *      level up: a missing measurement that renders as a confident number is
 *      worse than no number.
 *   2. A model or mode with no price. Reported as UNPRICED with the model named,
 *      never silently skipped and never priced at a neighbour's rate.
 *   3. A run whose scope names no round, under `--round`. Counted as
 *      unattributable rather than quietly excluded, because "round 12 cost $4"
 *      and "the runs I could tie to round 12 cost $4" are different claims.
 *
 * ROUND ATTRIBUTION IS A STRING MATCH, and that is a real limit. `scope` is
 * documented in run-provenance.ts as a free-form description for reading, NOT
 * the provenance key — the key is the write-set. So `--round` greps scope for
 * `round <label>` and reports what it could not attribute. It is a convenience
 * over a human-readable field, not an authority; the authority for round
 * membership is rounds/<label>/manifest.json.
 */

import { readdirSync } from 'node:fs'
import { basename } from 'node:path'
import type { UsageTotals } from '../lib/anthropic-client'
import { RUNS_DIR, readRunRecords, type RunRecord } from './run-provenance'
import { readRoundManifest } from './round-manifest'

/** Does this run's scope name that round? Scope is prose, so this is a match
 * rather than a lookup, bounded to a word so `1` cannot match `13`. */
export function scopeNamesRound(record: RunRecord, label: string): boolean {
  return new RegExp(`\\bround ${label}\\b`).test(record.scope ?? '')
}

/** Runs that started after the round was seeded and do not name it, so their
 * cost is missing from the round's figure. A prompt to look, not a failure. */
export function unattributedInWindow(
  records: RunRecord[],
  label: string,
  seededAt: string
): RunRecord[] {
  return records.filter(
    (r) => r.started_at >= seededAt && !scopeNamesRound(r, label)
  )
}

// ---------------------------------------------------------------------------
// The price table
//
// Rates are external facts with a date, not constants: they change, and they
// are not a property of any run. That is why the run record holds tokens and
// this file holds dollars — one home each. Every row is quoted from the source
// below, read on the date below; if a run's model is missing here the report
// says so rather than guessing from a neighbouring model's rate.
//
// Source: https://platform.claude.com/docs/en/about-claude/pricing
// Read:   2026-08-17
//
// Two multipliers are folded in and both are quoted from that page:
//   · the Batch API discount is 50% on input AND output, so `batch` rows are
//     the sticker halved (Sonnet 5 batch is published as $1/$5, which is the
//     halved $2/$10 — the table below agrees with the published batch row).
//   · cache writes are 1.25x base input (5-minute) and cache reads are 0.1x.
//     The 1-hour write is 2x and is NOT modelled: nothing in this pipeline
//     sets a 1h TTL, so a rate for it would be an untested claim. If a script
//     ever does, this comment is the thing that has to change with it.
// ---------------------------------------------------------------------------

interface Rate {
  /** USD per million tokens. */
  input: number
  output: number
  cache_write: number
  cache_read: number
}

const PRICES_AS_OF = '2026-08-17'
const PRICES_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing'

export const PRICES: Record<string, Rate> = {
  // Text curation and every cross-check. $3 / $15 per MTok.
  'claude-sonnet-4-5:sync': {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3,
  },
  'claude-sonnet-4-5:batch': {
    input: 1.5,
    output: 7.5,
    cache_write: 1.875,
    cache_read: 0.15,
  },
  // The hero-image vision pass. $2 / $10 per MTok — published at launch as
  // introductory pricing through 2026-08-31, and the same page now records
  // that it became the standard price and the rise to $3/$15 will not happen.
  'claude-sonnet-5:sync': {
    input: 2,
    output: 10,
    cache_write: 2.5,
    cache_read: 0.2,
  },
  'claude-sonnet-5:batch': {
    input: 1,
    output: 5,
    cache_write: 1.25,
    cache_read: 0.1,
  },
}

/**
 * USD for one meter entry, or null when the model/mode has no published rate
 * here. NULL, not 0 — an unpriced model that returned zero would vanish into a
 * total that looks complete, which is the whole defect this report exists to
 * avoid. Exported because a price table nobody can call is a price table
 * nobody can test.
 */
export function priceOf(key: string, totals: UsageTotals): number | null {
  const rate = PRICES[key]
  if (!rate) return null
  return (
    (totals.input_tokens * rate.input +
      totals.output_tokens * rate.output +
      totals.cache_creation_input_tokens * rate.cache_write +
      totals.cache_read_input_tokens * rate.cache_read) /
    1_000_000
  )
}

// ---------------------------------------------------------------------------
// Selecting the records
// ---------------------------------------------------------------------------

function main(): void {
  const argv = process.argv.slice(2)
  const flag = (name: string): string | null => {
    const at = argv.indexOf(name)
    return at === -1 ? null : (argv[at + 1] ?? null)
  }

  const month = flag('--month')
  const round = flag('--round')
  const step = flag('--step')
  const perRow = argv.includes('--per-row')

  /** Every month the log has, oldest first. One file per month by construction. */
  function months(): string[] {
    let names: string[]
    try {
      names = readdirSync(RUNS_DIR)
    } catch {
      return []
    }
    return names
      .filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f))
      .map((f) => basename(f, '.jsonl'))
      .sort()
  }

  const selectedMonths = month ? [month] : months()
  const all = selectedMonths.flatMap(readRunRecords)

  const namesRound = (record: RunRecord, label: string): boolean =>
    scopeNamesRound(record, label)

  const records = all.filter(
    (r) => (!round || namesRound(r, round)) && (!step || r.step === step)
  )

  // ---------------------------------------------------------------------------
  // The report
  // ---------------------------------------------------------------------------

  const usd = (n: number) => `$${n.toFixed(2)}`
  const num = (n: number) => n.toLocaleString('en-US')

  interface StepTotals {
    runs: number
    measured: number
    rows: number
    cost: number
    calls: number
    /** Model:mode keys this step used that the price table does not know. */
    unpriced: Set<string>
  }

  const byStep = new Map<string, StepTotals>()
  let unmeasured: RunRecord[] = []
  let grandCost = 0
  let grandCalls = 0
  const allUnpriced = new Map<string, UsageTotals>()

  for (const record of records) {
    let totals = byStep.get(record.step)
    if (!totals) {
      totals = {
        runs: 0,
        measured: 0,
        rows: 0,
        cost: 0,
        calls: 0,
        unpriced: new Set(),
      }
      byStep.set(record.step, totals)
    }
    totals.runs += 1
    totals.rows += record.row_count

    const usage = record.usage
    if (!usage || !Object.keys(usage).length) {
      unmeasured.push(record)
      continue
    }
    totals.measured += 1

    for (const [key, spent] of Object.entries(usage)) {
      const cost = priceOf(key, spent)
      totals.calls += spent.calls
      grandCalls += spent.calls
      if (cost === null) {
        totals.unpriced.add(key)
        const prior = allUnpriced.get(key)
        allUnpriced.set(
          key,
          prior
            ? {
                calls: prior.calls + spent.calls,
                input_tokens: prior.input_tokens + spent.input_tokens,
                output_tokens: prior.output_tokens + spent.output_tokens,
                cache_creation_input_tokens:
                  prior.cache_creation_input_tokens +
                  spent.cache_creation_input_tokens,
                cache_read_input_tokens:
                  prior.cache_read_input_tokens + spent.cache_read_input_tokens,
              }
            : { ...spent }
        )
        continue
      }
      totals.cost += cost
      grandCost += cost
    }
  }

  const scope = [
    month ? `month ${month}` : `${selectedMonths.length} month(s)`,
    round ? `round ${round}` : null,
    step ? `step ${step}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  console.log(`\nRun costs — ${scope}`)
  console.log(`  prices as of ${PRICES_AS_OF} — ${PRICES_SOURCE}`)

  if (!records.length) {
    console.log(
      `\n  No run records match.${
        round
          ? ` Round ${round} may predate run provenance (2026-08-16) or name its scope differently — scope is prose, see this file's header.`
          : ''
      }\n`
    )
    process.exit(0)
  }

  console.log()
  const width = Math.max(...[...byStep.keys()].map((s) => s.length), 4)
  for (const [name, t] of [...byStep].sort((a, b) => b[1].cost - a[1].cost)) {
    const measured =
      t.measured === t.runs ? '' : ` (${t.measured}/${t.runs} measured)`
    const rate =
      perRow && t.rows > 0 && t.measured > 0
        ? `  ${usd(t.cost / t.rows)}/row`
        : ''
    // A step with nothing measured prints "—", never "$0.00". The footer says
    // so too, but a column of zeroes is read before a paragraph is, and "this
    // step was free" is the wrong reading of "nobody metered it".
    // Three states, not two. "—" means nothing here is priced at all; a
    // trailing "+" means part of this row is in the UNPRICED section below and
    // the figure is a floor. A bare "$0.00" is reserved for a step that
    // genuinely spent nothing.
    const money =
      t.measured === 0 || (t.unpriced.size && t.cost === 0)
        ? '—'
        : usd(t.cost) + (t.unpriced.size ? '+' : '')
    console.log(
      `  ${name.padEnd(width)}  ${money.padStart(8)}  ` +
        `${String(t.calls).padStart(5)} call(s)  ${String(t.rows).padStart(4)} row(s)${measured}${rate}`
    )
    if (t.unpriced.size) {
      console.log(
        `  ${' '.repeat(width)}  ⚠ unpriced: ${[...t.unpriced].join(', ')}`
      )
    }
  }

  const anyMeasured = records.length > unmeasured.length
  const total = anyMeasured
    ? usd(grandCost) + (allUnpriced.size ? '+' : '')
    : '—'
  console.log(
    `\n  ${'TOTAL'.padEnd(width)}  ${total.padStart(8)}  ` +
      `${String(grandCalls).padStart(5)} call(s)` +
      (anyMeasured ? '' : '   nothing here was metered')
  )

  // The three ways the total can lie, each said out loud.

  if (allUnpriced.size) {
    console.log(
      `\n  ⚠ NOT IN THE TOTAL — ${allUnpriced.size} model/mode(s) have no price here:`
    )
    for (const [key, t] of allUnpriced) {
      console.log(
        `      ${key} — ${t.calls} call(s), ${num(t.input_tokens)} in / ${num(t.output_tokens)} out`
      )
    }
    console.log(
      `    Add the rate to PRICES in ${basename(__filename)}, quoted from the source with the date you read it.`
    )
  }

  if (unmeasured.length) {
    const steps = [...new Set(unmeasured.map((r) => r.step))].sort()
    console.log(
      `\n  ⚠ NOT MEASURED — ${unmeasured.length} of ${records.length} run(s) carry no token count.`
    )
    console.log(
      `    Every run before 2026-08-17 predates the meter, and a free step never had one.`
    )
    console.log(`    Steps: ${steps.join(', ')}`)
    console.log(
      `    Their cost is UNKNOWN, not zero — read the total as a floor when this line is present.`
    )
  }

  if (round) {
    const unattributed = all.filter((r) => !namesRound(r, round)).length
    console.log(
      `\n  Round attribution is a scope string match, not the manifest: ` +
        `${records.length} run(s) name round ${round}, ${unattributed} do not.`
    )

    // Narrowed to the round's own window: catalog-wide the count is mostly
    // other rounds.
    const manifest = readRoundManifest(round)
    if (manifest) {
      const suspects = unattributedInWindow(all, round, manifest.started_at)
      if (suspects.length)
        console.log(
          `\n  ⚠ ${suspects.length} run(s) started after round ${round} was seeded ` +
            `and do NOT name it, so their cost is not in the figure above:\n` +
            suspects
              .map((r) => `      ${r.step} — scope "${r.scope ?? 'none'}"`)
              .join('\n')
        )
    }
  }

  console.log()
}

if (require.main === module) main()
