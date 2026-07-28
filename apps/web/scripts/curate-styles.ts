/**
 * AI curation pass — re-judge style_tags against the tightened style
 * definitions in lib/style-tags.ts.
 *
 * Why this exists: the original curate-plants prompt listed the six tag names
 * with no definitions, and by July 2026 "cottage" sat on 533 of 595 plants
 * (89.6%), classic on 63%, wildflower on 55%. A tag most of the catalog
 * carries can't discriminate, and style is the most prominent browse axis in
 * Explore. This pass re-asks every plant with the signature-bar definitions
 * and OVERWRITES style_tags — unlike curate-plants it is allowed to, because
 * the old values are exactly what it's here to correct. Run
 * backup-catalog.ts first; restore-catalog.ts is the undo.
 *
 * The judgment is blind: the model never sees the old tags, so 90%-cottage
 * can't anchor it. An empty result is a valid judgment (style-neutral) —
 * curate-plants treats [] as answered and only NULL as missing.
 *
 * Stamps style_checked_at on every judged row (migration 20260728150000);
 * --new-only targets NULL stamps, so future seed rounds curate only their
 * own plants.
 *
 * Usage (from apps/web):
 *   # Smoke test first — ALWAYS, per the pipeline rules:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-styles.ts --limit 3 --dry-run
 *   # Full run:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-styles.ts
 *   # After a seed round:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-styles.ts --new-only
 *
 * Flags:
 *   --limit N      Cap the number of plants processed.
 *   --new-only     Only plants never judged (style_checked_at IS NULL).
 *   --ids a,b,c    Restrict to specific plant ids.
 *   --dry-run      Call Claude and print judgments; write nothing.
 *
 * Ends with the resulting tag distribution; warns if any tag still covers
 * more than 40% of the judged set — that means the definitions need another
 * pass, not that the run failed.
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import { STYLE_TAGS, STYLE_TAG_PROMPT, type StyleTag } from '../lib/style-tags'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Pause between Claude calls — well within Anthropic rate limits at this volume
const INTER_PLANT_DELAY_MS = 1200

// A tag on more than this share of the judged set still can't discriminate
const DISTRIBUTION_WARN_PCT = 40

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
  is_greenery: boolean | null
  garden_use_tags: string[] | null
  native_to: string | null
  style_tags: string[] | null
  style_checked_at: string | null
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
  // Deliberately excludes the current style_tags — a blind re-judgment.
  const known = {
    common_name: plant.common_name,
    scientific_name: plant.scientific_name,
    plant_type: plant.plant_type,
    plant_type_label: plant.plant_type_label,
    description: plant.description,
    bloom_color: plant.bloom_color,
    bloom_months: plant.bloom_months,
    foliage_color: plant.foliage_color,
    is_greenery: plant.is_greenery,
    garden_use_tags: plant.garden_use_tags,
    native_to: plant.native_to,
  }

  return `You are a botanical data assistant. Judge which garden styles this plant is a signature of:

${JSON.stringify(known, null, 2)}

Provide one field:
${STYLE_TAG_PROMPT}

Respond with ONLY valid JSON, no markdown fences: {"style_tags": string[]}`
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

async function judgePlant(plant: PlantRow): Promise<StyleTag[]> {
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

  const tags = parsed.style_tags
  if (!Array.isArray(tags))
    throw new Error(`style_tags is not an array: ${raw.slice(0, 200)}`)
  const invalid = tags.filter((t) => !STYLE_TAGS.includes(t as StyleTag))
  if (invalid.length)
    throw new Error(`unknown style tag(s) ${JSON.stringify(invalid)}`)

  return [...new Set(tags as StyleTag[])]
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
        'id, common_name, scientific_name, plant_type, plant_type_label, description, bloom_color, bloom_months, foliage_color, is_greenery, garden_use_tags, native_to, style_tags, style_checked_at'
      )
      .order('common_name')
      .order('id')
      .range(from, from + pageSize - 1)
    if (NEW_ONLY) query = query.is('style_checked_at', null)
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

  const tagCounts = new Map<StyleTag, number>()
  let unchanged = 0
  let neutral = 0
  const failed: string[] = []

  for (const [i, plant] of selected.entries()) {
    try {
      const tags = await judgePlant(plant)

      for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
      if (tags.length === 0) neutral++

      const before = [...(plant.style_tags ?? [])].sort()
      const after = [...tags].sort()
      const changed = JSON.stringify(before) !== JSON.stringify(after)
      if (!changed) unchanged++

      console.log(
        `  [${i + 1}/${selected.length}] ${plant.common_name}: [${tags.join(', ')}]${
          changed ? ` (was [${before.join(', ')}])` : ''
        }`
      )

      if (!DRY_RUN) {
        const { error } = await db
          .from('plants')
          .update({
            style_tags: tags,
            style_checked_at: new Date().toISOString(),
          })
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

  const judged = selected.length - failed.length
  console.log(
    `\nDone. ${judged} judged, ${unchanged} unchanged, ${neutral} style-neutral ([]).`
  )
  if (judged > 0) {
    console.log('\nResulting distribution:')
    const overSpread: string[] = []
    for (const tag of STYLE_TAGS) {
      const n = tagCounts.get(tag) ?? 0
      const pct = (100 * n) / judged
      console.log(
        `  ${tag.padEnd(14)} ${String(n).padStart(4)}  ${pct.toFixed(1)}%`
      )
      if (pct > DISTRIBUTION_WARN_PCT) overSpread.push(tag)
    }
    if (overSpread.length)
      console.log(
        `\nWARNING: ${overSpread.join(', ')} still cover(s) more than ${DISTRIBUTION_WARN_PCT}% of the judged set — tighten the definitions in lib/style-tags.ts and re-run.`
      )
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
