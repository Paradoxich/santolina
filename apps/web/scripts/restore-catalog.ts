/**
 * Restore a backup-catalog.ts snapshot. Dry-run by default: shows what would
 * change and touches nothing. Pass --apply to write.
 *
 * Semantics: every backed-up row is upserted by id, so rows corrupted or
 * deleted since the backup are put back exactly as they were. Rows CREATED
 * after the backup are reported but never deleted — removing data is a human
 * decision, not a restore side effect.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/restore-catalog.ts \
 *     backups/<stamp>            # dry run
 *     backups/<stamp> --apply    # write
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { getSupabaseAdmin } from '../lib/supabase-admin'

const TABLES = ['plants', 'plant_combinations'] as const

type Row = Record<string, unknown> & { id: string }

function loadBackup(dir: string, table: string): Row[] {
  const rows = JSON.parse(
    readFileSync(join(dir, `${table}.json`), 'utf8')
  ) as Row[]
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as {
    counts: Record<string, number>
  }
  if (rows.length !== meta.counts[table]) {
    throw new Error(
      `${table}.json has ${rows.length} rows but meta.json recorded ` +
        `${meta.counts[table]} — backup looks incomplete, refusing to restore`
    )
  }
  return rows
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

async function restoreTable(
  dir: string,
  table: string,
  apply: boolean
): Promise<void> {
  const backedUp = loadBackup(dir, table)
  const current = await fetchCurrent(table)

  const changed = backedUp.filter((row) => {
    const now = current.get(row.id)
    return !now || JSON.stringify(now) !== JSON.stringify(row)
  })
  const missing = changed.filter((row) => !current.has(row.id)).length
  const backedUpIds = new Set(backedUp.map((r) => r.id))
  const createdSince = [...current.keys()].filter((id) => !backedUpIds.has(id))

  console.log(`\n${table}:`)
  console.log(`  backup ${backedUp.length} rows, live ${current.size} rows`)
  console.log(
    `  ${changed.length} row(s) differ (${missing} deleted since backup)`
  )
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
  const dir = args.find((a) => !a.startsWith('--'))
  if (!dir) {
    console.error(
      'Usage: restore-catalog.ts <backup dir> [--apply]\n' +
        'e.g.   restore-catalog.ts backups/2026-07-15T21-17-33-191Z'
    )
    process.exit(1)
  }

  console.log(
    apply ? 'RESTORE — writing to the live DB.' : 'Dry run — nothing written.'
  )
  for (const table of TABLES) await restoreTable(dir, table, apply)
  if (!apply) console.log('\nRe-run with --apply to write these changes.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
