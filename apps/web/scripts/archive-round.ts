/**
 * Snapshot the current reports/ working area into a round's committed folder,
 * so a round's guard findings survive as history instead of being overwritten
 * by the next run (cross-check-native-to writes fixed filenames; the deferred
 * seasonal_rhythm candidates only ever lived in a report nobody kept).
 *
 * Guards keep writing to the gitignored reports/ as before — this is a
 * separate, dumb one-job step run after a round's checks are done. The round
 * label ties the archive to that round's seed manifest (round-manifest.ts).
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/archive-round.ts --round 8
 *
 * `--catalog-only` refreshes the committed catalog snapshot and leaves the
 * archived reports alone, for when a round's rows have moved since it closed.
 * `--skip-catalog` is the other half: archive the reports, snapshot nothing.
 *
 * Copies every file currently in reports/ into rounds/<label>/reports/. Stale
 * files from an earlier run are copied too — clear reports/ before a round's
 * guards if you want a clean snapshot.
 *
 * It also archives the catalog itself, gzipped, into rounds/<label>/catalog/ —
 * the round's `before` state (its rollback point, from backups/) and its
 * `after` state (read live). That is the only off-machine copy of the catalog
 * that exists; see catalog-snapshot.ts for why it has to be, and why this does
 * not contradict the reference-data exclusion below. `--skip-catalog` opts out.
 */

import {
  mkdirSync,
  readdirSync,
  copyFileSync,
  statSync,
  existsSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { fetchAllRows } from '../lib/paginate'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import {
  CATALOG_TABLES,
  type CatalogTable,
  catalogDir,
  readSnapshot,
  resolveBaselineDir,
  type Row,
  snapshotPath,
  writeSnapshot,
} from './catalog-snapshot'
import { roundDir, readRoundManifest } from './round-manifest'

/**
 * Files that live in reports/ but are NOT a round's findings — static
 * reference data and fetch caches. They are byte-identical (or near enough)
 * every round, and `rounds/` is committed, so archiving them adds ~2.7MB of
 * duplicate binary to the repo per round while telling a future reader
 * nothing about what this round found. level3.geojson alone is 2.1MB.
 *
 * The distinction is working area vs. finding: a cache is re-downloadable and
 * disposable, a guard report is the round's history.
 */
const NOT_A_FINDING = new Set([
  'level3.geojson', // TDWG source geometry, downloaded once
  'wgsrpd-l3-map.json', // derived from the geojson above
  'trefle-native-cache.json', // Trefle fetch cache
  'native_to-l2-cache.json', // model-fallback cache
  'wcvp-native-cache.json', // GBIF/WCVP fetch cache
])

function parseRoundLabel(): string {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--round')
  const label = idx >= 0 ? args[idx + 1] : undefined
  if (!label) {
    console.error(
      'Usage: archive-round.ts --round <label> [--skip-catalog]   (e.g. --round 8)'
    )
    process.exit(1)
  }
  return label
}

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`

async function fetchTable(table: CatalogTable): Promise<Row[]> {
  const db = getSupabaseAdmin()
  return fetchAllRows<Row>((from, to) =>
    db.from(table).select('*').order('id').range(from, to)
  )
}

/**
 * Archive the catalog either side of the round. `before` is copied from the
 * round's pre-seed backup rather than re-derived — that specific file is the
 * rollback point for everything the round wrote, and it is the artifact that
 * has already come close to being lost. `after` is read live, so the newest
 * catalog state is always committed somewhere too.
 */
async function archiveCatalog(label: string, startedAt: string | null) {
  const dir = catalogDir(label)
  mkdirSync(dir, { recursive: true })

  const counts: Record<string, Record<string, number>> = {
    before: {},
    after: {},
  }
  let baselineDir: string | null = null
  let baselineSource: string | null = null

  if (startedAt) {
    try {
      const resolved = resolveBaselineDir(label, startedAt)
      baselineDir = resolved.dir
      baselineSource = resolved.source
    } catch (err) {
      // A missing baseline must not abort the archive — the `after` snapshot is
      // the more important half and is still worth writing.
      console.log(`\n⚠ No pre-round baseline found: ${(err as Error).message}`)
    }
  }

  console.log('\nCatalog snapshots:')
  for (const table of CATALOG_TABLES) {
    if (baselineDir) {
      const rows = readSnapshot(baselineDir, table)
      if (rows) {
        const size = writeSnapshot(snapshotPath(label, 'before', table), rows)
        counts.before![table] = rows.length
        console.log(
          `  before-${table}.json.gz — ${rows.length} rows, ${kb(size)}`
        )
      }
    }
    const live = await fetchTable(table)
    const size = writeSnapshot(snapshotPath(label, 'after', table), live)
    counts.after![table] = live.length
    console.log(`  after-${table}.json.gz — ${live.length} rows, ${kb(size)}`)
  }

  writeFileSync(
    join(dir, 'meta.json'),
    JSON.stringify(
      {
        round: label,
        captured_at: new Date().toISOString(),
        baseline_dir: baselineDir,
        baseline_source: baselineSource,
        counts,
      },
      null,
      2
    ) + '\n'
  )
}

async function main() {
  const label = parseRoundLabel()
  const skipCatalog = process.argv.includes('--skip-catalog')
  const catalogOnly = process.argv.includes('--catalog-only')
  const reportsDir = join(process.cwd(), 'reports')

  // Refresh the catalog snapshot without touching the archived reports. The
  // catalog keeps changing after a round ends — corrections, backfills — so the
  // committed `after-*` copy goes stale and stops being a usable recovery point
  // for the CURRENT catalog. Re-running the full archive is the wrong fix: it
  // would also re-copy whatever happens to be sitting in reports/ now, which by
  // then includes unrelated history from later work.
  if (catalogOnly) {
    const manifest = readRoundManifest(label)
    await archiveCatalog(label, manifest?.started_at ?? null)
    return
  }

  if (!existsSync(reportsDir)) {
    console.error(
      `No reports/ directory at ${reportsDir} — nothing to archive. ` +
        'Run the round guards first.'
    )
    process.exit(1)
  }

  const all = readdirSync(reportsDir).filter((f) =>
    statSync(join(reportsDir, f)).isFile()
  )
  const files = all.filter((f) => !NOT_A_FINDING.has(f))
  const skipped = all.filter((f) => NOT_A_FINDING.has(f))
  if (!files.length) {
    console.error('reports/ holds no round findings — nothing to archive.')
    process.exit(1)
  }

  const dest = join(roundDir(label), 'reports')
  mkdirSync(dest, { recursive: true })
  for (const file of files) {
    copyFileSync(join(reportsDir, file), join(dest, file))
    console.log(`  ${file}`)
  }

  if (skipped.length) {
    console.log(
      `\nSkipped ${skipped.length} non-finding file(s): ${skipped.join(', ')}`
    )
  }

  const manifest = readRoundManifest(label)
  console.log(
    `\nArchived ${files.length} report file(s) to ${dest}` +
      (manifest
        ? ` (round seeded ${manifest.seeded_count} plant(s) on ${manifest.started_at.slice(0, 10)}).`
        : '\nNote: no manifest.json for this round yet — was the seed run tagged with --round?')
  )

  if (skipCatalog) {
    console.log(
      '\n⚠ --skip-catalog: no catalog snapshot written. The gitignored ' +
        'backups/ stays the only copy of this round’s state.'
    )
    return
  }
  await archiveCatalog(label, manifest?.started_at ?? null)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
