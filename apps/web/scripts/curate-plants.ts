/**
 * AI curation pass — fills in fields that Trefle doesn't reliably provide,
 * using Claude's own botanical knowledge.
 *
 * Reads all plants where is_curated = false, sends each to Claude requesting
 * only the fields that are actually missing, then patches those rows back into
 * Supabase. Never overwrites existing Trefle data. Does not flip is_curated —
 * that remains a manual step after human review.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-plants.ts
 *
 * Review queue after running:
 *   SELECT id, common_name, scientific_name, ai_drafted_at
 *   FROM plants
 *   WHERE ai_drafted_at IS NOT NULL AND is_curated = false
 *   ORDER BY ai_drafted_at DESC;
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import type { DbPlant, PlantType, SeasonalRhythm } from '../lib/plants-db'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// 2s between Claude calls — well within Anthropic rate limits at this volume
const INTER_PLANT_DELAY_MS = 2000

const PLANT_TYPES: PlantType[] = [
  'annual',
  'perennial',
  'biennial',
  'shrub',
  'tree',
  'grass',
  'climber',
  'succulent',
  'bulb',
]

const STYLE_TAGS = [
  'cottage',
  'mediterranean',
  'wildflower',
  'modern',
  'lush',
  'classic',
] as const

const SPACE_TYPES = [
  'ground_garden',
  'raised_beds',
  'terrace_balcony',
  'mixed',
] as const

const SUN_VALUES = ['full_sun', 'partial_sun', 'shade'] as const

const SEASONAL_KEYS: Array<keyof SeasonalRhythm> = [
  'early_spring',
  'late_spring',
  'summer',
  'late_summer',
  'autumn',
  'winter',
]

// ---------------------------------------------------------------------------
// Claude response type
// ---------------------------------------------------------------------------

interface CurationResponse {
  plant_type?: PlantType | null
  plant_type_label?: string | null
  description?: string | null
  care_level?: 'low' | 'medium' | 'high' | null
  height_min_cm?: number | null
  height_max_cm?: number | null
  spread_min_cm?: number | null
  spread_max_cm?: number | null
  hardiness_zone_min?: number | null
  hardiness_zone_max?: number | null
  hardiness_confidence?: 'high' | 'low'
  style_tags?: Array<(typeof STYLE_TAGS)[number]>
  space_types?: Array<(typeof SPACE_TYPES)[number]>
  garden_use_tags?: string[]
  bloom_color?: string[]
  foliage_color?: string | null
  sun_requirements?: Array<(typeof SUN_VALUES)[number]>
  bloom_months?: number[]
  water_needs?: string | null
  water_needs_summary?: string | null
  light_needs?: string | null
  soil_needs?: string | null
  maintenance_notes?: string | null
  common_issues?: string | null
  best_placement?: string | null
  environment_benefits?: string | null
  seasonal_rhythm?: SeasonalRhythm | null
  native_to?: string | null
}

// Fields written back to Supabase — hardiness_confidence is meta only
type PlantPatch = Omit<CurationResponse, 'hardiness_confidence'> & {
  ai_drafted_at: string
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(plant: DbPlant): string {
  // plant_type gates hardiness: determine whether to ask for hardiness at all
  const knownPlantType = plant.plant_type
  const isAnnual = knownPlantType === 'annual'
  const needsHardiness =
    !isAnnual && (!plant.hardiness_zone_min || !plant.hardiness_zone_max)

  const missing: string[] = []

  // plant_type first — it gates other field decisions
  if (!knownPlantType) missing.push('plant_type')
  if (!plant.plant_type_label) missing.push('plant_type_label')

  if (!plant.description) missing.push('description')
  if (!plant.care_level) missing.push('care_level')
  if (!plant.height_min_cm || !plant.height_max_cm)
    missing.push('height_min_cm', 'height_max_cm')
  if (!plant.spread_min_cm || !plant.spread_max_cm)
    missing.push('spread_min_cm', 'spread_max_cm')
  if (needsHardiness)
    missing.push(
      'hardiness_zone_min',
      'hardiness_zone_max',
      'hardiness_confidence'
    )
  if (!plant.style_tags?.length) missing.push('style_tags')
  if (!plant.space_types?.length) missing.push('space_types')
  if (!plant.garden_use_tags?.length) missing.push('garden_use_tags')
  if (!plant.bloom_color?.length) missing.push('bloom_color')
  if (plant.foliage_color === null) missing.push('foliage_color')
  if (!plant.sun_requirements?.length) missing.push('sun_requirements')
  if (!plant.bloom_months?.length) missing.push('bloom_months')
  if (!plant.water_needs) missing.push('water_needs')
  if (!plant.water_needs_summary) missing.push('water_needs_summary')
  if (!plant.light_needs) missing.push('light_needs')
  if (!plant.soil_needs) missing.push('soil_needs')
  if (!plant.maintenance_notes) missing.push('maintenance_notes')
  if (!plant.common_issues) missing.push('common_issues')
  if (!plant.best_placement) missing.push('best_placement')
  if (!plant.environment_benefits) missing.push('environment_benefits')
  if (!plant.seasonal_rhythm) missing.push('seasonal_rhythm')
  if (!plant.native_to) missing.push('native_to')

  const knownFields = {
    common_name: plant.common_name,
    scientific_name: plant.scientific_name,
    ...(plant.family ? { family: plant.family } : {}),
    ...(plant.native_to ? { native_to: plant.native_to } : {}),
    ...(knownPlantType ? { plant_type: knownPlantType } : {}),
    ...(plant.description ? { description: plant.description } : {}),
    ...(plant.care_level ? { care_level: plant.care_level } : {}),
    ...(plant.height_min_cm ? { height_min_cm: plant.height_min_cm } : {}),
    ...(plant.height_max_cm ? { height_max_cm: plant.height_max_cm } : {}),
    ...(plant.spread_min_cm ? { spread_min_cm: plant.spread_min_cm } : {}),
    ...(plant.spread_max_cm ? { spread_max_cm: plant.spread_max_cm } : {}),
    ...(plant.hardiness_zone_min
      ? { hardiness_zone_min: plant.hardiness_zone_min }
      : {}),
    ...(plant.hardiness_zone_max
      ? { hardiness_zone_max: plant.hardiness_zone_max }
      : {}),
    ...(plant.sun_requirements?.length
      ? { sun_requirements: plant.sun_requirements }
      : {}),
    ...(plant.bloom_months?.length ? { bloom_months: plant.bloom_months } : {}),
    ...(plant.water_needs ? { water_needs: plant.water_needs } : {}),
  }

  return `You are a botanical data assistant. Given a garden plant, provide ONLY the requested missing fields.

Known data for this plant:
${JSON.stringify(knownFields, null, 2)}

Please provide the following missing fields:
${missing.map((f) => `- ${f}`).join('\n')}

Field specifications:
- plant_type: Exactly one of ${JSON.stringify(PLANT_TYPES)}. Classify the base species (not cultivars). Provide this before all other fields.
- plant_type_label: Precise horticultural display label as a short phrase, sentence case. E.g. "Herbaceous perennial", "Deciduous shrub", "Evergreen climber", "Ornamental grass". More specific than plant_type, and must be consistent with it.
- description: 2-3 sentences. Plain language, useful to a beginner gardener. No Latin jargon.
- care_level: "low" | "medium" | "high". Based on overall maintenance needs.
- height_min_cm / height_max_cm: Integers. Realistic mature height range in centimetres.
- spread_min_cm / spread_max_cm: Integers. Realistic mature spread (width) range in centimetres. Distinct from height.
- hardiness_zone_min / hardiness_zone_max: Integer USDA zone numbers (1–13). Use the species' typical range, not a single cultivar. IMPORTANT: if plant_type is "annual", set both to null — annuals complete their lifecycle in one season and hardiness zones are not applicable. If you are meaningfully less confident for this species (uncommon, ambiguous range, or cultivar-specific), set hardiness_confidence to "low"; otherwise "high".
- style_tags: Subset of exactly ${JSON.stringify(STYLE_TAGS)}. Can be multiple.
- space_types: Subset of exactly ${JSON.stringify(SPACE_TYPES)}. Can be multiple.
- garden_use_tags: Array of 2-4 practical use-case phrases describing how this plant is typically used in a garden (e.g. ["pollinator gardens", "gravel gardens", "sunny borders", "wildlife gardens"]). This is DISTINCT from style_tags — use-case focused, not aesthetic.
- bloom_color: Array of plain English color names (e.g. ["purple", "white"]). Empty array [] for non-flowering or purely foliage plants.
- foliage_color: Single string only if the foliage is notably distinctive (e.g. "silver", "burgundy", "variegated grey-green"). null if typical green.
- sun_requirements: Subset of ["full_sun", "partial_sun", "shade"]. Include EVERY exposure the species reliably grows in, not just its single optimum — most garden plants tolerate a range, so prefer multiple values unless the species genuinely only performs in one. E.g. a plant that thrives in full sun but also does fine in partial sun should return both.
- bloom_months: Array of integers 1–12 (Jan=1, Dec=12). Must be internally consistent with seasonal_rhythm if you are providing both.
- water_needs: 1-2 short sentences. Plain second-person-adjacent language. E.g. "Moderate watering while establishing. Drought tolerant once mature."
- water_needs_summary: Very short category phrase, max ~4 words, no trailing period. E.g. "Low to moderate", "Moderate", "Low once established". Must be consistent with water_needs.
- light_needs: 1-2 short sentences of prose light requirements. E.g. "Performs best in full sun. Tolerates light afternoon shade." Must be consistent with sun_requirements.
- soil_needs: 1-2 short sentences. E.g. "Prefers well-drained, slightly alkaline soil. Tolerates poor, stony ground."
- maintenance_notes: 1-2 short sentences on key care tasks (pruning, deadheading, dividing etc.).
- common_issues: 1-2 sentences on common pests, diseases, or cultural problems. null if the species genuinely has no notable common issues.
- best_placement: 1 short sentence. E.g. "South-facing borders and dry sunny beds."
- environment_benefits: 1 short sentence on ecological value (pollinators, birds, etc.). null if not notably beneficial.
- seasonal_rhythm: Object with ALL 6 required keys — each a 1-2 sentence description of what is happening with this plant at that time. Keys: ${JSON.stringify(SEASONAL_KEYS)}. Must be consistent with bloom_months if known.
- native_to: Native geographic range as a short phrase. E.g. "Western Mediterranean" or "Europe and Western Asia". Not a full sentence.

Only include fields listed under "missing fields" above. Do not include fields already in "Known data".`
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

async function getCurationFromClaude(
  plant: DbPlant
): Promise<{ response: CurationResponse; lowConfidence: boolean }> {
  const client = getAnthropicClient()
  const prompt = buildPrompt(plant)

  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 2048,
    system:
      'You are a botanical data assistant. Respond with ONLY valid JSON, no markdown, no code fences, no preamble, no explanation.',
    messages: [{ role: 'user', content: prompt }],
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

  let parsed: CurationResponse
  try {
    parsed = JSON.parse(cleaned) as CurationResponse
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`)
  }

  const lowConfidence = parsed.hardiness_confidence === 'low'
  return { response: parsed, lowConfidence }
}

// ---------------------------------------------------------------------------
// Patch builder — only write fields that were missing; enforce annual rule
// ---------------------------------------------------------------------------

function buildPatch(plant: DbPlant, response: CurationResponse): PlantPatch {
  const patch: PlantPatch = { ai_drafted_at: new Date().toISOString() }

  // Determine effective plant_type (response may provide it if it was missing)
  const effectivePlantType = plant.plant_type ?? response.plant_type ?? null
  const isAnnual = effectivePlantType === 'annual'

  if (!plant.plant_type && response.plant_type != null)
    patch.plant_type = response.plant_type
  if (!plant.plant_type_label && response.plant_type_label != null)
    patch.plant_type_label = response.plant_type_label

  if (!plant.description && response.description != null)
    patch.description = response.description
  if (!plant.care_level && response.care_level != null)
    patch.care_level = response.care_level
  if (!plant.height_min_cm && response.height_min_cm != null)
    patch.height_min_cm = response.height_min_cm
  if (!plant.height_max_cm && response.height_max_cm != null)
    patch.height_max_cm = response.height_max_cm
  if (!plant.spread_min_cm && response.spread_min_cm != null)
    patch.spread_min_cm = response.spread_min_cm
  if (!plant.spread_max_cm && response.spread_max_cm != null)
    patch.spread_max_cm = response.spread_max_cm

  // Annuals: explicitly null out hardiness zones regardless of model output
  if (isAnnual) {
    if (!plant.hardiness_zone_min) patch.hardiness_zone_min = null
    if (!plant.hardiness_zone_max) patch.hardiness_zone_max = null
  } else {
    if (!plant.hardiness_zone_min && response.hardiness_zone_min != null)
      patch.hardiness_zone_min = response.hardiness_zone_min
    if (!plant.hardiness_zone_max && response.hardiness_zone_max != null)
      patch.hardiness_zone_max = response.hardiness_zone_max
  }

  if (!plant.style_tags?.length && response.style_tags?.length)
    patch.style_tags = response.style_tags
  if (!plant.space_types?.length && response.space_types?.length)
    patch.space_types = response.space_types
  if (!plant.garden_use_tags?.length && response.garden_use_tags?.length)
    patch.garden_use_tags = response.garden_use_tags
  if (!plant.bloom_color?.length && response.bloom_color != null)
    patch.bloom_color = response.bloom_color
  // foliage_color: null is a valid value (means "typical green" — skip re-asking)
  if (plant.foliage_color === null && 'foliage_color' in response)
    patch.foliage_color = response.foliage_color ?? null
  if (!plant.sun_requirements?.length && response.sun_requirements?.length)
    patch.sun_requirements = response.sun_requirements
  if (!plant.bloom_months?.length && response.bloom_months?.length)
    patch.bloom_months = response.bloom_months
  if (!plant.water_needs && response.water_needs != null)
    patch.water_needs = response.water_needs
  if (!plant.water_needs_summary && response.water_needs_summary != null)
    patch.water_needs_summary = response.water_needs_summary
  if (!plant.light_needs && response.light_needs != null)
    patch.light_needs = response.light_needs
  if (!plant.soil_needs && response.soil_needs != null)
    patch.soil_needs = response.soil_needs
  if (!plant.maintenance_notes && response.maintenance_notes != null)
    patch.maintenance_notes = response.maintenance_notes
  if (!plant.common_issues && response.common_issues != null)
    patch.common_issues = response.common_issues
  if (!plant.best_placement && response.best_placement != null)
    patch.best_placement = response.best_placement
  if (!plant.environment_benefits && response.environment_benefits != null)
    patch.environment_benefits = response.environment_benefits
  if (!plant.seasonal_rhythm && response.seasonal_rhythm != null)
    patch.seasonal_rhythm = response.seasonal_rhythm
  if (!plant.native_to && response.native_to != null)
    patch.native_to = response.native_to

  return patch
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function fetchUncuratedPlants(newOnly = false): Promise<DbPlant[]> {
  const db = getSupabaseAdmin()
  let query = db.from('plants').select('*').eq('is_curated', false)

  // --new-only: limit to rows that have never been drafted, so a targeted
  // top-up after seeding a few plants doesn't re-query the whole catalog.
  if (newOnly) query = query.is('ai_drafted_at', null)

  const { data, error } = await query.order('common_name')

  if (error) throw new Error(`Failed to fetch plants: ${error.message}`)
  return (data ?? []) as DbPlant[]
}

async function patchPlant(id: string, patch: PlantPatch): Promise<void> {
  const db = getSupabaseAdmin()
  const { error } = await db.from('plants').update(patch).eq('id', id)
  if (error) throw new Error(`Failed to patch plant ${id}: ${error.message}`)
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
  const newOnly = process.argv.slice(2).includes('--new-only')

  console.log(
    `\nFetching ${newOnly ? 'undrafted ' : ''}uncurated plants from Supabase...`
  )
  const plants = await fetchUncuratedPlants(newOnly)

  if (!plants.length) {
    console.log('No uncurated plants found — nothing to do.')
    process.exit(0)
  }

  console.log(`\nRunning AI curation pass on ${plants.length} plant(s)...\n`)

  const failures: Array<{ name: string; error: string }> = []
  const lowConfidenceHardiness: string[] = []
  const nullPlantType: string[] = []
  let succeeded = 0

  for (const [i, plant] of plants.entries()) {
    const label = plant.scientific_name ?? plant.common_name
    const prefix = `[${pad(i + 1)}/${pad(plants.length)}]`

    try {
      process.stdout.write(`${prefix} ${label} … `)
      const { response, lowConfidence } = await getCurationFromClaude(plant)

      if (lowConfidence) lowConfidenceHardiness.push(label)

      // Flag plants where plant_type came back null
      const effectiveType = plant.plant_type ?? response.plant_type
      if (!effectiveType) nullPlantType.push(label)

      const patch = buildPatch(plant, response)
      await patchPlant(plant.id, patch)

      const fieldsWritten = Object.keys(patch).filter(
        (k) => k !== 'ai_drafted_at'
      )
      const warnings = [
        lowConfidence ? '⚠ low-confidence hardiness' : '',
        !effectiveType ? '⚠ no plant_type' : '',
      ]
        .filter(Boolean)
        .join('  ')

      console.log(
        `✓  (${fieldsWritten.join(', ')})${warnings ? `  ${warnings}` : ''}`
      )
      succeeded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`✗  ${message}`)
      failures.push({ name: label, error: message })
    }

    if (i < plants.length - 1) await sleep(INTER_PLANT_DELAY_MS)
  }

  // Summary
  console.log('\n─────────────────────────────────────────────────────────────')
  console.log(
    `Curation complete: ${succeeded} succeeded, ${failures.length} failed`
  )

  if (lowConfidenceHardiness.length) {
    console.log(
      `\n⚠  ${lowConfidenceHardiness.length} plant(s) with low-confidence hardiness zones:`
    )
    for (const name of lowConfidenceHardiness) console.log(`   • ${name}`)
  }

  if (nullPlantType.length) {
    console.log(
      `\n⚠  ${nullPlantType.length} plant(s) with no assignable plant_type — review manually:`
    )
    for (const name of nullPlantType) console.log(`   • ${name}`)
  }

  if (failures.length) {
    console.log('\nFailed plants:')
    for (const { name, error } of failures) console.log(`  • ${name}: ${error}`)
    process.exit(1)
  }

  console.log(`
Review queue SQL:
  SELECT id, common_name, scientific_name, plant_type, ai_drafted_at
  FROM plants
  WHERE ai_drafted_at IS NOT NULL AND is_curated = false
  ORDER BY ai_drafted_at DESC;
`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
