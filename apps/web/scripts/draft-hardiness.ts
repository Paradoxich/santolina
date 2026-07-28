/**
 * Draft an RHS hardiness rating (H1a-H7) for every catalog plant that does not
 * have one yet. This is the AI baseline pass in the hardiness data model: it
 * writes plants.hardiness_rating and leaves plants.hardiness_verified = false.
 * A human later verifies each against RHS public plant pages and flips
 * hardiness_verified to true; the UI only asserts hardiness confidently once
 * verified.
 *
 * PROTECTION: by default this only touches rows where hardiness_rating IS NULL,
 * so it never overwrites a rating a human has already reviewed (verified rows
 * always have a rating). Trefle re-seeds can't touch hardiness_rating either —
 * it isn't referenced by upsert_trefle_plant.
 *
 * The rating is drafted BLIND from species identity only (names + family), the
 * same discipline as the cross-check — no stored value is shown to the model.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/draft-hardiness.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/draft-hardiness.ts --limit 10
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/draft-hardiness.ts --redraft-unverified
 *
 * --redraft-unverified also re-drafts rows that already have a rating but are
 * not yet verified (use after a prompt change). Verified rows are never touched.
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import { isHardinessRating, type HardinessRating } from '../lib/hardiness'
import type { DbPlant } from '../lib/plants-db'

const INTER_PLANT_DELAY_MS = 2000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 3) => String(n).padStart(w, ' ')

function parseLimit(): number | null {
  const args = process.argv.slice(2)
  const i = args.indexOf('--limit')
  if (i < 0) return null
  const n = parseInt(args[i + 1] ?? '', 10)
  if (!Number.isFinite(n) || n < 1)
    throw new Error('--limit must be a positive integer')
  return n
}

function buildPrompt(plant: DbPlant): string {
  const identity = [
    `common name: ${plant.common_name}`,
    plant.scientific_name ? `scientific name: ${plant.scientific_name}` : '',
    plant.family ? `family: ${plant.family}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return `You are a horticultural expert on the RHS (Royal Horticultural Society) hardiness rating system. Give the single RHS hardiness rating for the base species below (classify the species, not tender cultivars).

${identity}

The RHS scale (minimum temperature the plant withstands):
H1a  warmer than 15C   (tropical, under glass)
H1b  10 to 15C         (subtropical, under glass)
H1c  5 to 10C          (warm temperate, under glass / outside in summer)
H2   1 to 5C           (tender; survives a mild, sheltered winter)
H3   -5 to 1C          (half-hardy; mild or coastal gardens)
H4   -10 to -5C        (hardy in an average winter)
H5   -15 to -10C       (hardy in a cold winter)
H6   -20 to -15C       (hardy in a very cold winter)
H7   colder than -20C  (very hardy)

Respond with ONLY the rating token, exactly one of: H1a H1b H1c H2 H3 H4 H5 H6 H7. No other text.`
}

function parseRating(raw: string): HardinessRating | null {
  const s = raw.toUpperCase().replace(/\s+/g, '')
  const m = s.match(/H1[ABC]|H[2-7]/)
  if (!m) return null
  let tok = m[0]
  if (tok.startsWith('H1')) tok = 'H1' + tok.slice(2).toLowerCase()
  return isHardinessRating(tok) ? (tok as HardinessRating) : null
}

async function draftRating(plant: DbPlant): Promise<HardinessRating> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 16,
    system:
      'You are a horticultural expert. Respond with ONLY an RHS hardiness rating token (H1a-H7), no other text.',
    messages: [{ role: 'user', content: buildPrompt(plant) }],
  })
  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()
  const rating = parseRating(raw)
  if (!rating)
    throw new Error(`unparseable rating: ${JSON.stringify(raw).slice(0, 60)}`)
  return rating
}

async function main() {
  const limit = parseLimit()
  const redraftUnverified = process.argv
    .slice(2)
    .includes('--redraft-unverified')
  const db = getSupabaseAdmin()

  // Baseline: only rows with no rating. --redraft-unverified widens to rows
  // that have a rating but are not verified. Verified rows are NEVER selected.
  // Paginated (standing rule 5) — --redraft-unverified currently matches 328
  // rows and grows with the catalog.
  let plants = await fetchAllRows<DbPlant>((from, to) => {
    let query = db
      .from('plants')
      .select('id, common_name, scientific_name, family, hardiness_rating')
      .order('common_name')
      .order('id')
    query = redraftUnverified
      ? query.eq('hardiness_verified', false)
      : query.is('hardiness_rating', null)
    return query.range(from, to)
  })
  if (limit) plants = plants.slice(0, limit)

  if (!plants.length) {
    console.log('No plants need a hardiness draft — nothing to do.')
    return
  }
  console.log(`\nDrafting hardiness for ${plants.length} plant(s)...\n`)

  const dist: Record<string, number> = {}
  const failures: Array<{ name: string; error: string }> = []
  let ok = 0

  for (const [i, plant] of plants.entries()) {
    const prefix = `[${pad(i + 1)}/${pad(plants.length)}]`
    try {
      const rating = await draftRating(plant)
      const { error: upErr } = await db
        .from('plants')
        .update({ hardiness_rating: rating })
        .eq('id', plant.id)
      if (upErr) throw new Error(upErr.message)
      dist[rating] = (dist[rating] ?? 0) + 1
      ok++
      console.log(`${prefix} ${plant.common_name} -> ${rating}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failures.push({ name: plant.common_name, error: msg })
      console.log(`${prefix} ${plant.common_name} FAILED: ${msg}`)
    }
    if (i < plants.length - 1) await sleep(INTER_PLANT_DELAY_MS)
  }

  console.log('\n─────────────────────────────────────────')
  console.log(`Drafted ${ok}, failed ${failures.length}.`)
  const spread = Object.keys(dist)
    .sort()
    .map((k) => `${k}:${dist[k]}`)
    .join('  ')
  console.log(`Distribution: ${spread}`)
  if (failures.length) {
    console.log('\nFailed:')
    for (const f of failures) console.log(`  • ${f.name}: ${f.error}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
