/**
 * Backfill guard stamps from evidence — stamping ONLY rows something actually
 * proves were checked, and stamping them with the date the check really ran.
 *
 * TWO KINDS OF EVIDENCE, in two sections below.
 *
 *   1. REPORT-DERIVED (`botanical_checked_at`, `native_checked_at`) — an
 *      archived cross-check report is the witness. Original purpose of this
 *      script, July 28 2026.
 *   2. STATE-DERIVED (`style_checked_at`) — no report exists or ever did,
 *      because the pass that made the judgment was never the pass that owned
 *      the column. Added July 30 2026; see backfillStyleStamps().
 *
 * The discipline is the same in both: name the witness, make the write assert
 * what it expects to find, and leave a row NULL rather than stamp it on an
 * assumption.
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
import { readRoundManifest } from './round-manifest'

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
  // Read for the state-derived section below.
  style_tags: string[] | null
  style_checked_at: string | null
  ai_drafted_at: string | null
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

// ---------------------------------------------------------------------------
// State-derived evidence
// ---------------------------------------------------------------------------

/** The rounds whose plants curate-plants style-tagged without a stamp. */
const STYLE_BACKFILL_ROUNDS = ['9', '10']

/**
 * Backfill `style_checked_at` for rows whose style judgment was made by
 * curate-plants rather than by curate-styles.
 *
 * WHY THERE IS NO REPORT TO POINT AT. `curate-styles` owns this column in
 * round-status's STEP_DEFS, and on 2026-07-29 it correctly left the round
 * cadence — it is a repair pass for older data, and `curate-plants` already
 * does the job for a new seed from the same definitions in lib/style-tags.ts.
 * What nobody moved was the stamp. So rounds 9 and 10 wrote 100 rows of
 * perfectly good `style_tags` that read as never judged, and
 * docs/catalog-state.md reported style coverage sliding 50 rows a round.
 * curate-plants now stamps as it writes; this is the one-time repair behind it.
 *
 * THE WITNESS IS THE ROUND MANIFEST, which makes this per-row proof rather than
 * an inference. A row is stamped only if all three hold:
 *
 *   · its id is in round 9's or round 10's manifest — the explicit record of
 *     what that seed inserted, so "curate-plants tagged this row" is not being
 *     guessed from a date
 *   · `style_tags` is non-null, i.e. there is a judgment to record ([] counts:
 *     style-neutral is a real answer)
 *   · `ai_drafted_at` is non-null, because that IS the date the judgment was
 *     made and there is nothing else honest to stamp
 *
 * Each row is stamped with its OWN `ai_drafted_at`, not with today. Same rule
 * as the report-derived section: the stamp records when the check happened, not
 * when somebody noticed it had not been recorded.
 *
 * AN UNSTAMPED ROW OUTSIDE BOTH MANIFESTS IS LEFT NULL AND REPORTED. That is
 * the case this cannot vouch for, and stamping it would permanently hide a
 * genuinely un-judged plant from the step that exists to find it.
 */
async function backfillStyleStamps(
  rows: PlantRow[],
  apply: boolean
): Promise<number> {
  console.log('style_checked_at  [state-derived]')
  console.log(
    `   witness: rounds ${STYLE_BACKFILL_ROUNDS.join(' + ')} manifests; ` +
      'stamped with each row’s own ai_drafted_at'
  )

  const claimed = new Set<string>()
  for (const label of STYLE_BACKFILL_ROUNDS) {
    const manifest = readRoundManifest(label)
    // A missing manifest means the witness is gone, so nothing here can be
    // vouched for. Throw rather than silently stamp fewer rows — the whole
    // point of this pass is that it only writes what a manifest claims.
    if (!manifest)
      throw new Error(
        `No manifest for round ${label} (apps/web/rounds/${label}/manifest.json). ` +
          'That file is the only per-row evidence this backfill has; without it ' +
          'nothing should be stamped.'
      )
    for (const id of manifest.seeded_ids) claimed.add(id)
  }

  const unstamped = rows.filter((r) => r.style_checked_at === null)
  const inScope = unstamped.filter((r) => claimed.has(r.id))
  const orphans = unstamped.filter((r) => !claimed.has(r.id))

  // Both are real states, and neither is stampable. A row with no style_tags
  // was never judged; a row with no ai_drafted_at gives us no date to claim.
  const noJudgment = inScope.filter((r) => r.style_tags === null)
  const noDate = inScope.filter(
    (r) => r.style_tags !== null && r.ai_drafted_at === null
  )
  const writable = inScope.filter(
    (r) => r.style_tags !== null && r.ai_drafted_at !== null
  )

  console.log(
    `   ${unstamped.length} unstamped row(s): ${inScope.length} in scope, ` +
      `${orphans.length} outside both manifests`
  )
  if (noJudgment.length)
    console.log(
      `   ${noJudgment.length} skipped — style_tags is null (never judged)`
    )
  if (noDate.length)
    console.log(
      `   ${noDate.length} skipped — no ai_drafted_at, so no honest date to stamp`
    )
  if (orphans.length) {
    console.log(
      `   ✗ LEFT NULL, not vouched for by any manifest — a future ` +
        `curate-styles run should pick these up:`
    )
    for (const r of orphans.slice(0, 20))
      console.log(
        `       ${r.common_name} (seeded ${r.created_at.slice(0, 10)})`
      )
    if (orphans.length > 20)
      console.log(`       … and ${orphans.length - 20} more`)
  }

  if (!writable.length || !apply) {
    console.log('')
    return writable.length
  }

  // Per-row, because each stamp is that row's own ai_drafted_at. 100 small
  // updates, which is cheaper than the alternative of one shared timestamp
  // that would be a fact about none of them.
  const db = getSupabaseAdmin()
  for (const r of writable) {
    const { error } = await db
      .from('plants')
      .update({ style_checked_at: r.ai_drafted_at })
      .eq('id', r.id)
      .is('style_checked_at', null)
    if (error)
      throw new Error(`Write failed for ${r.common_name}: ${error.message}`)
  }
  console.log(`   ✓ stamped ${writable.length} row(s)\n`)
  return writable.length
}

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getSupabaseAdmin()

  const rows = await fetchAllRows<PlantRow>((from, to) =>
    db
      .from('plants')
      .select(
        'id, common_name, created_at, botanical_checked_at, native_checked_at, ' +
          'style_tags, style_checked_at, ai_drafted_at'
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

  totalWould += await backfillStyleStamps(rows, apply)

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
      'botanical report) and every pre-round-7 row for native_to (reports were ' +
      'overwritten). A future guard run should pick those up.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
