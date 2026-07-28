/**
 * Backfill `botanical_checked_at` / `native_checked_at` from the archived
 * cross-check reports — stamping ONLY rows a surviving report actually covers,
 * and stamping them with the date the check really ran.
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
 *   · native-to-crosscheck.json — 76 rows, each named by id
 *
 * WHAT IS DELIBERATELY LEFT NULL, and it matters more than what gets stamped:
 *
 *   · the 117 plants seeded 2026-07-12 (the regional-natives round) have no
 *     surviving botanical report at all
 *   · every pre-round-7 row for `native_checked_at`, because
 *     cross-check-native-to.ts wrote to a FIXED filename and overwrote its own
 *     history every run — we know earlier runs happened, the evidence is gone
 *
 * A null stamp on those is correct: it means a future guard run should pick
 * them up. Stamping them on an assumption would permanently hide a genuinely
 * unchecked plant from the guard that exists to find it.
 *
 * STRENGTH OF EVIDENCE, stated honestly: the botanical reports name only the
 * FLAGGED plants, not the clean ones, so per-row proof exists for the flagged
 * subset and the rest is inferred from "checked count == catalog size on that
 * date". That inference is strong but it is an inference. The native_to report
 * names every row it covers, so that one is per-row proof.
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
  {
    report: 'native-to-crosscheck.json',
    column: 'native_checked_at',
    scope: { kind: 'ids-in-report' },
    expected: 76,
    note: 'names every row it covered, so this is per-row proof',
  },
]

interface PlantRow {
  id: string
  common_name: string
  created_at: string
  botanical_checked_at: string | null
  native_checked_at: string | null
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

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getSupabaseAdmin()

  const rows = await fetchAllRows<PlantRow>((from, to) =>
    db
      .from('plants')
      .select(
        'id, common_name, created_at, botanical_checked_at, native_checked_at'
      )
      .order('id')
      .range(from, to)
  )
  console.log(
    apply ? 'BACKFILL — writing stamps.' : 'Dry run — nothing written.'
  )
  console.log(`${rows.length} plants in catalog.\n`)

  let totalWould = 0

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
    }
    console.log(`   ✓ stamped ${unstamped.length} row(s)\n`)
  }

  console.log(
    apply
      ? '\nDone.'
      : `\n${totalWould} row(s) would be stamped. Re-run with --apply.`
  )

  const stillNull = {
    botanical: rows.filter((r) => r.botanical_checked_at === null).length,
    native: rows.filter((r) => r.native_checked_at === null).length,
  }
  console.log(
    `\nBefore this run: ${stillNull.botanical} unstamped botanical, ` +
      `${stillNull.native} unstamped native_to.`
  )
  console.log(
    'Deliberately left null: the 117 plants seeded 2026-07-12 (no surviving ' +
      'botanical report) and every pre-round-7 row for native_to (reports were ' +
      'overwritten). A future guard run should pick those up.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
