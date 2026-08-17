/**
 * AI curation pass — fills in fields that Trefle doesn't reliably provide,
 * using Claude's own botanical knowledge.
 *
 * Reads plants where is_curated = false within the given scope, sends each to
 * Claude requesting only the fields that are actually missing, then patches
 * those rows back into Supabase. Never overwrites existing Trefle data. Does
 * not flip is_curated — that remains an editorial step after review.
 *
 * Usage (from apps/web) — a scope flag is mandatory, see scripts/scope.ts:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-plants.ts \
 *     --round 9 [--new-only]
 *   ... --ids <a,b,c>   |   ... --all
 *
 * --new-only narrows to rows never drafted; it is a filter within the scope,
 * not a scope of its own.
 *
 * --only <field> fills ONE field on the rows that lack it and writes nothing
 * else, for a field added or re-specified after rows were already drafted:
 *   ... --all --only common_issues
 * It is the only mode that can reach an `is_curated = true` row, because the
 * normal selection filters those out. That is safe because `restrictPatch`
 * narrows the patch to the named column plus the drafting stamp, and the flag
 * REFUSES any column `invalidate_editorial_verdict` watches — so it cannot
 * retire an editorial sign-off. See EDITORIAL_TRIGGER_COLUMNS below.
 *
 * Review queue after running:
 *   SELECT id, common_name, scientific_name, ai_drafted_at
 *   FROM plants
 *   WHERE ai_drafted_at IS NOT NULL AND is_curated = false
 *   ORDER BY ai_drafted_at DESC;
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import type { DbPlant, PlantType, SeasonalRhythm } from '../lib/plants-db'
import { STYLE_TAG_PROMPT, type StyleTag } from '../lib/style-tags'
import { GREENERY_PROMPT } from '../lib/greenery'
import { COPY_RULES_PROMPT } from '../lib/copy-rules'
import { requireScope, scopeIds, describeScope } from './scope'
import { withRunRecord, type Witness } from './run-provenance'

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

export interface CurationResponse {
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
  style_tags?: StyleTag[]
  space_types?: Array<(typeof SPACE_TYPES)[number]>
  garden_use_tags?: string[]
  bloom_color?: string[]
  foliage_color?: string | null
  is_greenery?: boolean
  sun_thrives?: Array<(typeof SUN_VALUES)[number]>
  sun_tolerates?: Array<(typeof SUN_VALUES)[number]>
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
  // Written alongside is_greenery so a "false" can be told from "never asked".
  greenery_checked_at?: string
  // Written alongside style_tags, for the same reason — see the note at the
  // assignment for why this pass owns a stamp named after another script.
  style_checked_at?: string
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * A row with nothing filled in, used ONLY to render the template for the recipe
 * hash — never sent to the model.
 *
 * Empty rather than realistic on purpose. `buildPrompt` branches on which fields
 * are MISSING, so an empty row takes every branch and renders the maximal
 * template: every optional instruction is present, and a change to any of them
 * moves the hash. A realistic probe row would hash only the branches it happened
 * to take, leaving the rest of the recipe invisible.
 */
const RECIPE_PROBE_ROW = {
  id: 'recipe-probe',
  common_name: 'probe',
  scientific_name: 'Probe probe',
} as DbPlant

/**
 * Fields a `--only` run may not target, because writing one CLEARS the
 * editorial verdict (migration 20260729101133). Field-scoped mode exists
 * precisely to reach already-curated rows, so it has to be unable to
 * un-curate them; keeping the list here rather than in a comment is what
 * makes that a property of the code and not of whoever runs it.
 */
const EDITORIAL_TRIGGER_COLUMNS = new Set([
  'description',
  'style_tags',
  'space_types',
  'image_url_curated',
  'image_pick_confidence',
])

function buildPrompt(plant: DbPlant, only: string | null = null): string {
  // plant_type gates hardiness: determine whether to ask for hardiness at all
  const knownPlantType = plant.plant_type
  const isAnnual = knownPlantType === 'annual'
  const needsHardiness =
    !isAnnual && (!plant.hardiness_zone_min || !plant.hardiness_zone_max)

  const missing: string[] = []

  // Field-scoped: ask for the one field and nothing else. Returning early
  // rather than filtering the list afterwards keeps every gate below —
  // needsHardiness, the sun pair, the style stamp — out of a run that has no
  // business re-deciding them.
  if (only) return renderPrompt(plant, [only], knownPlantType)

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
  // [] is a real judgment (style-neutral, per curate-styles.ts), so the VALUE
  // cannot say whether the question was asked — and `style_tags` is
  // NOT NULL DEFAULT '{}', so the old `== null` test was unreachable and this
  // pass never once drafted a style tag (round 11, 2026-08-14). The stamp is
  // the only thing that can tell "judged style-neutral" from "never asked",
  // exactly as `greenery_checked_at` does for the `false` default below.
  if (!plant.style_checked_at) missing.push('style_tags')
  if (!plant.space_types?.length) missing.push('space_types')
  if (!plant.garden_use_tags?.length) missing.push('garden_use_tags')
  if (!plant.bloom_color?.length) missing.push('bloom_color')
  if (plant.foliage_color === null) missing.push('foliage_color')
  // Folded in from curate-greenery (2026-07-29). It is one boolean on a call
  // we are already making for this plant, so asking it here removes a whole
  // per-round pass for free. curate-greenery survives as the repair tool for
  // rows seeded before the field existed.
  if (!plant.greenery_checked_at) missing.push('is_greenery')
  // sun is drafted as two fields; sun_requirements is derived by a DB trigger.
  if (!plant.sun_thrives?.length) missing.push('sun_thrives', 'sun_tolerates')
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

  return renderPrompt(plant, missing, knownPlantType)
}

function renderPrompt(
  plant: DbPlant,
  missing: string[],
  knownPlantType: string | null
): string {
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
${STYLE_TAG_PROMPT}
- space_types: Subset of exactly ${JSON.stringify(SPACE_TYPES)}. Can be multiple.
- garden_use_tags: Array of 2-4 practical use-case phrases describing how this plant is typically used in a garden (e.g. ["pollinator gardens", "gravel gardens", "sunny borders", "wildlife gardens"]). This is DISTINCT from style_tags — use-case focused, not aesthetic.
- bloom_color: Array of plain English color names (e.g. ["purple", "white"]). Empty array [] for non-flowering or purely foliage plants.
- foliage_color: Single string only if the foliage is notably distinctive (e.g. "silver", "burgundy", "variegated grey-green"). null if typical green.
- is_greenery: ${GREENERY_PROMPT}
- sun_thrives: Subset of ["full_sun", "partial_sun", "shade"] — the exposure(s) where the species performs at its BEST (flowers well, best habit, healthy growth). Usually one, occasionally two. Must be non-empty.
- sun_tolerates: Subset of ["full_sun", "partial_sun", "shade"], DISJOINT from sun_thrives — ADDITIONAL exposures the species accepts and grows acceptably in but is not at its best. Include every exposure it reliably tolerates beyond its optimum; [] if it only performs in its thrives range. E.g. a plant best in full sun that also does fine in partial sun → sun_thrives ["full_sun"], sun_tolerates ["partial_sun"].
- bloom_months: Array of integers 1–12 (Jan=1, Dec=12). Must be internally consistent with seasonal_rhythm if you are providing both.
- water_needs: 1-2 short sentences. Plain second-person-adjacent language. E.g. "Moderate watering while establishing. Drought tolerant once mature."
- water_needs_summary: Very short category phrase, max ~4 words, no trailing period. E.g. "Low to moderate", "Moderate", "Low once established". Must be consistent with water_needs.
- light_needs: 1-2 short sentences of prose light requirements. E.g. "Performs best in full sun. Tolerates light afternoon shade." Must be consistent with sun_requirements.
- soil_needs: 1-2 short sentences. E.g. "Prefers well-drained, slightly alkaline soil. Tolerates poor, stony ground."
- maintenance_notes: 1-2 short sentences on key care tasks (pruning, deadheading, dividing etc.).
- common_issues: 1-2 sentences on common pests, diseases, or cultural problems. NEVER null. If the species is genuinely untroubled, SAY SO ("Generally pest and disease free.") and add the one condition that does cause trouble if there is one. A blank cannot be told apart from an unanswered question, and 460 of the 721 rows that already have this field say exactly that — the null option was producing two ways to write one answer.
- best_placement: 1 short sentence. E.g. "South-facing borders and dry sunny beds."
- environment_benefits: 1 short sentence on ecological value (pollinators, birds, etc.). null if not notably beneficial.
- seasonal_rhythm: Object with ALL 6 required keys — each a 1-2 sentence description of what is happening with this plant at that time. Keys: ${JSON.stringify(SEASONAL_KEYS)}. Must be consistent with bloom_months if known.
- native_to: Native geographic range as a short phrase (2-7 words), present-day geography, not a sentence. Lowercase directional words (central, southern, eastern, western, northern) and connectors; capitalize only proper place names (Europe, Asia, North Africa, the Mediterranean, the Balkans, Turkey, China). Use "the Mediterranean" or "the Mediterranean region" with the article. No parenthetical asides and no "particularly/including X". Avoid climate-zone jargon like "temperate Northern Hemisphere" — name the continents plainly instead. E.g. "the western Mediterranean", "central and southern Europe", "Europe and western Asia", "eastern Asia", "Europe, Asia, and North America".

${COPY_RULES_PROMPT}

Only include fields listed under "missing fields" above. Do not include fields already in "Known data".`
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

async function getCurationFromClaude(
  plant: DbPlant,
  only: string | null = null
): Promise<{ response: CurationResponse; lowConfidence: boolean }> {
  const client = getAnthropicClient()
  const prompt = buildPrompt(plant, only)

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

export function buildPatch(
  plant: DbPlant,
  response: CurationResponse
): PlantPatch {
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

  // [] is a real answer (style-neutral) and must be written, or the row
  // would read as never-asked forever.
  //
  // STAMPED HERE TOO, even though `style_checked_at` is named after
  // curate-styles. That script owns the column in round-status's STEP_DEFS, and
  // on 2026-07-29 it left the round cadence on the grounds that this pass
  // already does the job for a new seed, from the same shared definitions in
  // lib/style-tags.ts.
  //
  // CORRECTED 2026-08-14: it did not. The guard here was `style_tags == null`,
  // and the column is NOT NULL DEFAULT '{}', so the branch was unreachable and
  // this pass has never written a style tag. The claim that "rounds 9 and 10
  // wrote 100 rows of perfectly good style_tags" — repeated in this comment and
  // in backfill-guard-stamps.ts, and used to justify stamping them — was false:
  // all 100 of those rows are empty. Verify a claim like that with a count
  // before building on it. The guard is now the stamp, which is the only thing
  // that can distinguish a style-neutral verdict from an unasked question.
  if (!plant.style_checked_at && response.style_tags != null) {
    patch.style_tags = response.style_tags
    patch.style_checked_at = new Date().toISOString()
  }
  if (!plant.space_types?.length && response.space_types?.length)
    patch.space_types = response.space_types
  if (!plant.garden_use_tags?.length && response.garden_use_tags?.length)
    patch.garden_use_tags = response.garden_use_tags
  if (!plant.bloom_color?.length && response.bloom_color != null)
    patch.bloom_color = response.bloom_color
  // foliage_color: null is a valid value (means "typical green" — skip re-asking)
  if (plant.foliage_color === null && 'foliage_color' in response)
    patch.foliage_color = response.foliage_color ?? null
  // Stamped as well as written, so round-status can tell "judged false" from
  // "never asked" — false is the column default, so the value alone says
  // nothing (the same trap greenery_checked_at was added for).
  if (!plant.greenery_checked_at && typeof response.is_greenery === 'boolean') {
    patch.is_greenery = response.is_greenery
    patch.greenery_checked_at = new Date().toISOString()
  }
  // Sun: write the two source fields; the DB trigger derives sun_requirements.
  // Clamp tolerates to be disjoint from thrives (enforced by a CHECK too).
  if (!plant.sun_thrives?.length && response.sun_thrives?.length) {
    const thrives = response.sun_thrives
    const thrivesSet = new Set<string>(thrives)
    patch.sun_thrives = thrives
    patch.sun_tolerates = (response.sun_tolerates ?? []).filter(
      (s) => !thrivesSet.has(s)
    )
  }
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

/**
 * Narrow a patch to a single field plus the drafting stamp.
 *
 * THE SAFETY PROPERTY OF FIELD-SCOPED MODE LIVES HERE, not in the prompt.
 * `--only` drops the `is_curated` filter so it can reach signed-off rows, and
 * what makes that safe is that no editorially-watched column can be in the
 * patch — regardless of what the model returned, what buildPatch decided, or
 * what a future field added to buildPatch does. A guard that depends on the
 * response is a guard that a chatty response defeats.
 *
 * Exported as a seam: the refusal is only testable if it can be called.
 */
export function restrictPatch(
  patch: PlantPatch,
  only: string | null
): PlantPatch {
  if (!only) return patch
  // ai_drafted_at is required on PlantPatch and is written on every row, so it
  // is the floor rather than something copied conditionally.
  const narrowed: PlantPatch = { ai_drafted_at: patch.ai_drafted_at }
  if (only in patch) {
    ;(narrowed as Record<string, unknown>)[only] = (
      patch as Record<string, unknown>
    )[only]
  }
  return narrowed
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function fetchUncuratedPlants(
  ids: string[] | null,
  newOnly = false,
  only: string | null = null
): Promise<DbPlant[]> {
  const db = getSupabaseAdmin()

  // Paginated (standing rule 5). `is_curated` is true on 76 rows out of 595,
  // so an --all selection is most of the catalog and grows with every seed — a
  // bare .select() would silently start dropping rows from the drafting pass
  // as soon as it crosses 1000.
  return fetchAllRows<DbPlant>((from, to) => {
    let query = db.from('plants').select('*')

    // THE is_curated FILTER IS THE DRAFTING PASS'S GUARD, and field-scoped mode
    // deliberately drops it. A full draft may fill `space_types` or a
    // `description`, either of which clears an editorial verdict, so it must
    // never see a signed-off row. A `--only` run cannot: the patch is
    // restricted to one column and that column is refused if the trigger
    // watches it. The 14 signed-off rows among the 27 blank `common_issues`
    // rows are the reason this mode exists — without it they are unreachable
    // by the tool that drafts the field.
    if (!only) query = query.eq('is_curated', false)

    // Field-scoped: only rows actually missing it. Absent means NULL here, so
    // `.is(null)` is the whole predicate. Counted rather than assumed
    // (2026-08-17): `count(*) filter (where common_issues is null)` = 27,
    // `filter (where common_issues is not null and btrim(common_issues) = '')`
    // = 0. If a future --only target does carry empty strings, this predicate
    // silently skips them.
    if (only) query = query.is(only, null)

    // ids is null only for --all.
    if (ids) query = query.in('id', ids)

    // --new-only: limit to rows that have never been drafted, so a targeted
    // top-up after seeding a few plants doesn't re-draft the whole scope.
    if (newOnly) query = query.is('ai_drafted_at', null)

    return query.order('common_name').order('id').range(from, to)
  })
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
  const scope = requireScope(
    'curate-plants',
    'curate-plants bills Claude once per row, and the whole uncurated\n' +
      'catalog is ~519 plants — an accidental full run is both expensive and\n' +
      'a catalog-wide write.'
  )
  const ids = scopeIds(scope)
  const argv = process.argv.slice(2)
  const newOnly = argv.includes('--new-only')

  // --only <field>: fill ONE field on the rows that lack it, and nothing else.
  // The gap-filling counterpart to a full draft, for a field added or
  // re-specified after rows were already drafted.
  const onlyIdx = argv.indexOf('--only')
  const only = onlyIdx >= 0 ? (argv[onlyIdx + 1] ?? '') : null
  if (only !== null) {
    if (!only || only.startsWith('--')) {
      console.error('\n--only needs a field name, e.g. --only common_issues\n')
      process.exit(1)
    }
    if (EDITORIAL_TRIGGER_COLUMNS.has(only)) {
      console.error(
        `\n--only ${only} is refused: writing that column clears the editorial\n` +
          `verdict (migration 20260729101133), and field-scoped mode drops the\n` +
          `is_curated filter precisely so it can reach signed-off rows. Use a\n` +
          `full curate-plants run, which never sees them.\n`
      )
      process.exit(1)
    }
  }

  console.log(`\n${describeScope(scope, ids)}`)
  console.log(
    only
      ? `Fetching plants with no ${only} from Supabase...`
      : `Fetching ${newOnly ? 'undrafted ' : ''}uncurated plants from Supabase...`
  )
  const plants = await fetchUncuratedPlants(ids, newOnly, only)

  // withRunRecord owns the terminal paths, which is the canonical shape: the
  // guarantee that finalisation happens on every path is then structural rather
  // than something this file has to get right. Even "nothing to do" is recorded —
  // a real invocation whose honest row_count is 0. See run-provenance.ts.
  const runOptions = {
    step: only ? `curate-plants --only ${only}` : 'curate-plants',
    // Declared, not inferred: this pass writes the drafting stamp AND both
    // verdict stamps named after other scripts, which is exactly why the
    // column cannot identify the writer.
    //
    // A field-scoped run declares what it can actually write, which is the one
    // field and the drafting stamp. Declaring the full set would claim two
    // stamps it is structurally incapable of moving, and finalisation would
    // then observe zero against a claim of N on both.
    writeSet: only
      ? [only, 'ai_drafted_at']
      : ['ai_drafted_at', 'style_checked_at', 'greenery_checked_at'],
    // TRAP 28, and this file is where it was found — by writing the test, a day
    // after this run was called correct.
    //
    // Only `ai_drafted_at` is written on every row this pass touches. The other
    // two are guarded by their own stamp (`if (!plant.style_checked_at)` in
    // buildPatch), so a run over a mix of already-judged and never-judged rows
    // moves them on a SUBSET. The default made all three confirming witnesses,
    // and finalisation compares each one against the run's TOTAL — so a
    // perfectly correct run claiming 25 rows, 10 of them already style-stamped,
    // would observe 15 and record itself `contradicted`.
    //
    // A conditionally-written stamp cannot confirm the whole run. It bounds it.
    //
    // Annotated because `runOptions` is a named const rather than an inline
    // argument, so there is no contextual type to narrow `kind` against.
    evidence: (only
      ? [
          { kind: 'stamp', covers: 'ai_drafted_at', column: 'ai_drafted_at' },
          // The scoped field is a value column: not window-queryable, so it
          // needs a witness or beginRun throws. It IS written on every row the
          // run writes — selection is `.is(only, null)` — but row-touched is
          // still the only observable available for a value column.
          {
            kind: 'row-touched',
            covers: only,
            table: 'plants',
            column: 'updated_at',
          },
        ]
      : [
          { kind: 'stamp', covers: 'ai_drafted_at', column: 'ai_drafted_at' },
          {
            kind: 'row-touched',
            covers: 'style_checked_at',
            table: 'plants',
            column: 'updated_at',
          },
          {
            kind: 'row-touched',
            covers: 'greenery_checked_at',
            table: 'plants',
            column: 'updated_at',
          },
        ]) as Witness[],
    scope: describeScope(scope, ids),
    recipe: {
      model: CURATION_MODEL,
      // The template as assembled, with a representative row substituted out:
      // per-row subject is excluded from the recipe by construction. A scoped
      // run renders its own narrower template, so its hash separates from a
      // full draft's — which is the point: they are different recipes.
      template: buildPrompt(RECIPE_PROBE_ROW, only),
      ingredients: only
        ? {}
        : { style_tags: STYLE_TAG_PROMPT, greenery: GREENERY_PROMPT },
      decoding: { max_tokens: 2048 },
    },
  }

  const outcome = await withRunRecord(runOptions, async (run) => {
    if (!plants.length) {
      console.log('No uncurated plants found — nothing to do.')
      return {
        failures: [] as Array<{ name: string; error: string }>,
        succeeded: 0,
        lowConfidenceHardiness: [] as string[],
        nullPlantType: [] as string[],
      }
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
        const { response, lowConfidence } = await getCurationFromClaude(
          plant,
          only
        )

        if (lowConfidence) lowConfidenceHardiness.push(label)

        // Flag plants where plant_type came back null
        const effectiveType = plant.plant_type ?? response.plant_type
        if (!effectiveType) nullPlantType.push(label)

        // Restricting the PATCH rather than trusting the prompt is what makes
        // field-scoped mode safe on a signed-off row. The model can return any
        // field it likes and buildPatch stays fill-only for all of them; this
        // is the line that guarantees only the named column reaches the
        // database, so the refusal list above cannot be bypassed by a chatty
        // response.
        const patch = restrictPatch(buildPatch(plant, response), only)
        // A scoped run exists to fill ONE field, so getting nothing back for it
        // is a failed row, not a quiet skip. Thrown rather than `continue`d:
        // the catch records it in `failures`, and control still reaches the
        // pacing sleep at the bottom of the loop.
        if (only && !(only in patch)) {
          throw new Error(`no ${only} returned`)
        }
        await patchPlant(plant.id, patch)
        run.wrote(plant.id)

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

    // A pass where every row errored is a failure even though nothing threw.
    if (failures.length && !succeeded) {
      run.markFailed(`all ${failures.length} row(s) failed`)
    }
    return { failures, succeeded, lowConfidenceHardiness, nullPlantType }
  })

  const { failures, succeeded, lowConfidenceHardiness, nullPlantType } = outcome

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

// Guarded so the test file can import buildPatch without running the pass —
// same pattern as pick-plant-images.ts.
if (require.main === module) {
  main().catch((err) => {
    console.error('Unexpected error:', err)
    process.exit(1)
  })
}
