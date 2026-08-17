/**
 * Feed Wikimedia Commons photos into image_candidates so the vision pass can
 * consider them.
 *
 * RUNBOOK STEP 6a, between `recover-image-categories` (6) and
 * `pick-plant-images` (7a), and the order is the whole design: Trefle's
 * candidates are already in by 6, so this widens the pool BEFORE the vision
 * pass is billed, and the pick judges Trefle and Wikimedia together in one
 * call rather than being re-armed and paid for twice.
 *
 * For each plant in scope, this resolves the species' best Commons photo (see
 * lib/wikimedia.ts: the designated Wikidata P18 image, falling back to a
 * guarded Commons search), appends it to plants.image_candidates tagged
 * source='wikimedia' with its CC attribution, and clears image_checked_at so
 * scripts/pick-plant-images.ts re-picks that plant across the combined
 * Trefle + Wikimedia pool. The shortlist always keeps a Wikimedia candidate
 * (lib/image-shortlist.ts), and the pass writes the credit when one wins.
 *
 * It does NOT choose or write image_url_curated — it only widens the candidate
 * pool. The pick is the pass's job, and the human review is the review page's.
 *
 * TWO WAYS TO SAY WHICH PLANTS, and they answer different questions.
 *
 *   · A SCOPE FLAG (--round / --ids / --all) selects the plants that have
 *     nothing usable to judge — see needsWikimediaCandidate below. This is the
 *     pipeline path, and the gate is what makes it safe to run every round:
 *     it never touches a plant Trefle already covered, and it skips a plant
 *     that already carries a Wikimedia candidate, so a second run in the same
 *     round selects nothing, writes nothing, and re-arms nothing.
 *
 *     WITHOUT THAT GATE THIS STEP RE-BILLS THE VISION PASS. Clearing
 *     image_checked_at is what re-arms a row for pick-plant-images; a step
 *     that cleared it unconditionally every round would pay to re-judge the
 *     same plants forever, which is the shape this pipeline keeps finding.
 *
 *   · --file <path> takes an explicit list of common_names, one per line,
 *     '#' comments ignored, defaulting to reports/image-needs-photo.txt (the
 *     review's "needs a new photo" set). That is the human path: it re-feeds
 *     plants a REVIEWER rejected, which the gate above cannot see, and it is
 *     deliberately ungated so a re-feed after a URL-format change still works.
 *
 * WHAT THE GATE DOES NOT CATCH, and it matters because this step shrinks the
 * placeholder class rather than eliminating it:
 *
 *   · A plant whose shortlist is non-empty but whose candidates are all too
 *     small survives the gate and is rejected later, at probe time in
 *     pick-plant-images. Measuring here would mean fetching every candidate
 *     twice; the gate is deliberately the free, deterministic half.
 *   · P18 is Wikidata's designated IDENTIFICATION image, not a garden hero.
 *     Round 13's Malus spectabilis got a trunk-and-canopy shot with a person
 *     in it, and the vision pass correctly rejected it. Nothing takes a second
 *     look at wider Commons when P18 is poor.
 *
 * DRY RUN BY DEFAULT (house discipline): resolves and reports, writes nothing.
 * Pass --apply to write the candidates and clear image_checked_at.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --round 13
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --round 13 --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --ids <a,b,c>
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --all --why "<reason>"
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/feed-wikimedia-candidates.ts --file path/to/names.txt
 *
 * Then re-pick the widened plants (the runbook does this at 7a):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/pick-plant-images.ts --round 13
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

/**
 * THE GATE — has this plant got nothing for the vision pass to look at?
 *
 * Exported and pure so it can be called in a test: a gate that can only be
 * observed by running a round against the live catalog is a gate nothing pins.
 *
 * Two conditions, and the second is what makes the step idempotent:
 *
 *   1. `shortlist` — the same function pick-plant-images uses to decide what
 *      it will pay to look at — returns nothing. Asking the pass's own
 *      selector is the point: a plant with ten candidates filed under
 *      categories the shortlist never takes has exactly as little to judge as
 *      a plant with none, and a predicate written here from scratch would
 *      drift from the one that decides.
 *   2. It carries no Wikimedia candidate already. A plant this step has
 *      widened has been widened; selecting it again would clear
 *      image_checked_at a second time and re-bill its vision pick.
 */
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
    // Ambiguous or missing names are reported and skipped rather than guessed
    // — a wrong match would feed the wrong species' photo.
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
    // Never a bare .select() — Supabase caps unpaginated reads at 1000 rows.
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
    scope: scopeLabel,
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
    for (const [i, plant] of targets.entries()) {
      const label = `${pad(i + 1)}/${targets.length} ${plant.common_name}`

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
          unmatched.push(`${plant.common_name} (write failed)`)
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

// Guarded so the pure exports above can be imported by a test without the
// feeder running as a side effect of the import.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
