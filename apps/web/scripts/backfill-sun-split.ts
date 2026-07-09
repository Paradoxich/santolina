/**
 * One-time backfill — split existing `sun_requirements` into the new
 * `sun_thrives` / `sun_tolerates` fields (see migration 20260709220000).
 *
 * SET-PRESERVING BY CONSTRUCTION: this never adds or removes an exposure. For
 * each plant it only decides which of the exposures the plant ALREADY has are
 * its best (thrives) vs merely tolerated. The union thrives ∪ tolerates always
 * equals the current `sun_requirements`, so the DB trigger recomputes the same
 * `sun_requirements` and the app-visible value is unchanged — every prior
 * editorial correction and widening is preserved exactly.
 *
 *   - Single-exposure plants (e.g. ["full_sun"]) need no judgement: thrives =
 *     that value, tolerates = []. No API call.
 *   - Multi-exposure plants ask Claude only which subset is primary; the split
 *     is then clamped to the existing set in code, so a bad model answer can
 *     never change the union.
 *
 * Only touches `is_curated = false` rows that still need splitting
 * (`sun_thrives` empty, `sun_requirements` non-empty). Idempotent; a re-run
 * skips already-split rows.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-sun-split.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-sun-split.ts --dry-run
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import type { DbPlant } from '../lib/plants-db'

const INTER_PLANT_DELAY_MS = 2000
const SUN_ORDER = ['full_sun', 'partial_sun', 'shade'] as const
type Sun = (typeof SUN_ORDER)[number]

function canonical(values: readonly string[]): Sun[] {
  return SUN_ORDER.filter((s) => values.includes(s))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pad(n: number, width = 3): string {
  return String(n).padStart(width, ' ')
}

// Ask Claude which of the plant's EXISTING exposures is where it thrives.
// The answer is clamped to the current set by the caller, so it can only
// partition — never change the set.
async function primaryExposures(
  plant: DbPlant,
  current: Sun[]
): Promise<Sun[]> {
  const identity = [
    `common name: ${plant.common_name}`,
    plant.scientific_name ? `scientific name: ${plant.scientific_name}` : '',
    plant.family ? `family: ${plant.family}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = `A garden plant grows in these sun exposures: ${JSON.stringify(current)}.
Of exactly these exposures, which is/are the one(s) where it THRIVES — performs best, flowers well, best habit — as opposed to merely tolerating? Most plants thrive in one; some in two.

${identity}

Respond with ONLY JSON: {"sun_thrives": [...]} using a non-empty subset of ${JSON.stringify(current)}.`

  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 128,
    system:
      'You are a botanical data assistant. Respond with ONLY valid JSON, no markdown, no code fences, no preamble.',
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let parsed: { sun_thrives?: unknown }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`invalid JSON: ${raw.slice(0, 120)}`)
  }
  const arr = Array.isArray(parsed.sun_thrives) ? parsed.sun_thrives : []
  // Clamp to the current set — this is the set-preserving guarantee.
  const currentSet = new Set<string>(current)
  const thrives = canonical(
    arr.filter((v): v is string => typeof v === 'string' && currentSet.has(v))
  )
  // Fallback: if the model returned nothing usable, treat all as thriving.
  return thrives.length ? thrives : current
}

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run')
  const db = getSupabaseAdmin()

  console.log('\nFetching plants that need a sun split...')
  const { data, error } = await db
    .from('plants')
    .select('*')
    .eq('is_curated', false)
    .order('common_name')
  if (error) throw new Error(`Failed to fetch plants: ${error.message}`)

  const needSplit = ((data ?? []) as DbPlant[]).filter(
    (p) =>
      (p.sun_requirements?.length ?? 0) > 0 &&
      (p.sun_thrives?.length ?? 0) === 0
  )

  if (!needSplit.length) {
    console.log('No plants need splitting — nothing to do.')
    process.exit(0)
  }

  console.log(
    `\nSplitting ${needSplit.length} plant(s)${dryRun ? '  [DRY RUN]' : ''}...\n`
  )

  const failures: Array<{ name: string; error: string }> = []
  let aiCalls = 0
  let done = 0

  for (const [i, plant] of needSplit.entries()) {
    const label = plant.scientific_name ?? plant.common_name
    const prefix = `[${pad(i + 1)}/${pad(needSplit.length)}]`
    const current = canonical(plant.sun_requirements ?? [])

    try {
      let thrives: Sun[]
      if (current.length <= 1) {
        thrives = current // single exposure: it's the best one, no call
      } else {
        thrives = await primaryExposures(plant, current)
        aiCalls++
      }
      const thrivesSet = new Set<string>(thrives)
      const tolerates = current.filter((s) => !thrivesSet.has(s))

      // Invariant: union must equal the current set (never changes sun_requirements)
      const union = canonical([...thrives, ...tolerates])
      if (union.join(',') !== current.join(',')) {
        throw new Error(
          `union ${JSON.stringify(union)} != current ${JSON.stringify(current)}`
        )
      }

      console.log(
        `${prefix} ${label}: thrives ${JSON.stringify(thrives)}, tolerates ${JSON.stringify(tolerates)}`
      )

      if (!dryRun) {
        const { error: updErr } = await db
          .from('plants')
          .update({ sun_thrives: thrives, sun_tolerates: tolerates })
          .eq('id', plant.id)
          .eq('is_curated', false)
        if (updErr) throw new Error(updErr.message)
      }
      done++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`${prefix} ${label}: ✗ ${message}`)
      failures.push({ name: label, error: message })
    }

    if (current.length > 1 && i < needSplit.length - 1) {
      await sleep(INTER_PLANT_DELAY_MS)
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────')
  console.log(
    `${dryRun ? 'Would split' : 'Split'} ${done} plant(s) (${aiCalls} AI calls, rest single-exposure), ${failures.length} failed`
  )
  if (failures.length) {
    for (const { name, error } of failures) console.log(`  • ${name}: ${error}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
