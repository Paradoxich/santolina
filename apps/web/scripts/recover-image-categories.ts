/**
 * Recover Trefle's per-image category labels into plants.image_candidates.
 *
 * WHY THIS EXISTS: Trefle returns images grouped by category —
 * { flower: [...], habit: [...], leaf: [...], bark: [...], fruit: [...] } —
 * but mapImages() in lib/trefle.ts flattens them into a bare text[] and keeps
 * only the flat list in plants.image_urls. The category label is discarded at
 * seed time, and it is the single most useful prefilter signal we have: a
 * "flower" image is a bloom shot by construction, a "habit" image is the whole
 * plant in frame. Those are exactly the two things the image pass is looking
 * for, so recovering them cuts the vision pass down from ~28 candidates per
 * plant to ~6 without downloading a single image.
 *
 * Trefle caps each category at 5 images, so a fully-populated species yields at
 * most 30 candidates and typically 10 in the two categories we care about.
 *
 * This writes ONLY plants.image_candidates. It never touches image_url or
 * image_urls, so a Trefle re-seed and this pass cannot fight each other.
 *
 * PROTECTION: by default only rows where image_candidates IS NULL are fetched,
 * so an interrupted run resumes exactly where it stopped and a re-run costs
 * nothing. --refresh re-fetches every row (use after a new seed batch, or if
 * Trefle has added images upstream).
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/recover-image-categories.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/recover-image-categories.ts --limit 10
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/recover-image-categories.ts --refresh
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getSpeciesBySlug } from '../lib/trefle'
import { fetchAllRows } from '../lib/paginate'
import type { ImageCandidate } from '../lib/image-shortlist'
import {
  requireScope,
  scopeIds,
  applyScope,
  describeScope,
  requireReasonForAll,
} from './scope'

// Trefle asks for a gentle crawl; matches seed-round7.ts.
const INTER_SPECIES_DELAY_MS = 1600
const MAX_ATTEMPTS = 3

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 3) => String(n).padStart(w, ' ')

interface PlantRow {
  id: string
  common_name: string
  source_species_id: number | null
}

function parseLimit(): number | null {
  const args = process.argv.slice(2)
  const i = args.indexOf('--limit')
  if (i < 0) return null
  const n = parseInt(args[i + 1] ?? '', 10)
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('--limit must be a positive integer')
  }
  return n
}

/**
 * Flatten Trefle's category map into labelled candidates, preserving order
 * within each category (Trefle returns its own preferred image first).
 *
 * Trefle emits an undocumented empty-string category key for uncategorised
 * images; those are real photos and worth keeping, just not worth trusting, so
 * they are labelled 'unknown' rather than silently dropped or mislabelled.
 */
export function extractCandidates(
  images: Record<string, { image_url?: string | null }[] | undefined> | null
): ImageCandidate[] {
  if (!images) return []

  const seen = new Set<string>()
  const out: ImageCandidate[] = []

  for (const rawCategory of Object.keys(images)) {
    const category = rawCategory.trim() === '' ? 'unknown' : rawCategory
    for (const img of images[rawCategory] ?? []) {
      const url = img?.image_url
      // Dedupe across categories — Trefle files some images under several.
      if (!url || seen.has(url)) continue
      seen.add(url)
      out.push({ url, category })
    }
  }

  return out
}

async function main() {
  const refresh = process.argv.slice(2).includes('--refresh')
  const limit = parseLimit()
  const supabase = getSupabaseAdmin()

  // Scope is mandatory, as on every pipeline step since the 2026-07-29 freeze.
  // `image_candidates IS NULL` is a state predicate, not a scope: it selects
  // every plant this pass has never reached, across every round, so a routine
  // run for a new batch would reach back into finished rounds.
  const scope = requireScope(
    'recover-image-categories',
    'This pass writes image_candidates, which is what the vision pass is ' +
      'allowed to look at. An unscoped run would reach into finished rounds.'
  )
  const scopeIdList = scopeIds(scope)
  const whyAll = requireReasonForAll(scope)
  console.log(describeScope(scope, scopeIdList))
  if (whyAll) console.log(`Whole-catalog run, because: ${whyAll}`)

  // Never a bare .select() — Supabase caps unpaginated reads at 1000 rows and
  // the catalog is past that (see docs/architecture.md#round-runbook). Ordered by id
  // rather than common_name because paging needs a unique column to be stable.
  let plants = await fetchAllRows<PlantRow>((from, to) => {
    let q = supabase
      .from('plants')
      .select('id, common_name, source_species_id')
      .not('source_species_id', 'is', null)
    if (!refresh) q = q.is('image_candidates', null)
    return applyScope(q, scopeIdList).order('id').range(from, to)
  })

  plants.sort((a, b) => a.common_name.localeCompare(b.common_name))
  if (limit) plants = plants.slice(0, limit)

  if (plants.length === 0) {
    console.log(
      refresh
        ? 'No plants with a source_species_id.'
        : 'Nothing to do — every plant already has image_candidates. Use --refresh to re-fetch.'
    )
    return
  }

  console.log(
    `Recovering image categories for ${plants.length} plant(s)${refresh ? ' (refresh)' : ''}.\n`
  )

  let recovered = 0
  let empty = 0
  let failed = 0
  const failures: string[] = []

  for (const [i, plant] of plants.entries()) {
    const label = `${pad(i + 1)}/${plants.length} ${plant.common_name}`

    let candidates: ImageCandidate[] | null = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const detail = await getSpeciesBySlug(plant.source_species_id!)
        candidates = extractCandidates(
          detail.images as Parameters<typeof extractCandidates>[0]
        )
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (attempt === MAX_ATTEMPTS) {
          console.log(
            `${label} — FAILED after ${MAX_ATTEMPTS} attempts: ${msg}`
          )
          failures.push(`${plant.common_name}: ${msg}`)
          failed++
        } else {
          // Exponential backoff; Trefle 429s under a fast crawl.
          await sleep(INTER_SPECIES_DELAY_MS * attempt * 2)
        }
      }
    }

    if (candidates) {
      const { error } = await supabase
        .from('plants')
        .update({ image_candidates: candidates })
        .eq('id', plant.id)

      if (error) {
        console.log(`${label} — DB write failed: ${error.message}`)
        failures.push(`${plant.common_name}: ${error.message}`)
        failed++
      } else {
        const byCategory = candidates.reduce<Record<string, number>>(
          (acc, c) => {
            acc[c.category] = (acc[c.category] ?? 0) + 1
            return acc
          },
          {}
        )
        const summary = Object.entries(byCategory)
          .map(([c, n]) => `${c} ${n}`)
          .join(', ')
        console.log(
          `${label} — ${candidates.length} candidate(s)${summary ? ` (${summary})` : ''}`
        )
        if (candidates.length === 0) empty++
        else recovered++
      }
    }

    if (i < plants.length - 1) await sleep(INTER_SPECIES_DELAY_MS)
  }

  console.log(
    `\nDone. ${recovered} recovered, ${empty} with no images upstream, ${failed} failed.`
  )
  if (failures.length) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
  }
  // A failed row stays unstamped (image_candidates IS NULL), so a plain re-run
  // retries exactly those without re-fetching everything.
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
