/**
 * Backfill guard stamps from evidence — stamping ONLY rows something actually
 * proves were checked, and stamping them with the date the check really ran.
 *
 * ONE KIND OF EVIDENCE: REPORT-DERIVED (`botanical_checked_at`,
 * `native_checked_at`) — an archived cross-check report is the witness.
 * A second, state-derived section (`style_checked_at`) lived here July 30 to
 * August 14 2026 and is deleted; see the tombstone above main().
 *
 * The discipline: name the witness, make the write assert what it expects to
 * find, and leave a row NULL rather than stamp it on an assumption.
 *
 * WHY THIS IS NOT "STAMP EVERYTHING". The stamp columns arrived in migration
 * 20260716120000, on July 16. Every cross-check before that date physically
 * could not stamp anything, so a null stamp on an older row means "the column
 * did not exist yet", not "this plant was never checked". The database log used
 * to argue the opposite, partly on a circular observation: `round-status.ts`
 * detects a check BY its stamp, so unstamped rows always report 0/N. That
 * proves the stamps are missing, not that the checks are.
 *
 * WHY THIS IS NOT "STAMP NOTHING" EITHER. The reports are dated evidence:
 *
 *   · cross-check-2026-07-09-22-32-26.json — checked 201, which is exactly the
 *     catalog size that day, so it was a full-catalog run
 *   · cross-check-2026-07-14-15-36-52.json — checked 100, round 6's batch
 *   · cross-check-2026-07-15-19-19-21.json — checked 76, round 7's batch
 *
 * `native_checked_at` IS NO LONGER BACKFILLED (retired 2026-07-30, see GROUPS).
 * Its stamps were cleared catalog-wide because the runs behind them used the
 * old unguarded lookup, and restoring them from those same reports would undo
 * that on purpose.
 *
 * WHAT IS DELIBERATELY LEFT NULL, and it matters more than what gets stamped:
 *
 *   · the 117 plants seeded 2026-07-12 (the regional-natives round) have no
 *     surviving botanical report at all
 *
 * A null stamp on those is correct: it means a future guard run should pick
 * them up. Stamping them on an assumption would permanently hide a genuinely
 * unchecked plant from the guard that exists to find it.
 *
 * STRENGTH OF EVIDENCE, stated honestly: the botanical reports name only the
 * FLAGGED plants, not the clean ones, so per-row proof exists for the flagged
 * subset and the rest is inferred from "checked count == catalog size on that
 * date". That inference is strong but it is an inference.
 *
 * Dry-run by default. Never overwrites an existing stamp. Refuses to write a
 * group whose live row count disagrees with the report's own `checked` figure —
 * the same expects-what-it-finds guard as apply-sun-widening.ts.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-guard-stamps.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-guard-stamps.ts --apply
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { fetchAllRows } from '../lib/paginate'
import { withRunRecord, type Witness } from './run-provenance'
import { getSupabaseAdmin } from '../lib/supabase-admin'

const REPORTS_DIR = join(process.cwd(), 'reports')

type StampColumn = 'botanical_checked_at' | 'native_checked_at'

interface Evidence {
  report: string
  column: StampColumn
  /** How the report's coverage maps onto rows. */
  scope:
    | { kind: 'seeded-on-or-before'; date: string }
    | { kind: 'seeded-on'; date: string }
    | { kind: 'ids-in-report' }
  /** What the report says it checked; the live count must match. */
  expected: number
  note: string
}

const EVIDENCE: Evidence[] = [
  {
    report: 'cross-check-2026-07-09-22-32-26.json',
    column: 'botanical_checked_at',
    scope: { kind: 'seeded-on-or-before', date: '2026-07-09' },
    expected: 201,
    note: 'full-catalog run — checked 201 against a catalog of exactly 201 that day',
  },
  {
    report: 'cross-check-2026-07-14-15-36-52.json',
    column: 'botanical_checked_at',
    scope: { kind: 'seeded-on', date: '2026-07-14' },
    expected: 100,
    note: "round 6's batch",
  },
  {
    report: 'cross-check-2026-07-15-19-19-21.json',
    column: 'botanical_checked_at',
    scope: { kind: 'seeded-on', date: '2026-07-15' },
    expected: 76,
    note: "round 7's batch",
  },
  // RETIRED 2026-07-30 — the native-to-crosscheck.json group is deliberately
  // gone, not lost. Every native_checked_at stamp in the catalog was cleared
  // that day because the checks behind them ran on the old unguarded GBIF
  // lookup (traps 11 and 15), and this group would restore them from the very
  // reports those runs produced — quietly re-asserting a check we invalidated
  // on purpose. Do not re-add it: the guard has since re-run catalog-wide and
  // writes its own stamps.
]

interface PlantRow {
  id: string
  common_name: string
  created_at: string
  botanical_checked_at: string | null
  native_checked_at: string | null
  // Read for the still-null summary only. No section here writes it: the one
  // that did (backfillStyleStamps) is deleted, see the note above main().
  style_checked_at: string | null
}

/**
 * When the check actually ran. Prefer the report's own `ran_at`; the native_to
 * report carries no timestamp, so fall back to the file's mtime and say so.
 */
function reportRanAt(path: string): { at: string; source: string } {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (
    parsed &&
    typeof parsed === 'object' &&
    'ran_at' in parsed &&
    typeof (parsed as { ran_at: unknown }).ran_at === 'string'
  ) {
    return {
      at: (parsed as { ran_at: string }).ran_at,
      source: 'report ran_at',
    }
  }
  return { at: statSync(path).mtime.toISOString(), source: 'file mtime' }
}

function idsInReport(path: string): string[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as
    | { id?: string }[]
    | { flagged?: { id?: string }[] }
  const list = Array.isArray(parsed) ? parsed : (parsed.flagged ?? [])
  return list.map((r) => r.id).filter((id): id is string => Boolean(id))
}

function selectRows(
  rows: PlantRow[],
  evidence: Evidence,
  path: string
): PlantRow[] {
  const day = (iso: string) => iso.slice(0, 10)
  // Bind the union to a local so the switch actually narrows it.
  const scope = evidence.scope
  switch (scope.kind) {
    case 'seeded-on-or-before':
      return rows.filter((r) => day(r.created_at) <= scope.date)
    case 'seeded-on':
      return rows.filter((r) => day(r.created_at) === scope.date)
    case 'ids-in-report': {
      const ids = new Set(idsInReport(path))
      return rows.filter((r) => ids.has(r.id))
    }
  }
}

/*
 * backfillStyleStamps lived here until 2026-08-14. It filtered on
 * `style_tags === null` against a NOT NULL DEFAULT '{}' column — an
 * unreachable predicate — so its only live condition was ai_drafted_at, and
 * it stamped 100 empty rounds-9/10 rows as style-judged (trap 26,
 * docs/database-log.md). The stamp was the damage; deleting the function is
 * the fix. The repair for those rows is a real pass:
 * `curate-styles --round 9` then `--round 10`, without `--new-only`.
 */

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getSupabaseAdmin()

  const rows = await fetchAllRows<PlantRow>((from, to) =>
    db
      .from('plants')
      .select(
        'id, common_name, created_at, botanical_checked_at, native_checked_at, ' +
          'style_checked_at'
      )
      .order('id')
      .range(from, to)
  )
  console.log(
    apply ? 'BACKFILL — writing stamps.' : 'Dry run — nothing written.'
  )
  console.log(`${rows.length} plants in catalog.\n`)

  let totalWould = 0

  const STAMPS = [
    'botanical_checked_at',
    'native_checked_at',
    'style_checked_at',
  ] as const

  const runOptions = {
    step: 'backfill-guard-stamps',
    // Written out rather than spread from STAMPS: shape 9 reads this list
    // literally, so `writeSet: [...STAMPS]` declares nothing as far as the
    // checker is concerned — and a write-set the checker cannot read is one
    // nothing verifies against the migrations.
    writeSet: ['botanical_checked_at', 'native_checked_at', 'style_checked_at'],
    // THESE STAMPS CANNOT WITNESS THEMSELVES, and the reason is peculiar to
    // this script: it writes the report's OWN run time, which is weeks in the
    // past. The default witness counts rows whose stamp lands inside THIS run's
    // window, so it would observe 0 against a claim of hundreds and file the
    // run CONTRADICTED — a correct run reporting itself caught lying. Same
    // outcome as shape 12's clearing writes, arrived at from the opposite
    // direction: not an absent value, a deliberately backdated one.
    //
    // updated_at is the honest witness, and it only BOUNDS the claim.
    evidence: STAMPS.map((covers) => ({
      kind: 'row-touched' as const,
      covers,
      table: 'plants' as const,
      column: 'updated_at',
    })) as Witness[],
    scope: `report-derived stamps over ${rows.length} catalog rows`,
    // The reports ARE the recipe: each stamp asserts that a named committed
    // report covered a named population at a named time. This is the script
    // whose state-derived half fabricated 100 stamps in 2026-08-14 and was
    // deleted for it, so what licenses each write is exactly the list below.
    recipe: {
      model: 'report-derived',
      template: EVIDENCE.map(
        (e) =>
          `${e.report} → ${e.column} (expects ${e.expected} rows): ${e.note}`
      ),
      ingredients: {},
      decoding: {},
    },
  }

  const backfillAll = async (wrote: (id: string) => void) => {
    for (const evidence of EVIDENCE) {
      const path = join(REPORTS_DIR, evidence.report)
      if (!existsSync(path)) {
        console.log(`✗ ${evidence.report} — missing, skipped`)
        continue
      }

      const scoped = selectRows(rows, evidence, path)
      const { at, source } = reportRanAt(path)

      console.log(`${evidence.report}  [${evidence.column}]`)
      console.log(`   ${evidence.note}`)
      console.log(`   checked ${at} (${source})`)

      // The guard: the live population must be exactly what the report claims to
      // have covered. A mismatch means the mapping is wrong, so write nothing.
      if (scoped.length !== evidence.expected) {
        console.log(
          `   ✗ SKIPPED — report covered ${evidence.expected} rows but this scope ` +
            `selects ${scoped.length}. Mapping is unsafe; not writing.\n`
        )
        continue
      }

      const unstamped = scoped.filter((r) => r[evidence.column] === null)
      console.log(
        `   ${scoped.length} row(s) in scope, ${unstamped.length} unstamped ` +
          `(${scoped.length - unstamped.length} already stamped, left alone)`
      )
      totalWould += unstamped.length

      if (!unstamped.length || !apply) {
        console.log('')
        continue
      }

      const batchSize = 100
      for (let i = 0; i < unstamped.length; i += batchSize) {
        const batch = unstamped.slice(i, i + batchSize).map((r) => r.id)
        const { error } = await db
          .from('plants')
          .update({ [evidence.column]: at })
          .in('id', batch)
        if (error) throw new Error(`Write failed: ${error.message}`)
        for (const id of batch) wrote(id)
      }
      console.log(`   ✓ stamped ${unstamped.length} row(s)\n`)
    }
  }

  // A dry run opens NO run: it reads the reports and writes nothing.
  if (apply) {
    await withRunRecord(runOptions, (run) => backfillAll((id) => run.wrote(id)))
  } else {
    await backfillAll(() => {})
  }

  console.log(
    apply
      ? '\nDone.'
      : `\n${totalWould} row(s) would be stamped. Re-run with --apply.`
  )

  const stillNull = {
    botanical: rows.filter((r) => r.botanical_checked_at === null).length,
    native: rows.filter((r) => r.native_checked_at === null).length,
    style: rows.filter((r) => r.style_checked_at === null).length,
  }
  console.log(
    `\nBefore this run: ${stillNull.botanical} unstamped botanical, ` +
      `${stillNull.native} unstamped native_to, ${stillNull.style} unstamped style.`
  )
  console.log(
    'Deliberately left null: the 117 plants seeded 2026-07-12 (no surviving ' +
      'botanical report). A future guard run should pick those up.'
  )
  console.log(
    'native_to is no longer backfilled at all — see the retired group above.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
