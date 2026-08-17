/**
 * Feed Wikimedia Commons photos into image_candidates so the vision pass can
 * consider them.
 *
 * For each plant in the input list, this resolves the species' best Commons
 * photo (see lib/wikimedia.ts: the designated Wikidata P18 image, falling back
 * to a guarded Commons search), appends it to plants.image_candidates tagged
 * source='wikimedia' with its CC attribution, and clears image_checked_at so
 * scripts/pick-plant-images.ts re-picks that plant across the combined
 * Trefle + Wikimedia pool. The shortlist always keeps a Wikimedia candidate
 * (lib/image-shortlist.ts), and the pass writes the credit when one wins.
 *
 * It does NOT choose or write image_url_curated — it only widens the candidate
 * pool. The pick is the pass's job, and the human review is the review page's.
 *
 * INPUT is a list of plant common_names, one per line, '#' comments ignored —
 * defaults to reports/image-needs-photo.txt (the review's "needs a new photo"
 * set). Scoping by an explicit list keeps it off plants a human already
 * confirmed, which a blanket confidence query could not.
 *
 * DRY RUN BY DEFAULT (house discipline): resolves and reports, writes nothing.
 * Pass --apply to write the candidates and clear image_checked_at.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --file path/to/names.txt
 *
 * Then re-pick the widened plants:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/pick-plant-images.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { fetchSpeciesCandidate } from '../lib/wikimedia'
import { isCommercialSafeLicense } from '../lib/image-attribution'
import type { ImageCandidate } from '../lib/image-shortlist'
import { withRunRecord, type Witness } from './run-provenance'

const DEFAULT_FILE = join(process.cwd(), 'reports', 'image-needs-photo.txt')
const INTER_PLANT_DELAY_MS = 500
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

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  image_candidates: ImageCandidate[] | null
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
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

  const supabase = getSupabaseAdmin()

  // Resolve names to rows by exact common_name. Ambiguous or missing names are
  // reported and skipped rather than guessed — a wrong match would feed the
  // wrong species' photo.
  const allRows = await fetchAllRows<PlantRow>((from, to) =>
    supabase
      .from('plants')
      .select('id, common_name, scientific_name, image_candidates')
      .order('id')
      .range(from, to)
  )
  const byName = new Map<string, PlantRow[]>()
  for (const r of allRows) {
    if (!byName.has(r.common_name)) byName.set(r.common_name, [])
    byName.get(r.common_name)!.push(r)
  }

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN —'} Wikimedia feed for ${names.length} plant(s) from ${file}.\n`
  )

  let added = 0
  let noP18 = 0
  let badLicense = 0
  let noSciName = 0
  const unmatched: string[] = []

  const runOptions = {
    step: 'feed-wikimedia-candidates',
    // image_checked_at is CLEARED here, not set — that is the whole purpose,
    // re-arming the row for pick-plant-images. A clearing write is still a
    // write, and declaring it is what makes the next witness decision explicit.
    writeSet: ['image_candidates', 'image_checked_at'],
    // SHAPE 12, and this is the case it exists for. The default witness would
    // count rows whose image_checked_at lands in the run's window; this run
    // NULLS it, so a nulled row matches no window and a run that correctly
    // cleared 30 observes 0 against a claim of 30 and files itself
    // CONTRADICTED — a correct run reporting that it was caught lying. It is
    // invisible to its own column by construction, and no later query can tell
    // "this run nulled it" from "it was never set". So both members are bounded
    // by updated_at instead.
    evidence: (['image_candidates', 'image_checked_at'] as const).map(
      (covers) => ({
        kind: 'row-touched' as const,
        covers,
        table: 'plants' as const,
        column: 'updated_at',
      })
    ) as Witness[],
    scope: `${names.length} name(s) from ${file}`,
    // No model: the candidate comes from Wikimedia's own P18 or a filtered
    // search, and the licence filter is the judgment. Those two are the recipe.
    recipe: {
      model: 'wikimedia',
      template:
        'P18 then isStraightSpeciesFile search, commercial-safe licences only',
      ingredients: {},
      decoding: {},
    },
  }

  const feedAll = async (wrote: (id: string) => void) => {
    for (const [i, name] of names.entries()) {
      const label = `${pad(i + 1)}/${names.length} ${name}`
      const matches = byName.get(name)

      if (!matches || matches.length === 0) {
        console.log(`${label} — no catalog plant with this name`)
        unmatched.push(name)
        continue
      }
      if (matches.length > 1) {
        console.log(
          `${label} — ambiguous (${matches.length} plants share this name), skipping`
        )
        unmatched.push(`${name} (ambiguous)`)
        continue
      }

      const plant = matches[0]!
      if (!plant.scientific_name) {
        console.log(`${label} — no scientific name, can't resolve Wikidata`)
        noSciName++
        await sleep(INTER_PLANT_DELAY_MS)
        continue
      }

      // P18 first, then a guarded Commons search. A species with no DESIGNATED
      // photo very often still has photographs — round 12's Filipendula purpurea
      // had ten — and reporting the narrower answer as the broader one is what
      // sent that plant to production with a placeholder. See fetchSpeciesCandidate.
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

      // Never ingest a photo we can't legally use in a commercial product —
      // GFDL-only, NC, ND. The credit would be a lie and the use a risk.
      if (!isCommercialSafeLicense(candidate.attribution.license)) {
        console.log(
          `${label} — SKIP: licence "${candidate.attribution.license ?? 'unknown'}" not commercial-safe`
        )
        badLicense++
        await sleep(INTER_PLANT_DELAY_MS)
        continue
      }

      // Replace any prior Wikimedia candidate rather than stacking — re-running
      // the feeder (e.g. after a URL-format change) must be idempotent, not
      // additive. Trefle candidates are left untouched.
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
          unmatched.push(`${name} (write failed)`)
          await sleep(INTER_PLANT_DELAY_MS)
          continue
        }
        wrote(plant.id)
      }

      // `via` is printed, not swallowed: a P18 hit is somebody's considered pick
      // for the taxon, a search hit is ours filtered by isStraightSpeciesFile.
      // The reviewer should be able to tell which one they are looking at.
      console.log(
        `${label} — ${apply ? 'added' : 'would add'} ${candidate.width}x${candidate.height} (${candidate.attribution.license ?? 'license?'}, via ${via})`
      )
      added++
      await sleep(INTER_PLANT_DELAY_MS)
    }
  }

  // A dry run opens NO run: it queries Wikimedia and writes nothing.
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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
