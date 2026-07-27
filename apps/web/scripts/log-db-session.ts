/**
 * Append a session entry to `docs/database-log.md`.
 *
 * WHY THIS IS A SCRIPT AND NOT A CONVENTION. A log that depends on someone
 * remembering to write it is a log that goes stale, and a stale log is worse
 * than none — the next session trusts it. So the facts are read from the live
 * database and the round manifest, not typed from memory:
 *
 *   · catalog totals, at the moment of writing
 *   · which of the round's plants exist, and what the round seeded
 *   · which pipeline steps actually ran, via scripts/round-status.ts
 *
 * The narrative half (what bit us, what we chose not to do) is still yours to
 * write — the script leaves clearly marked TODO lines for it, because that is
 * the part no query can produce and the part the next session most needs.
 *
 * It is deliberately additive: it inserts under the `## Sessions` marker and
 * never rewrites the traps above it. Re-running for the same round is refused
 * rather than duplicated.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/log-db-session.ts --round 8
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/log-db-session.ts --round 8 --dry-run
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { readRoundManifest } from './round-manifest'
import { roundStatus, formatStatus } from './round-status'

const LOG_PATH = join(process.cwd(), '..', '..', 'docs', 'database-log.md')
const SESSIONS_MARKER = '## Sessions'

function parseRound(): string {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--round')
  const label = idx >= 0 ? args[idx + 1] : undefined
  if (!label || label.startsWith('--')) {
    throw new Error(
      'Usage: log-db-session.ts --round <label> [--dry-run]\n' +
        'The label must match a rounds/<label>/manifest.json.'
    )
  }
  return label
}

function currentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
    }).trim()
  } catch {
    return '(unknown branch)'
  }
}

/** Today in UTC, as YYYY-MM-DD. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function catalogTotals(): Promise<{
  plants: number
  combos: number
  curated: number
}> {
  const db = getSupabaseAdmin()
  const [plants, combos, curated] = await Promise.all([
    db.from('plants').select('*', { count: 'exact', head: true }),
    db.from('plant_combinations').select('*', { count: 'exact', head: true }),
    db
      .from('plants')
      .select('*', { count: 'exact', head: true })
      .eq('is_curated', true),
  ])
  return {
    plants: plants.count ?? 0,
    combos: combos.count ?? 0,
    curated: curated.count ?? 0,
  }
}

async function main() {
  const label = parseRound()
  const dryRun = process.argv.slice(2).includes('--dry-run')

  if (!existsSync(LOG_PATH)) {
    throw new Error(`No database log at ${LOG_PATH}`)
  }
  const log = readFileSync(LOG_PATH, 'utf8')
  if (!log.includes(SESSIONS_MARKER)) {
    throw new Error(
      `${LOG_PATH} has no "${SESSIONS_MARKER}" marker to insert under.`
    )
  }

  const manifest = readRoundManifest(label)
  if (!manifest) {
    throw new Error(
      `No manifest for round "${label}" — expected rounds/${label}/manifest.json. ` +
        'Was the seed run tagged with --round?'
    )
  }

  const heading = `### ${today()} — Round ${manifest.label}`
  if (log.includes(heading)) {
    console.error(
      `An entry for "${heading}" already exists. Edit it by hand rather than ` +
        'appending a second one — this script refuses to duplicate.'
    )
    process.exit(1)
  }

  const [totals, steps] = await Promise.all([
    catalogTotals(),
    roundStatus(manifest.seeded_ids),
  ])

  const incomplete = steps.filter((s) => !s.complete)
  const entry = [
    heading,
    '',
    `**Branch** \`${currentBranch()}\`. Seeded ${manifest.seeded_count} plant(s) on ${manifest.started_at.slice(0, 10)}.`,
    '',
    `Catalog now **${totals.plants} species / ${totals.combos} combinations** (${totals.curated} with \`is_curated = true\`).`,
    '',
    'Pipeline steps for this round:',
    '',
    '```',
    ...formatStatus(steps),
    '```',
    '',
    incomplete.length
      ? `⚠️ **${incomplete.length} step(s) did not complete:** ${incomplete.map((s) => s.step).join(', ')}. Say why here, or finish them.`
      : 'All pipeline steps complete.',
    '',
    '**What bit us:** TODO — anything that cost time, money, or nearly cost data. If it is a new class of problem, add it to "Known traps" above instead and link it from here.',
    '',
    '**Deliberately not done:** TODO — decisions left open, and for whom.',
    '',
    '---',
  ].join('\n')

  if (dryRun) {
    console.log(entry)
    console.log('(dry run — nothing written)')
    return
  }

  // Insert directly beneath the marker and its HTML comment, so newest is first.
  const idx = log.indexOf(SESSIONS_MARKER)
  const afterMarker = log.indexOf('\n', idx) + 1
  const commentEnd = log.indexOf('-->', afterMarker)
  const insertAt =
    commentEnd >= 0 && commentEnd < log.indexOf('###', afterMarker)
      ? log.indexOf('\n', commentEnd) + 1
      : afterMarker

  // Normalise the seams so repeated appends can't accumulate or swallow blank
  // lines — the entry always lands with exactly one blank line either side.
  const before = log.slice(0, insertAt).replace(/\n+$/, '\n')
  const after = log.slice(insertAt).replace(/^\n+/, '')
  writeFileSync(LOG_PATH, `${before}\n${entry}\n\n${after}`)

  console.log(`Appended "${heading}" to docs/database-log.md.`)
  console.log(
    'Now fill in the two TODO lines — they are the part queries cannot write.'
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
