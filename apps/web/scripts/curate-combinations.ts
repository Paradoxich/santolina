/**
 * AI companion-planting pass — populates the plant_combinations table.
 *
 * For each plant in the catalog, asks Claude to pick up to 5 companions
 * from the catalog itself (never outside it — the FK requires both sides
 * to exist in plants). Existing rows are never deleted or overwritten;
 * pairs that already exist in either direction are skipped, so the script
 * is idempotent and safe to re-run as new plants are seeded.
 *
 * Caps at 5 companions per plant (the UI shows at most 5), counting both
 * directions of existing rows. Plants already at the cap are skipped
 * without an API call.
 *
 * Usage (from apps/web) — a scope flag is mandatory, see scripts/scope.ts:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-combinations.ts \
 *     --round 9 [--limit 3] [--dry-run]
 *   ... --ids <a,b,c>   |   ... --all
 *
 * The scope selects which plants get pairings drafted FOR them. The candidate
 * roster stays the whole catalog either way — a round's plants should be
 * pairable with everything already grown, and the cap arithmetic counts both
 * directions across the whole table. Scoping the roster would silo each round.
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import { fetchAllRows } from '../lib/paginate'
import { requireScope, scopeIds, describeScope } from './scope'
import { withRunRecord } from './run-provenance'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// 2s between Claude calls — same pacing as curate-plants.ts
const INTER_PLANT_DELAY_MS = 2000

// A decoding parameter is part of the recipe, so it is read from one place.
const MAX_TOKENS = 1500

const SYSTEM_PROMPT =
  'You are a garden design assistant. Respond with ONLY valid JSON, no markdown, no code fences, no preamble, no explanation.'

// UI cap — WorksWellWithSection shows at most 5 companions
const MAX_COMPANIONS_PER_PLANT = 5

const COMBINATION_TYPES = ['visual', 'ecological', 'seasonal'] as const
const STRENGTHS = ['strong', 'moderate', 'weak'] as const

type CombinationType = (typeof COMBINATION_TYPES)[number]
type Strength = (typeof STRENGTHS)[number]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogPlant {
  id: string
  common_name: string
  scientific_name: string | null
  plant_type: string | null
  style_tags: string[] | null
  sun_requirements: string[] | null
  bloom_months: number[] | null
  bloom_color: string[] | null
  height_max_cm: number | null
}

interface CompanionSuggestion {
  plant_id?: string
  combination_type?: string
  strength?: string
  notes?: string
}

interface ComboRow {
  plant_id_a: string
  plant_id_b: string
  combination_type: CombinationType | null
  strength: Strength | null
  notes: string | null
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseFlags(): { limit: number | null; dryRun: boolean } {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitIdx = args.indexOf('--limit')
  const limitArg = limitIdx >= 0 ? args[limitIdx + 1] : undefined
  const limit = limitArg ? parseInt(limitArg, 10) : null
  if (limit !== null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('--limit must be a positive integer')
  }
  return { limit, dryRun }
}

// ---------------------------------------------------------------------------
// Pair bookkeeping — canonical key so (a,b) and (b,a) count as one pair
// ---------------------------------------------------------------------------

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function describePlant(p: CatalogPlant): string {
  const parts = [
    `common name: ${p.common_name}`,
    p.scientific_name ? `scientific name: ${p.scientific_name}` : '',
    p.plant_type ? `type: ${p.plant_type}` : '',
    p.style_tags?.length ? `styles: ${p.style_tags.join(', ')}` : '',
    p.sun_requirements?.length ? `sun: ${p.sun_requirements.join(', ')}` : '',
    p.bloom_months?.length ? `bloom months: ${p.bloom_months.join(', ')}` : '',
    p.bloom_color?.length ? `bloom colors: ${p.bloom_color.join(', ')}` : '',
    p.height_max_cm ? `max height: ${p.height_max_cm}cm` : '',
  ]
  return parts.filter(Boolean).join('; ')
}

function buildPrompt(
  plant: CatalogPlant,
  candidates: CatalogPlant[],
  maxSuggestions: number
): string {
  const roster = candidates
    .map(
      (c) =>
        `${c.id} — ${c.scientific_name ?? c.common_name} (${c.common_name})`
    )
    .join('\n')

  return `You are a garden design assistant helping beginner gardeners find plants that pair well together.

Target plant:
${describePlant(plant)}

Candidate companions (the ONLY plants you may suggest — refer to them by their id, the UUID before the dash):
${roster}

Suggest up to ${maxSuggestions} companions for the target plant from the candidate list. Respond with a JSON array (possibly empty) of objects:
[
  {
    "plant_id": "<uuid from the candidate list>",
    "combination_type": "visual" | "ecological" | "seasonal",
    "strength": "strong" | "moderate" | "weak",
    "notes": "<one short sentence>"
  }
]

Rules:
- Only suggest pairings that genuinely work in a real garden — shared growing conditions (sun, water, climate) AND at least one positive reason to plant them together. Fewer suggestions (or an empty array) is better than weak ones.
- combination_type is the DOMINANT reason the pair works: "visual" (color, texture, form contrast or harmony), "ecological" (pollinators, pest deterrence, soil or habit synergy), "seasonal" (staggered or overlapping interest across the year).
- strength: "strong" for classic, widely recommended pairings; "moderate" for solid but less canonical ones; "weak" only if you include a marginal pair (prefer omitting it instead).
- notes: one short plain-language sentence a beginner understands, e.g. "Silver foliage sets off the deep purple blooms, and both love dry sun." No Latin jargon.
- plant_id MUST be copied exactly from the candidate list. Never invent ids, never suggest the target plant itself.`
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

/**
 * The template rendered for the recipe hash. Never sent.
 *
 * FULLY POPULATED, because describePlant() drops every field it does not have —
 * an empty probe would render a prompt with almost no shape to it and hide most
 * of the template from the hash.
 *
 * The candidate roster and the per-plant slot count are excluded: they are the
 * subject this recipe is applied TO, and they change on every row. The CAP is
 * recipe (it is a constant that shapes every prompt), so the probe renders with
 * MAX_COMPANIONS_PER_PLANT rather than with a row's remaining slots.
 */
function recipeTemplate(): string {
  const probe: CatalogPlant = {
    id: 'recipe-probe',
    common_name: 'probe',
    scientific_name: 'Probe probe',
    plant_type: 'perennial',
    style_tags: ['cottage'],
    sun_requirements: ['full_sun'],
    bloom_months: [6],
    bloom_color: ['white'],
    height_max_cm: 100,
  }
  return buildPrompt(
    probe,
    [{ ...probe, id: 'recipe-probe-candidate' }],
    MAX_COMPANIONS_PER_PLANT
  )
}

async function getSuggestionsFromClaude(
  plant: CatalogPlant,
  candidates: CatalogPlant[],
  maxSuggestions: number
): Promise<CompanionSuggestion[]> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildPrompt(plant, candidates, maxSuggestions) },
    ],
  })

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Claude returned non-array JSON: ${cleaned.slice(0, 200)}`)
  }
  return parsed as CompanionSuggestion[]
}

// ---------------------------------------------------------------------------
// Validation — enum coercion keeps the pair, invalid ids drop it
// ---------------------------------------------------------------------------

function coerceCombinationType(v: string | undefined): CombinationType | null {
  return COMBINATION_TYPES.includes(v as CombinationType)
    ? (v as CombinationType)
    : null
}

function coerceStrength(v: string | undefined): Strength | null {
  return STRENGTHS.includes(v as Strength) ? (v as Strength) : null
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function pad(n: number, width = 3): string {
  return String(n).padStart(width, ' ')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const scope = requireScope(
    'curate-combinations',
    'curate-combinations bills Claude once per plant it drafts pairings for,\n' +
      'and the whole catalog is ~595 plants.'
  )
  const ids = scopeIds(scope)
  const { limit, dryRun } = parseFlags()
  const db = getSupabaseAdmin()

  console.log('\nFetching plant catalog from Supabase...')
  const plants = await fetchAllRows<CatalogPlant>((from, to) =>
    db
      .from('plants')
      .select(
        'id, common_name, scientific_name, plant_type, style_tags, sun_requirements, bloom_months, bloom_color, height_max_cm'
      )
      .order('id')
      .range(from, to)
  )

  console.log('Fetching existing combinations...')
  // Paginated: a bare select caps at 1000 rows, and this table is already
  // past that — an unpaginated read here previously truncated the dedupe set
  // and the per-plant cap counts, creating duplicate pairs and over-cap rows.
  const combos = await fetchAllRows<{
    plant_id_a: string
    plant_id_b: string
  }>((from, to) =>
    db
      .from('plant_combinations')
      .select('plant_id_a, plant_id_b')
      .order('id')
      .range(from, to)
  )

  // Seed pair set and per-plant companion counts from existing rows
  const existingPairs = new Set<string>()
  const companionCount = new Map<string, number>()
  for (const p of plants) companionCount.set(p.id, 0)
  for (const c of combos) {
    existingPairs.add(pairKey(c.plant_id_a, c.plant_id_b))
    companionCount.set(
      c.plant_id_a,
      (companionCount.get(c.plant_id_a) ?? 0) + 1
    )
    companionCount.set(
      c.plant_id_b,
      (companionCount.get(c.plant_id_b) ?? 0) + 1
    )
  }

  const plantById = new Map(plants.map((p) => [p.id, p]))

  // The scope narrows who gets drafted for, never the candidate roster above.
  const idSet = ids ? new Set(ids) : null
  const scoped = idSet ? plants.filter((p) => idSet.has(p.id)) : plants
  const toProcess = limit ? scoped.slice(0, limit) : scoped

  console.log(
    `\n${describeScope(scope, ids)}` +
      `\nCatalog: ${plants.length} plants, ${existingPairs.size} existing pair(s).` +
      `\nProcessing ${toProcess.length} plant(s) against the whole ${plants.length}-plant roster` +
      `${dryRun ? ' (dry run — no writes)' : ''}...\n`
  )

  const failures: Array<{ name: string; error: string }> = []
  const invalidIdCount = { total: 0 }
  let inserted = 0
  let skippedAtCap = 0

  await withRunRecord(
    {
      step: 'curate-combinations',
      // The write-set member is a TABLE, not a column — this pass writes no
      // column on `plants` at all. That is the case the evidence split was
      // built for: what was mutated is not always a column.
      writeSet: ['plant_combinations'],
      scope: `${describeScope(scope, ids)}${dryRun ? ' (--dry-run)' : ''}`,
      recipe: {
        model: CURATION_MODEL,
        template: [SYSTEM_PROMPT, recipeTemplate()],
        // The cap shapes every prompt and the arithmetic behind every skip, so
        // a run at 5 is a different cohort from a run at 8.
        ingredients: {
          max_companions_per_plant: MAX_COMPANIONS_PER_PLANT,
          combination_types: COMBINATION_TYPES,
          strengths: STRENGTHS,
        },
        decoding: { max_tokens: MAX_TOKENS },
      },
      // plant_combinations rows are INSERTED and never updated, so created_at is
      // the table's own mutation timestamp. It is still only a bounding witness:
      // it sees any insert in the window, including another session's, so it can
      // neither confirm this run's claim nor contradict it.
      evidence: [
        {
          kind: 'row-touched',
          covers: 'plant_combinations',
          table: 'plant_combinations',
          column: 'created_at',
        },
      ],
    },
    async (run) => {
      for (const [i, plant] of toProcess.entries()) {
        const label = plant.scientific_name ?? plant.common_name
        const prefix = `[${pad(i + 1)}/${pad(toProcess.length)}]`
        const currentCount = companionCount.get(plant.id) ?? 0
        const slots = MAX_COMPANIONS_PER_PLANT - currentCount

        if (slots <= 0) {
          console.log(
            `${prefix} ${label} — already at cap (${currentCount}), skipped`
          )
          skippedAtCap++
          continue
        }

        // Candidates: everything except self, plants at cap, and already-paired plants
        const candidates = plants.filter(
          (c) =>
            c.id !== plant.id &&
            (companionCount.get(c.id) ?? 0) < MAX_COMPANIONS_PER_PLANT &&
            !existingPairs.has(pairKey(plant.id, c.id))
        )
        if (!candidates.length) {
          console.log(`${prefix} ${label} — no available candidates, skipped`)
          continue
        }

        try {
          process.stdout.write(`${prefix} ${label} … `)
          const suggestions = await getSuggestionsFromClaude(
            plant,
            candidates,
            slots
          )

          const candidateIds = new Set(candidates.map((c) => c.id))
          const rows: ComboRow[] = []
          let invalidIds = 0

          for (const s of suggestions) {
            if (rows.length >= slots) break
            if (!s.plant_id || !candidateIds.has(s.plant_id)) {
              invalidIds++
              continue
            }
            const key = pairKey(plant.id, s.plant_id)
            if (existingPairs.has(key)) continue
            if (
              (companionCount.get(s.plant_id) ?? 0) >= MAX_COMPANIONS_PER_PLANT
            )
              continue

            rows.push({
              plant_id_a: plant.id,
              plant_id_b: s.plant_id,
              combination_type: coerceCombinationType(s.combination_type),
              strength: coerceStrength(s.strength),
              notes: s.notes?.trim() || null,
            })
            existingPairs.add(key)
            companionCount.set(
              plant.id,
              (companionCount.get(plant.id) ?? 0) + 1
            )
            companionCount.set(
              s.plant_id,
              (companionCount.get(s.plant_id) ?? 0) + 1
            )
          }

          invalidIdCount.total += invalidIds

          if (rows.length && !dryRun) {
            const { error } = await db.from('plant_combinations').insert(rows)
            if (error) throw new Error(`Insert failed: ${error.message}`)
            // A combination's row identity is the PAIR, so the composite key is what
            // gets counted — the same canonical key the dedupe set uses, so a pair
            // written once cannot be counted twice from the other direction.
            for (const r of rows) run.wrote(pairKey(r.plant_id_a, r.plant_id_b))
          }
          inserted += rows.length

          const names = rows
            .map(
              (r) => plantById.get(r.plant_id_b)?.common_name ?? r.plant_id_b
            )
            .join(', ')
          console.log(
            `✓  +${rows.length}${names ? ` (${names})` : ''}` +
              (invalidIds ? `  ⚠ ${invalidIds} invalid id(s) dropped` : '')
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.log(`✗  ${message}`)
          failures.push({ name: label, error: message })
        }

        if (i < toProcess.length - 1) await sleep(INTER_PLANT_DELAY_MS)
      }

      // A pass where every plant errored is a failure even though nothing threw.
      if (failures.length && !inserted) {
        run.markFailed(`all ${failures.length} plant(s) failed`)
      }
    }
  )

  // Summary
  console.log('\n─────────────────────────────────────────────────────────────')
  console.log(
    `Combinations pass complete: ${inserted} pair(s) ${dryRun ? 'suggested (dry run)' : 'inserted'}, ` +
      `${skippedAtCap} plant(s) already at cap, ${failures.length} failed`
  )
  if (invalidIdCount.total) {
    console.log(
      `⚠  ${invalidIdCount.total} suggestion(s) dropped for invalid/unknown plant ids`
    )
  }

  const uncovered = plants.filter((p) => (companionCount.get(p.id) ?? 0) === 0)
  if (uncovered.length) {
    console.log(`\n${uncovered.length} plant(s) still have no companions:`)
    for (const p of uncovered)
      console.log(`   • ${p.scientific_name ?? p.common_name}`)
  }

  if (failures.length) {
    console.log('\nFailed plants:')
    for (const { name, error } of failures) console.log(`  • ${name}: ${error}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
