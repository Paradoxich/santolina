/**
 * Settle the disagreements `cross-check-plants` left unstamped.
 *
 * WHICH RUNBOOK STEP RUNS THIS, AND WHAT ENDS IT. No step runs it, deliberately
 * — the same class as `apply-native-to-fixes.ts`. It applies decisions a person
 * made, so it cannot run unattended; a round runs it when step 5 queues
 * something, and it ends when the queue file is empty of unsettled flags.
 *
 * WHY IT EXISTS. `cross-check-plants` is a blind second pass and never edits
 * catalog data, so before 2026-08-18 a row it DISAGREED with was stamped
 * `botanical_checked_at` anyway. Two things followed, and the second is worse
 * than the first: the row left the `--new-only` queue for good, and round close
 * read the stamp as FAIL-level proof the step had settled it. The doubt lived
 * only in gitignored `reports/`. So the certification was durable and the
 * finding was not (trap 24, and trap 8 underneath it).
 *
 * The guard now withholds the stamp on those rows and writes them to
 * `reference/botanical-flags-<date>.json`. This script is the only way they
 * settle. TWO VERDICTS SETTLE A FLAG and both are decisions:
 *
 *   · `correct` — the check was right. The checked value is written.
 *   · `keep`    — the stored value stands. Nothing is written for that field.
 *
 * A row settles only when EVERY flag on it carries a verdict, because the stamp
 * is per row and would otherwise certify a row still holding an open question.
 * A row where every flag is `keep` writes no column and one stamp, which is the
 * shape `reviewed-mutation.ts` calls a stamp-only intent — a judging pass that
 * agrees with the stored value is still a judgment.
 *
 * Guarded by `reviewed-mutation.ts` rather than by hand: each write asserts the
 * value the decision was made about, so a row edited since the check is skipped
 * as drift instead of clobbered, and the stamp lands in the SAME statement as
 * the correction. `onCurated: 'skip'` — a curated row carries a human sign-off
 * on these very fields, and a mechanical correction does not overrule it.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-botanical-fixes.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-botanical-fixes.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-botanical-fixes.ts --file reference/<name>.json
 *
 * `--file` defaults to the newest `reference/botanical-flags-*.json`, because
 * the queue is written per run and naming it by hand every time is how the
 * wrong one gets applied. `--dry-run` reports without writing.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { withRunRecord, type Witness } from './run-provenance'
import {
  openReviewedMutation,
  asMutationDb,
  formatReport,
  type MutationIntent,
} from './reviewed-mutation'

const REFERENCE_DIR = join(__dirname, '..', 'reference')

/** One flag of the queue, once a person has ruled on it. */
export interface SettledFlag {
  field: string
  stored: unknown
  checked: unknown
  detail: string
  /** Empty until someone rules. `correct` takes checked, `keep` keeps stored. */
  verdict: string
  /** Why. Required on a correction — it is the record of the reasoning. */
  why: string
}

export interface QueueRow {
  id: string
  common_name: string
  scientific_name: string | null
  flags: SettledFlag[]
}

export type RowPlan =
  /** Every flag ruled on. Write the corrections, stamp in the same statement. */
  | {
      kind: 'settled'
      row: QueueRow
      from: Record<string, unknown>
      to: Record<string, unknown>
      why: string
    }
  /** At least one flag still unruled. Left in the queue, untouched. */
  | { kind: 'open'; row: QueueRow; unruled: string[] }

/**
 * Turn a queue row into the write it authorises, or say it is not settled yet.
 *
 * THE STAMP IS PER ROW AND THE VERDICTS ARE PER FLAG, which is the whole reason
 * this is a function rather than a filter. A row with two flags, one corrected
 * and one still blank, is NOT settled: writing the correction and stamping it
 * would certify the row while its second question is open, which is trap 24
 * rebuilt at a finer grain.
 *
 * `from` carries the stored value of every CORRECTED field and nothing else.
 * A kept field is not written, so guarding it would only invent drift on a
 * value this run is deliberately leaving alone.
 */
export function planRow(row: QueueRow): RowPlan {
  const unruled = row.flags
    .filter((f) => f.verdict !== 'correct' && f.verdict !== 'keep')
    .map((f) => f.field)
  if (unruled.length) return { kind: 'open', row, unruled }

  const corrections = row.flags.filter((f) => f.verdict === 'correct')
  const from: Record<string, unknown> = {}
  const to: Record<string, unknown> = {}
  for (const f of corrections) {
    from[f.field] = f.stored
    to[f.field] = f.checked
  }
  const why = row.flags
    .map((f) => `${f.field}: ${f.verdict}${f.why ? ` — ${f.why}` : ''}`)
    .join('; ')
  return { kind: 'settled', row, from, to, why }
}

/** The newest queue the guard wrote. Named so the wrong one is hard to pick. */
export function newestQueue(names: string[]): string | null {
  const queues = names
    .filter((n) => /^botanical-flags-\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort()
  return queues.length ? queues[queues.length - 1]! : null
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const idx = argv.indexOf('--file')
  if (idx >= 0) {
    const file = argv[idx + 1]
    if (!file) throw new Error('--file needs a path')
    return { dryRun: argv.includes('--dry-run'), file }
  }
  const newest = newestQueue(readdirSync(REFERENCE_DIR))
  if (!newest)
    throw new Error(
      'No reference/botanical-flags-<date>.json to apply. The guard writes one ' +
        'only when it disagrees with something.'
    )
  return { dryRun: argv.includes('--dry-run'), file: `reference/${newest}` }
}

async function main() {
  const { dryRun, file } = parseArgs()
  const queue = JSON.parse(readFileSync(join(process.cwd(), file), 'utf8')) as {
    rows: QueueRow[]
  }
  if (!Array.isArray(queue.rows)) throw new Error(`${file} holds no rows`)

  const plans = queue.rows.map(planRow)
  const settled = plans.filter(
    (p): p is Extract<RowPlan, { kind: 'settled' }> => p.kind === 'settled'
  )
  const open = plans.filter((p) => p.kind === 'open')

  console.log(
    `${queue.rows.length} queued row(s) in ${file}: ${settled.length} settled, ` +
      `${open.length} still open${dryRun ? ' (dry run)' : ''}\n`
  )
  for (const p of open) {
    if (p.kind !== 'open') continue
    console.log(
      `  ?  ${p.row.common_name} — no verdict on ${p.unruled.join(', ')}`
    )
  }
  if (!settled.length) {
    console.log('\nNothing to apply. Rule on the flags above first.')
    return
  }

  const db = getSupabaseAdmin()
  const writer = openReviewedMutation({
    db: asMutationDb(db),
    table: 'plants',
    onCurated: 'skip',
    dryRun,
  })

  /**
   * The intents, stamped at `stampedAt`.
   *
   * TAKEN AS AN ARGUMENT RATHER THAN READ FROM THE CLOCK HERE, because a stamp
   * minted before `beginRun` lands BEFORE the run window opens: the witness
   * then counts 0 rows inside the window against a claim of N and files a
   * correct run as CONTRADICTED. The first cut of this script did exactly that
   * and the local-stack exercise caught it. The clock is read inside the run.
   */
  const buildIntents = (stampedAt: string): MutationIntent[] =>
    settled.map((p) => ({
      id: p.row.id,
      label: `${p.row.common_name} (${p.row.scientific_name ?? 'no name'})`,
      from: p.from,
      to: p.to,
      // SAME STATEMENT as the correction, which is the point: a stamp written
      // afterwards lands after the trigger has already fired on the first write.
      alsoWrite: { botanical_checked_at: stampedAt },
      why: p.why,
    }))

  const written = [...new Set(settled.flatMap((p) => Object.keys(p.to)))]
  const runOptions = {
    step: 'apply-botanical-fixes',
    writeSet: [...written, 'botanical_checked_at'],
    // botanical_checked_at is SET here, not cleared, and to `now` rather than a
    // backdated value — so it witnesses itself honestly. The corrected fields
    // are enums, integers and arrays: not comparable to an instant, so each
    // needs updated_at, which bounds rather than confirms.
    evidence: [
      ...written.map((covers) => ({
        kind: 'row-touched' as const,
        covers,
        table: 'plants' as const,
        column: 'updated_at',
      })),
      {
        kind: 'stamp' as const,
        covers: 'botanical_checked_at',
        column: 'botanical_checked_at',
      },
    ] as Witness[],
    scope: `${settled.length} settled row(s) from ${file}`,
    recipe: {
      model: 'human',
      template: readFileSync(join(process.cwd(), file), 'utf8'),
      ingredients: {},
      decoding: {},
    },
  }

  const report = dryRun
    ? await writer.apply(buildIntents(new Date().toISOString()), {
        wrote: () => {},
      })
    : await withRunRecord(runOptions, (run) =>
        writer.apply(buildIntents(new Date().toISOString()), {
          wrote: (id) => run.wrote(id),
        })
      )

  console.log(formatReport(report, { dryRun }))
  if (!dryRun && report.written + report.stamped)
    console.log(
      '\nThese rows now carry botanical_checked_at and settle at round close.'
    )
}

// Guarded so the test file can import planRow without running the apply.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
