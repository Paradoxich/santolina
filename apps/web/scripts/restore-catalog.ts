/**
 * Restore a catalog snapshot. Dry-run by default: shows what would change and
 * touches nothing. Pass --apply to write.
 *
 * Reads either source of truth:
 *   · `backups/<stamp>/` — the gitignored working area backup-catalog.ts writes
 *   · `rounds/<n>/catalog/` — the committed, gzipped archive (catalog-snapshot.ts)
 *
 * The second one is the point: `backups/` lives on one machine, and Free-plan
 * Supabase projects cannot download or restore the platform's own daily
 * backups. A committed archive nobody can restore FROM would be decoration, so
 * this reads it directly.
 *
 * A round archive holds two states, so it needs `--phase`: `before` is the
 * round's rollback point, `after` is the state it left behind. There is no
 * default — picking the wrong one silently reverts or re-applies a whole round.
 *
 * Semantics: every backed-up row is upserted by id, so rows corrupted or
 * deleted since the backup are put back exactly as they were. Rows CREATED
 * after the backup are reported but never deleted — removing data is a human
 * decision, not a restore side effect.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/restore-catalog.ts \
 *     backups/<stamp>                          # dry run
 *     backups/<stamp> --apply                  # write
 *     rounds/8/catalog --phase before          # dry run from the committed archive
 */

import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'

import { getSupabaseAdmin } from '../lib/supabase-admin'

const TABLES = ['plants', 'plant_combinations'] as const

type Row = Record<string, unknown> & { id: string }

interface ArchiveMeta {
  counts: Record<string, number | Record<string, number>>
}

function loadBackup(dir: string, table: string, phase?: string): Row[] {
  const meta = JSON.parse(
    readFileSync(join(dir, 'meta.json'), 'utf8')
  ) as ArchiveMeta

  // A round archive nests counts under before/after; a plain backup does not.
  const isArchive =
    typeof meta.counts.before === 'object' ||
    typeof meta.counts.after === 'object'

  let path: string
  let expected: number | undefined
  if (isArchive) {
    if (phase !== 'before' && phase !== 'after')
      throw new Error(
        `${dir} is a round archive holding both states — pass --phase before ` +
          `(the round's rollback point) or --phase after (what it left behind).`
      )
    path = join(dir, `${phase}-${table}.json.gz`)
    expected = (meta.counts[phase] as Record<string, number>)[table]
  } else {
    path = join(dir, `${table}.json`)
    expected = meta.counts[table] as number
  }

  if (!existsSync(path))
    throw new Error(`Missing ${path} — snapshot is incomplete.`)
  const raw = readFileSync(path)
  const rows = JSON.parse(
    (path.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')
  ) as Row[]

  if (expected !== undefined && rows.length !== expected) {
    throw new Error(
      `${path} has ${rows.length} rows but meta.json recorded ` +
        `${expected} — snapshot looks incomplete, refusing to restore`
    )
  }
  return rows
}

/** When the snapshot was taken: round archives record it, plain backups don't. */
function snapshotCapturedAt(dir: string): string | null {
  try {
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as {
      captured_at?: string
      created_at?: string
    }
    return meta.captured_at ?? meta.created_at ?? null
  } catch {
    return null
  }
}

async function fetchCurrent(table: string): Promise<Map<string, Row>> {
  const db = getSupabaseAdmin()
  const pageSize = 1000
  const rows = new Map<string, Row>()
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`)
    for (const row of (data ?? []) as Row[]) rows.set(row.id, row)
    if (!data || data.length < pageSize) return rows
  }
}

/**
 * Columns a TRIGGER owns, so a difference in them is not a data difference.
 *
 * PREVENTIVE, AND MEASURED BEFORE BEING CALLED A FIX. The audit expected these
 * columns to be inflating the count. They are not, today: against both phases
 * of round 11's snapshot the old whole-row comparison and this one both report
 * 100 rows (which are the trap-26 repair's 100, written after the snapshot).
 * The reason is that a trigger-owned column rarely differs ALONE —
 * `plants_set_updated_at` fires on writes that also change real data, and
 * `trg_sync_sun_requirements` derives `sun_requirements` from the two sun
 * arrays, which are themselves data.
 *
 * The case it is here for is the one where they do: an idempotent re-upsert
 * (`seed-plants --include-existing` over rows with no gaps to fill) bumps
 * `updated_at` on every row it touches and changes nothing else, so the next
 * restore diff would read as "the whole catalog differs". A count that is
 * always large is a count nobody reads, and that is how a stale snapshot gets
 * restored over live work. The trigger-only figure is printed separately so the
 * distinction stays visible instead of being silently absorbed.
 *
 * Key ORDER is normalised here for the same reason: the two sides come from
 * different places, one a JSON file and one PostgREST, so the old comparison
 * was one column reordering away from reporting a total mismatch. It agrees
 * today — this keeps it agreeing.
 */
const TRIGGER_OWNED: Record<string, readonly string[]> = {
  plants: ['updated_at', 'sun_requirements'],
  plant_combinations: ['updated_at'],
}

function canonicalRow(row: Row, table: string): string {
  const skip = new Set(TRIGGER_OWNED[table] ?? [])
  return JSON.stringify(
    Object.keys(row)
      .filter((k) => !skip.has(k))
      .sort()
      .map((k) => [k, row[k]])
  )
}

async function restoreTable(
  dir: string,
  table: string,
  apply: boolean,
  phase?: string
): Promise<void> {
  const backedUp = loadBackup(dir, table, phase)
  const current = await fetchCurrent(table)

  const changed = backedUp.filter((row) => {
    const now = current.get(row.id)
    return !now || canonicalRow(now, table) !== canonicalRow(row, table)
  })
  // Rows whose ONLY difference is a column a trigger owns. Counted apart from
  // `changed` rather than folded into it, because that is the difference
  // between "this restore has real work to do" and "a trigger has fired since
  // the snapshot was taken".
  const triggerOnly = backedUp.filter((row) => {
    const now = current.get(row.id)
    if (!now) return false
    return (
      canonicalRow(now, table) === canonicalRow(row, table) &&
      JSON.stringify(now) !== JSON.stringify(row)
    )
  }).length
  const missing = changed.filter((row) => !current.has(row.id)).length
  const backedUpIds = new Set(backedUp.map((r) => r.id))
  const createdSince = [...current.keys()].filter((id) => !backedUpIds.has(id))

  console.log(`\n${table}:`)
  console.log(`  backup ${backedUp.length} rows, live ${current.size} rows`)
  console.log(
    `  ${changed.length} row(s) differ (${missing} deleted since backup)` +
      (triggerOnly
        ? `, plus ${triggerOnly} differing only in trigger-owned columns`
        : '')
  )

  // A snapshot is a picture of one moment, and the catalog keeps moving after
  // it — corrections, backfills. Restoring a stale snapshot silently reverts
  // everything done since, which looks like a successful restore. Say so.
  const newestLive = [...current.values()]
    .map((r) => String(r.updated_at ?? ''))
    .filter(Boolean)
    .sort()
    .at(-1)
  const snapshotAt = snapshotCapturedAt(dir)
  if (newestLive && snapshotAt && newestLive > snapshotAt) {
    console.log(
      `  ⚠ live rows were modified after this snapshot was taken ` +
        `(snapshot ${snapshotAt.slice(0, 19)}, newest live change ` +
        `${newestLive.slice(0, 19)}) — restoring would revert that work`
    )
  }
  if (createdSince.length) {
    console.log(
      `  ${createdSince.length} row(s) created since backup — left untouched`
    )
  }

  if (!changed.length || !apply) return

  const db = getSupabaseAdmin()
  const batchSize = 100
  for (let i = 0; i < changed.length; i += batchSize) {
    const batch = changed.slice(i, i + batchSize)
    const { error } = await db.from(table).upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`Failed to restore ${table}: ${error.message}`)
  }
  console.log(`  ✓ restored ${changed.length} row(s)`)
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const phaseIdx = args.indexOf('--phase')
  const phase = phaseIdx >= 0 ? args[phaseIdx + 1] : undefined
  // Skip the value that belongs to --phase, but only when --phase was passed;
  // otherwise phaseIdx is -1 and index 0 (the directory) gets excluded.
  const dir = args.find(
    (a, i) => !a.startsWith('--') && !(phaseIdx >= 0 && i === phaseIdx + 1)
  )
  if (!dir) {
    console.error(
      'Usage: restore-catalog.ts <snapshot dir> [--phase before|after] [--apply]\n' +
        'e.g.   restore-catalog.ts backups/2026-07-15T21-17-33-191Z\n' +
        '       restore-catalog.ts rounds/8/catalog --phase before'
    )
    process.exit(1)
  }

  console.log(
    apply ? 'RESTORE — writing to the live DB.' : 'Dry run — nothing written.'
  )
  for (const table of TABLES) await restoreTable(dir, table, apply, phase)
  if (!apply) console.log('\nRe-run with --apply to write these changes.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
