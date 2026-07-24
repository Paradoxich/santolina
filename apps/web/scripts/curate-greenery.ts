/**
 * AI curation pass — the greenery judgment behind the Green colour bucket,
 * plus a foliage-colour re-ask for rows where foliage_color is null.
 *
 * Part of the plant-colour revision (Ana, July 24 2026): "Colour" in Explore
 * means plant colour, not bloom colour. Every other bucket derives
 * mechanically from bloom_color + foliage_color, but Green cannot — every
 * plant has green foliage, so Green membership needs an editorial judgment:
 * is this plant CONSIDERED greenery (boxwood, laurel, ferns — grown for green
 * mass and form, blooms incidental)? That judgment lands in
 * plants.is_greenery; lib/plant-colors.ts unions it with green blooms.
 *
 * The foliage re-ask: curate-plants encodes "typical green" as null, so nulls
 * are mostly deliberate — but early rounds predate close attention to the
 * field, so while we're paying for a call per plant anyway, null rows get the
 * distinctive-foliage question again. Fill-only: a populated foliage_color is
 * NEVER overwritten. Most re-asks are expected to come back null again.
 *
 * Stamps greenery_checked_at on every judged row (migration 20260724120500);
 * --new-only targets NULL stamps, so future seed rounds curate only their own
 * plants. Not in the upsert_trefle_plant path; re-seeds cannot touch either
 * field.
 *
 * Usage (from apps/web):
 *   # Smoke test first — ALWAYS, per the pipeline rules:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-greenery.ts --limit 3
 *   # Full run:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-greenery.ts
 *   # After a seed round:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-greenery.ts --new-only
 *
 * Flags:
 *   --limit N      Cap the number of plants processed.
 *   --new-only     Only plants never judged (greenery_checked_at IS NULL).
 *   --ids a,b,c    Restrict to specific plant ids.
 *   --dry-run      Call Claude and print judgments; write nothing.
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import {
  FOLIAGE_RAW_TO_BUCKET,
  IGNORED_FOLIAGE_COLORS,
  foliageBucketsForPlant,
} from '../lib/foliage-colors'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Pause between Claude calls — well within Anthropic rate limits at this volume
const INTER_PLANT_DELAY_MS = 1200

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  plant_type: string | null
  plant_type_label: string | null
  description: string | null
  bloom_color: string[] | null
  bloom_months: number[] | null
  foliage_color: string | null
  style_tags: string[] | null
  garden_use_tags: string[] | null
  greenery_checked_at: string | null
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const NEW_ONLY = args.includes('--new-only')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : null
const idsIdx = args.indexOf('--ids')
const IDS = idsIdx >= 0 ? (args[idsIdx + 1] ?? '').split(',') : null

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(plant: PlantRow): string {
  const askFoliage = plant.foliage_color === null

  const known = {
    common_name: plant.common_name,
    scientific_name: plant.scientific_name,
    plant_type: plant.plant_type,
    plant_type_label: plant.plant_type_label,
    description: plant.description,
    bloom_color: plant.bloom_color,
    bloom_months: plant.bloom_months,
    ...(plant.foliage_color ? { foliage_color: plant.foliage_color } : {}),
    style_tags: plant.style_tags,
    garden_use_tags: plant.garden_use_tags,
  }

  return `You are a botanical data assistant. Judge this garden plant:

${JSON.stringify(known, null, 2)}

${askFoliage ? `Provide two fields:` : `Provide one field:`}
- greenery (boolean): Is this plant's garden identity GREENERY — grown primarily for green mass, leaves or form, with flowers absent or incidental? True for the likes of boxwood, laurel, ferns, ivy, most conifers, and hedging or structural evergreens. False for anything grown mainly for its flowers, even if it holds handsome green leaves. Also false for foliage plants whose leaves read as a distinctive NON-green colour (silver, blue-grey, burgundy, gold) — their identity is that colour, not green.${
    askFoliage
      ? `
- foliage_color (string or null): The plant's distinctive STANDING foliage colour, or null if the foliage is typical green (null is the expected answer for most plants). Distinctive means the leaf colour itself is a reason to plant it. Prefer these established terms when accurate: "silver", "silver-grey", "silvery-grey", "grey-green", "blue-green", "blue-grey", "burgundy", "near-black", "bronze-purple", "copper-orange". Standing colour only — ignore autumn colour, winter bronzing, and coloured new growth. Judge the base species, not cultivars.`
      : ''
  }

Respond with ONLY valid JSON, no markdown fences: ${
    askFoliage
      ? `{"greenery": boolean, "foliage_color": string | null}`
      : `{"greenery": boolean}`
  }`
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

async function judgePlant(
  plant: PlantRow
): Promise<{ greenery: boolean; foliage_color?: string | null }> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 256,
    system:
      'You are a botanical data assistant. Respond with ONLY valid JSON, no markdown, no code fences, no preamble, no explanation.',
    messages: [{ role: 'user', content: buildPrompt(plant) }],
  })

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  if (typeof parsed.greenery !== 'boolean')
    throw new Error(`greenery is not a boolean: ${raw.slice(0, 200)}`)

  const result: { greenery: boolean; foliage_color?: string | null } = {
    greenery: parsed.greenery,
  }
  if (plant.foliage_color === null) {
    const f = parsed.foliage_color
    if (f !== null && typeof f !== 'string')
      throw new Error(`foliage_color is not string|null: ${raw.slice(0, 200)}`)
    result.foliage_color =
      typeof f === 'string' ? f.trim().toLowerCase() || null : null
  }
  return result
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const db = getSupabaseAdmin()

  // Full-table read via explicit paging (never a bare .select() — 1000 cap)
  const pageSize = 1000
  const plants: PlantRow[] = []
  for (let from = 0; ; from += pageSize) {
    let query = db
      .from('plants')
      .select(
        'id, common_name, scientific_name, plant_type, plant_type_label, description, bloom_color, bloom_months, foliage_color, style_tags, garden_use_tags, greenery_checked_at'
      )
      .order('common_name')
      .order('id')
      .range(from, from + pageSize - 1)
    if (NEW_ONLY) query = query.is('greenery_checked_at', null)
    const { data, error } = await query
    if (error) throw new Error(`Failed to load plants: ${error.message}`)
    plants.push(...((data ?? []) as PlantRow[]))
    if (!data || data.length < pageSize) break
  }

  let selected = IDS ? plants.filter((p) => IDS.includes(p.id)) : plants
  if (LIMIT) selected = selected.slice(0, LIMIT)

  console.log(
    `Judging ${selected.length} plant(s)${NEW_ONLY ? ' (new only)' : ''}${DRY_RUN ? ' — DRY RUN, no writes' : ''}`
  )

  let greeneryCount = 0
  let foliageFilled = 0
  const unmappedValues = new Map<string, string[]>()
  const contradictions: string[] = []
  const failed: string[] = []

  for (const [i, plant] of selected.entries()) {
    try {
      const judgment = await judgePlant(plant)

      // A distinctive-foliage plant is by rule not greenery: its identity is
      // that colour (Silver/Burgundy/Orange), and it already matches the
      // colour filter through its foliage bucket. If the model says greenery
      // anyway, we override to false rather than trust it — but we still write
      // and stamp, so the row is recorded and --new-only converges.
      // "Distinctive" means the value MAPS to a bucket: plain greens and
      // seasonal turns (the ignore set) don't contradict greenery — a
      // bright-green hedging shrub is exactly what the flag is for.
      const effectiveFoliage =
        plant.foliage_color ?? judgment.foliage_color ?? null
      const distinctive = foliageBucketsForPlant(effectiveFoliage).length > 0
      const contradicts = judgment.greenery && distinctive
      if (contradicts) {
        contradictions.push(
          `${plant.common_name} — model said greenery=true with foliage "${effectiveFoliage}"; overridden to false`
        )
      }
      const greenery = contradicts ? false : judgment.greenery

      if (greenery) greeneryCount++
      const newFoliage = judgment.foliage_color ?? null
      if (newFoliage) {
        foliageFilled++
        if (
          !FOLIAGE_RAW_TO_BUCKET[newFoliage] &&
          !IGNORED_FOLIAGE_COLORS.has(newFoliage)
        ) {
          const carriers = unmappedValues.get(newFoliage) ?? []
          carriers.push(plant.common_name)
          unmappedValues.set(newFoliage, carriers)
        }
      }

      console.log(
        `  [${i + 1}/${selected.length}] ${plant.common_name}: greenery=${greenery}${contradicts ? ' (overridden from true)' : ''}${newFoliage ? `, foliage="${newFoliage}"` : ''}`
      )

      if (!DRY_RUN) {
        const patch: Record<string, unknown> = {
          is_greenery: greenery,
          greenery_checked_at: new Date().toISOString(),
        }
        // Fill-only: never overwrite a populated foliage_color
        if (plant.foliage_color === null && newFoliage)
          patch.foliage_color = newFoliage
        const { error } = await db
          .from('plants')
          .update(patch)
          .eq('id', plant.id)
        if (error) throw new Error(`DB write failed: ${error.message}`)
      }
    } catch (err) {
      failed.push(`${plant.common_name} — ${(err as Error).message}`)
      console.error(
        `  [${i + 1}/${selected.length}] ${plant.common_name}: FAILED — ${(err as Error).message}`
      )
    }
    if (i < selected.length - 1) await sleep(INTER_PLANT_DELAY_MS)
  }

  console.log(
    `\nDone. ${greeneryCount} greenery, ${foliageFilled} foliage colours filled.`
  )
  if (unmappedValues.size) {
    console.log(
      `\n${unmappedValues.size} NEW foliage value(s) need mapping in lib/foliage-colors.ts (check-bloom-colors will fail until added):`
    )
    for (const [value, carriers] of [...unmappedValues.entries()].sort())
      console.log(`  "${value}" — ${carriers.join(', ')}`)
  }
  if (contradictions.length) {
    console.log(
      `\n${contradictions.length} contradiction(s) overridden to greenery=false (matched via foliage bucket instead):`
    )
    for (const c of contradictions) console.log(`  ${c}`)
  }
  if (failed.length) {
    console.log(`\n${failed.length} failure(s):`)
    for (const f of failed) console.log(`  ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
