/**
 * Catalog snapshots — the durable, off-machine copy of the plant catalog.
 *
 * WHY THIS EXISTS. `backups/` is gitignored, so before this the only copy of
 * any catalog state lived on one laptop. Supabase's daily backups do not close
 * the gap: **Free-plan projects cannot download or restore them** (they only
 * unlock on upgrade), so the JSON dumps are the only recovery path we control.
 * The July 27 session came within one `git worktree remove` of destroying the
 * sole copy of the pre-round-8 catalog — the rollback point for everything that
 * round wrote to production.
 *
 * The catalog is not reconstructible by re-running the pipeline: curation is a
 * stochastic model pass, so a re-run produces different text, and the editorial
 * corrections on top of it are one-of-a-kind.
 *
 * ON THE ~2MB PER ROUND THIS ADDS TO THE REPO. archive-round.ts deliberately
 * *stopped* copying bulk binary into `rounds/` (level3.geojson and the fetch
 * caches, ~2.7MB a round). That is not reversed here, because the rule it drew
 * was working area vs. finding: a cache is re-downloadable and disposable. A
 * catalog dump is the opposite of disposable — it is the only copy, and it is
 * the one thing in `reports/` that could not be regenerated. Gzip keeps it to
 * roughly 1.1MB per snapshot against 5.9MB raw.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { join } from 'node:path'

import { roundDir } from './round-manifest'

/** The two tables the plant pipeline mutates (matches backup-catalog.ts). */
export const CATALOG_TABLES = ['plants', 'plant_combinations'] as const
export type CatalogTable = (typeof CATALOG_TABLES)[number]

export type Row = Record<string, unknown>

export function catalogDir(label: string): string {
  return join(roundDir(label), 'catalog')
}

export function snapshotPath(
  label: string,
  phase: 'before' | 'after',
  table: CatalogTable
): string {
  return join(catalogDir(label), `${phase}-${table}.json.gz`)
}

export function writeSnapshot(path: string, rows: Row[]): number {
  const gz = gzipSync(Buffer.from(JSON.stringify(rows)), { level: 9 })
  writeFileSync(path, gz)
  return gz.byteLength
}

/**
 * Read a table from a snapshot directory, accepting either the gzipped form
 * written here or the plain JSON that backup-catalog.ts writes — so a caller
 * can point at an archived round or a raw backup without caring which.
 */
export function readSnapshot(dir: string, table: CatalogTable): Row[] | null {
  for (const [file, decode] of [
    [`${table}.json`, (b: Buffer) => b],
    [`${table}.json.gz`, gunzipSync],
    [`before-${table}.json.gz`, gunzipSync],
  ] as const) {
    const path = join(dir, file)
    if (existsSync(path))
      return JSON.parse(decode(readFileSync(path)).toString('utf8')) as Row[]
  }
  return null
}

/**
 * The last catalog state captured at or before `startedAt` — a round's rollback
 * point. Prefers the gitignored `backups/` working area, then falls back to the
 * committed archive of any round, which is what makes this work in a fresh
 * clone or worktree where `backups/` does not exist at all.
 */
export function resolveBaselineDir(
  label: string,
  startedAt: string,
  explicit?: string
): { dir: string; source: 'explicit' | 'backups' | 'archive' } {
  const backupsDir = join(process.cwd(), 'backups')

  if (explicit) {
    const dir = explicit.includes('/') ? explicit : join(backupsDir, explicit)
    if (!readSnapshot(dir, 'plants'))
      throw new Error(`No plants snapshot in baseline ${dir}`)
    return { dir, source: 'explicit' }
  }

  const started = Date.parse(startedAt)

  if (existsSync(backupsDir)) {
    const candidates = readdirSync(backupsDir)
      .map((name) => join(backupsDir, name))
      .filter((dir) => existsSync(join(dir, 'meta.json')))
      .map((dir) => ({
        dir,
        at: Date.parse(
          (
            JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as {
              created_at: string
            }
          ).created_at
        ),
      }))
      .filter((b) => Number.isFinite(b.at) && b.at <= started)
      .sort((a, b) => b.at - a.at)
    if (candidates.length) return { dir: candidates[0]!.dir, source: 'backups' }
  }

  // The round's own archive is the best fallback, and it is NOT selected by
  // timestamp: the archive is written when the round ends, so its captured_at
  // is later than startedAt, but the `before-*` snapshot inside it is precisely
  // the state at startedAt. Filtering these by capture time excludes the one
  // archive that actually holds the answer.
  const own = catalogDir(label)
  if (readSnapshot(own, 'plants')) return { dir: own, source: 'archive' }

  throw new Error(
    `No catalog snapshot at or before ${startedAt}. Checked backups/ and ` +
      `${own}. Pass an explicit baseline if it lives elsewhere.`
  )
}
