/**
 * Round manifests — the explicit, non-inferred record of what a seed round
 * added. A seed run writes one at the end (the IDs it actually inserted),
 * instead of anyone later inferring "this round's plants" from a calendar-day
 * created_at heuristic. The manifest is the key that ties a round's guard
 * reports together (see archive-round.ts).
 *
 * rounds/ is committed provenance (unlike the gitignored reports/ working
 * area). One directory per round label:
 *
 *   rounds/8/
 *     manifest.json      ← written by the seed run
 *     reports/           ← snapshotted from reports/ by archive-round.ts
 *
 * Labels are freeform but sanitized to a safe directory name ("round 8" and
 * "8" both become "8"; "herbs-batch" stays "herbs-batch").
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SeededPlant {
  id: string
  source_species_id: number | null
  common_name: string
}

export interface RoundManifest {
  label: string
  started_at: string
  finished_at: string
  seeded_count: number
  seeded_ids: string[]
  seeded: SeededPlant[]
}

// Strip a freeform label down to a safe directory segment. A leading "round-"
// is dropped so "round 8" and "8" collapse to the same folder.
export function sanitizeLabel(label: string): string {
  const clean = label
    .trim()
    .toLowerCase()
    .replace(/^round[\s_-]*/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!clean) throw new Error(`Invalid round label: "${label}"`)
  return clean
}

// Scripts run from apps/web, so rounds/ resolves to apps/web/rounds — the same
// convention backup-catalog.ts uses for backups/.
export function roundDir(label: string): string {
  return join(process.cwd(), 'rounds', sanitizeLabel(label))
}

export function writeRoundManifest(opts: {
  label: string
  startedAt: string
  seeded: SeededPlant[]
}): string {
  const dir = roundDir(opts.label)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'manifest.json')

  // A re-run of the same round (after a partial failure) replaces the
  // manifest, so it always reflects the current DB reality.
  const manifest: RoundManifest = {
    label: sanitizeLabel(opts.label),
    started_at: opts.startedAt,
    finished_at: new Date().toISOString(),
    seeded_count: opts.seeded.length,
    seeded_ids: opts.seeded.map((p) => p.id),
    seeded: opts.seeded,
  }
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  return path
}

export function readRoundManifest(label: string): RoundManifest | null {
  const path = join(roundDir(label), 'manifest.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as RoundManifest
}
