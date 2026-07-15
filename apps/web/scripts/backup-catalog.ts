/**
 * Pre-round catalog backup — dumps the two tables the plant-expansion
 * pipeline mutates (plants, plant_combinations) to dated JSON files under
 * backups/. Read-only against the DB; restore with restore-catalog.ts.
 *
 * JSON via the service-role client rather than pg_dump on purpose: the
 * failure mode this protects against is a bad script run corrupting rows
 * (whole-database disaster recovery is Supabase's own backups), and this
 * route needs no extra secret and no version-matched local binary.
 *
 * Run before every seed round (step 0 of the docs/architecture.md §25
 * cadence):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backup-catalog.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { getSupabaseAdmin } from '../lib/supabase-admin'

const TABLES = ['plants', 'plant_combinations'] as const

// Page through the whole table — a bare select is silently capped at 1000
// rows by Supabase, and plant_combinations is already past that.
async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const db = getSupabaseAdmin()
  const pageSize = 1000
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return rows
  }
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(process.cwd(), 'backups', stamp)
  mkdirSync(dir, { recursive: true })

  const counts: Record<string, number> = {}
  for (const table of TABLES) {
    console.log(`Fetching ${table}...`)
    const rows = await fetchAll(table)
    counts[table] = rows.length
    writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2))
    console.log(`  ${rows.length} rows → ${table}.json`)
  }

  writeFileSync(
    join(dir, 'meta.json'),
    JSON.stringify({ created_at: new Date().toISOString(), counts }, null, 2)
  )
  console.log(`\nBackup written to ${dir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
