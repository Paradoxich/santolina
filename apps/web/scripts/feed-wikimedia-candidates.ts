/**
 * Feed Wikimedia Commons photos into image_candidates so the vision pass can
 * consider them. Runbook step 6a. Does not choose a hero.
 *
 * A scope flag selects the plants with nothing usable to judge; --file takes an
 * explicit list of common_names for a reviewer-driven re-feed. See
 * docs/curation.md#wikimedia-attribution.
 *
 * Dry run by default. Pass --apply to write the candidates and clear
 * image_checked_at.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --round 13
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --round 13 --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --ids <a,b,c>
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --all --why "<reason>"
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --file path/to/names.txt
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { fetchSpeciesCandidate } from '../lib/wikimedia'
import { isCommercialSafeLicense } from '../lib/image-attribution'
import { shortlist, type ImageCandidate } from '../lib/image-shortlist'
import {
  parseScope,
  scopeIds,
  applyScope,
  describeScope,
  requireReasonForAll,
} from './scope'
import { withRunRecord, type Witness } from './run-provenance'

const DEFAULT_FILE = join(process.cwd(), 'reports', 'image-needs-photo.txt')
const INTER_PLANT_DELAY_MS = 500
const PLANT_COLUMNS =
  'id, common_name, scientific_name, image_url, image_candidates'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 2) => String(n).padStart(w, ' ')

function parseFlag(name: string): string | null {
  const args = process.argv.slice(2)
  const i = args.indexOf(name)
  if (i < 0) return null
  const v = args[i + 1]
  if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`)
  return v
}

/** Plant common_names, one per line, skipping '#' comments and blanks. */
export function parseNameList(text: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    if (!seen.has(line)) {
      seen.add(line)
      names.push(line)
    }
  }
  return names
}

export interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  image_url: string | null
  image_candidates: ImageCandidate[] | null
}

/** Has this plant nothing for the vision pass to look at? Asks `shortlist`,
 * the selector the pass itself uses, and skips a plant already widened. */
export function needsWikimediaCandidate(row: {
  image_url: string | null
  image_candidates: ImageCandidate[] | null
}): boolean {
  const candidates = row.image_candidates ?? []
  if (candidates.some((c) => c.source === 'wikimedia')) return false
  return shortlist(candidates, row.image_url).length === 0
}

/** Resolve an explicit name list to rows, reporting what it could not match. */
function resolveNames(
  names: string[],
  allRows: PlantRow[]
): { targets: PlantRow[]; unmatched: string[] } {
  const byName = new Map<string, PlantRow[]>()
  for (const r of allRows) {
    if (!byName.has(r.common_name)) byName.set(r.common_name, [])
    byName.get(r.common_name)!.push(r)
  }

  const targets: PlantRow[] = []
  const unmatched: string[] = []
  for (const name of names) {
    const matches = byName.get(name)
    // Ambiguous or missing names are skipped rather than guessed.
    if (!matches || matches.length === 0) {
      console.log(`${name} — no catalog plant with this name`)
      unmatched.push(name)
      continue
    }
    if (matches.length > 1) {
      console.log(
        `${name} — ambiguous (${matches.length} plants share this name), skipping`
      )
      unmatched.push(`${name} (ambiguous)`)
      continue
    }
    targets.push(matches[0]!)
  }
  return { targets, unmatched }
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const scope = parseScope()
  const supabase = getSupabaseAdmin()

  let targets: PlantRow[]
  const unmatched: string[] = []
  let scopeLabel: string

  if (scope) {
    const scopeIdList = scopeIds(scope)
    const whyAll = requireReasonForAll(scope)
    // Paginated (standing rule 5).
    const inScope = await fetchAllRows<PlantRow>((from, to) =>
      applyScope(supabase.from('plants').select(PLANT_COLUMNS), scopeIdList)
        .order('id')
        .range(from, to)
    )
    targets = inScope.filter(needsWikimediaCandidate)
    scopeLabel =
      `${describeScope(scope, scopeIdList)} — ` +
      `${targets.length} of ${inScope.length} with nothing usable to judge`
    console.log(describeScope(scope, scopeIdList))
    if (whyAll) console.log(`Whole-catalog run, because: ${whyAll}`)
    console.log(
      `${targets.length} of ${inScope.length} plant(s) in scope have nothing ` +
        `for the vision pass to look at.`
    )
  } else {
    const file = parseFlag('--file') ?? DEFAULT_FILE
    let names: string[]
    try {
      names = parseNameList(readFileSync(file, 'utf8'))
    } catch {
      console.error(`Couldn't read ${file}.`)
      process.exit(1)
    }
    if (names.length === 0) {
      console.log('No plant names in the input file.')
      return
    }
    const allRows = await fetchAllRows<PlantRow>((from, to) =>
      supabase.from('plants').select(PLANT_COLUMNS).order('id').range(from, to)
    )
    const resolved = resolveNames(names, allRows)
    targets = resolved.targets
    unmatched.push(...resolved.unmatched)
    scopeLabel = `${names.length} name(s) from ${file}`
  }

  if (targets.length === 0) {
    console.log(
      `\nNothing to feed${unmatched.length ? ` (${unmatched.length} unmatched)` : ''}.`
    )
    return
  }

  console.log(
    `\n${apply ? 'APPLYING' : 'DRY RUN —'} Wikimedia feed for ${targets.length} plant(s).\n`
  )

  let added = 0
  let noP18 = 0
  let badLicense = 0
  let noSciName = 0

  const runOptions = {
    step: 'feed-wikimedia-candidates',
    // image_checked_at is cleared here, not set, to re-arm the row.
    writeSet: ['image_candidates', 'image_checked_at'],
    // A cleared stamp cannot witness itself, so both members are bounded by
    // updated_at (shape 12).
    evidence: (['image_candidates', 'image_checked_at'] as const).map(
      (covers) => ({
        kind: 'row-touched' as const,
        covers,
        table: 'plants' as const,
        column: 'updated_at',
      })
    ) as Witness[],
    scope: scopeLabel,
    recipe: {
      model: 'wikimedia',
      template:
        'P18 then isStraightSpeciesFile search, commercial-safe licences only',
      ingredients: {},
      decoding: {},
    },
  }

  const feedAll = async (wrote: (id: string) => void) => {
    for (const [i, plant] of targets.entries()) {
      const label = `${pad(i + 1)}/${targets.length} ${plant.common_name}`

      if (!plant.scientific_name) {
        console.log(`${label} — no scientific name, can't resolve Wikidata`)
        noSciName++
        await sleep(INTER_PLANT_DELAY_MS)
        continue
      }

      // P18 first, then a guarded Commons search.
      const found = await fetchSpeciesCandidate(plant.scientific_name)
      if (!found) {
        console.log(
          `${label} — no usable photo (no P18, no matching Commons file)`
        )
        noP18++
        await sleep(INTER_PLANT_DELAY_MS)
        continue
      }
      const { candidate, via } = found

      // Commercial-safe licences only.
      if (!isCommercialSafeLicense(candidate.attribution.license)) {
        console.log(
          `${label} — SKIP: licence "${candidate.attribution.license ?? 'unknown'}" not commercial-safe`
        )
        badLicense++
        await sleep(INTER_PLANT_DELAY_MS)
        continue
      }

      // Replace any prior Wikimedia candidate rather than stacking.
      const trefleOnly = (plant.image_candidates ?? []).filter(
        (c) => c.source !== 'wikimedia'
      )
      const merged: ImageCandidate[] = [
        ...trefleOnly,
        {
          url: candidate.url,
          category: 'wikimedia',
          source: 'wikimedia',
          attribution: candidate.attribution,
        },
      ]

      if (apply) {
        const { error } = await supabase
          .from('plants')
          // Clearing image_checked_at re-arms the plant for pick-plant-images.ts,
          // which processes rows where image_checked_at IS NULL.
          .update({ image_candidates: merged, image_checked_at: null })
          .eq('id', plant.id)
        if (error) {
          console.log(`${label} — write failed: ${error.message}`)
          unmatched.push(`${plant.common_name} (write failed)`)
          await sleep(INTER_PLANT_DELAY_MS)
          continue
        }
        wrote(plant.id)
      }

      console.log(
        `${label} — ${apply ? 'added' : 'would add'} ${candidate.width}x${candidate.height} (${candidate.attribution.license ?? 'license?'}, via ${via})`
      )
      added++
      await sleep(INTER_PLANT_DELAY_MS)
    }
  }

  if (apply) {
    await withRunRecord(runOptions, (run) => feedAll((id) => run.wrote(id)))
  } else {
    await feedAll(() => {})
  }

  console.log(
    `\n${apply ? 'Done' : 'Dry run'}: ${added} Wikimedia candidate(s) ${apply ? 'added' : 'to add'}, ` +
      `${noP18} with no usable photo, ${badLicense} with an unusable licence, ${noSciName} with no scientific name, ${unmatched.length} unmatched.`
  )
  if (unmatched.length) {
    console.log('\nUnmatched / skipped:')
    for (const u of unmatched) console.log(`  - ${u}`)
  }
  if (apply && added > 0) {
    console.log(
      `\nNow re-pick the widened plants:\n  ./node_modules/.bin/tsx --env-file=.env.local scripts/pick-plant-images.ts`
    )
  } else if (!apply && added > 0) {
    console.log('\nRe-run with --apply to write these candidates.')
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
