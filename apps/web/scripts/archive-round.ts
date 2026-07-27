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
 * Copies every file currently in reports/ into rounds/<label>/reports/. Stale
 * files from an earlier run are copied too — clear reports/ before a round's
 * guards if you want a clean snapshot.
 */

import {
  mkdirSync,
  readdirSync,
  copyFileSync,
  statSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'

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
])

function parseRoundLabel(): string {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--round')
  const label = idx >= 0 ? args[idx + 1] : undefined
  if (!label) {
    console.error('Usage: archive-round.ts --round <label>   (e.g. --round 8)')
    process.exit(1)
  }
  return label
}

function main() {
  const label = parseRoundLabel()
  const reportsDir = join(process.cwd(), 'reports')

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
}

main()
