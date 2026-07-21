/**
 * AI curation pass — distills prescriptive per-stage care actions into the
 * `seasonal_care` jsonb field (Care Tips v2, Tier 1 replacement).
 *
 * Where `seasonal_rhythm` DESCRIBES what a plant is doing each stage, this pass
 * PRESCRIBES what you do about it: one imperative line per stage, or null when
 * there is nothing to do (the expected value for most plants most stages).
 * Source material is the plant's own `maintenance_notes` + `seasonal_rhythm` +
 * `bloom_months` — no new botanical facts are invented; the manual is distilled
 * and re-timed onto the six seasonal stages.
 *
 * Fill-only and idempotent: only touches rows where `seasonal_care IS NULL` and
 * `seasonal_rhythm IS NOT NULL` (the source must exist). Never overwrites a
 * populated `seasonal_care`. Not in the upsert_trefle_plant path, so re-seeds
 * cannot touch it. Re-running skips already-filled rows (0 re-writes).
 *
 * Each generated line is validated (length, imperative-not-descriptive, keys,
 * copy rules). Violations get one strict retry; if still failing, the plant is
 * FLAGGED and NOT written — copy is never silently truncated or rewritten.
 *
 * Usage (from apps/web):
 *   # Reviewable sample (no DB writes) — dumps JSON to reports/ for Ana:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-seasonal-care.ts --sample 20
 *   # Full run (fill-only writes):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-seasonal-care.ts
 *   # Cheap smoke test of the generate/validate loop:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-seasonal-care.ts --sample 3
 *
 * Flags:
 *   --sample [N]   Generate for a curated N-plant sample (default 20), write
 *                  nothing to the DB, emit a review artifact to reports/.
 *   --limit N      Cap the number of plants processed in a full run.
 *   --new-only     Restrict to the newest seed batch (by created_at day).
 *   --ids a,b,c    Restrict to specific plant ids (targeted re-sample after a
 *                  fix). Bypasses sample selection; combine with --sample for a
 *                  no-write re-check of just those plants.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import type { DbPlant, SeasonalCare, SeasonalRhythm } from '../lib/plants-db'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// 2s between Claude calls — well within Anthropic rate limits at this volume
const INTER_PLANT_DELAY_MS = 2000

const DEFAULT_SAMPLE_SIZE = 20

const SEASONAL_KEYS: Array<keyof SeasonalRhythm> = [
  'early_spring',
  'late_spring',
  'summer',
  'late_summer',
  'autumn',
  'winter',
]

// A tip is one action, ≤12 words / ~90 chars. A paragraph can't happen.
const MAX_WORDS = 12
const MAX_CHARS = 90

// Stage → months legend for the prompt, so the model maps an action's correct
// horticultural timing onto THIS app's stage boundaries. Mirrors the canonical
// MONTH_TO_SEASON in lib/season.ts — keep in sync if that changes. The tell is
// late_summer = September only, autumn = October-November (so "early autumn"
// bulb planting belongs in autumn, not late_summer).
const STAGE_MONTHS = `- early_spring: March, April
- late_spring: May, June
- summer: July, August
- late_summer: September
- autumn: October, November
- winter: December, January, February`

// Imperative allow-set: the action verbs care tips actually issue. A non-null
// line must START with one of these — this is what rejects descriptive
// `seasonal_rhythm`-style sentences ("Foliage yellows in autumn") that leaked
// into the wrong field. Flagged, not dropped, so Ana sees any false positives.
// Note: "feed"/"feeding" is deliberately absent — the vocabulary ruling is
// "fertilize", never "feed" (checked separately for a clearer flag reason).
const ACTION_VERBS = new Set([
  'water',
  'fertilize',
  'prune',
  'deadhead',
  'mulch',
  'divide',
  'cut',
  'trim',
  'stake',
  'lift',
  'plant',
  'sow',
  'pinch',
  'thin',
  'harvest',
  'protect',
  'cover',
  'wrap',
  'shelter',
  'shade',
  'move',
  'transplant',
  'repot',
  'pot',
  'tie',
  'support',
  'clear',
  'remove',
  'clean',
  'weed',
  'top',
  'dig',
  'apply',
  'spread',
  'add',
  'reduce',
  'stop',
  'hold',
  'leave',
  'let',
  'check',
  'monitor',
  'wait',
  'avoid',
  'keep',
  'allow',
  'raise',
  'ease',
  'resume',
  'begin',
  'start',
  'guide',
  'tidy',
  'train',
  'snip',
  'shear',
  'clip',
  'rake',
  'loosen',
  'firm',
  'fork',
  'direct',
  'position',
  'mound',
  'hill',
  'brush',
  'rejuvenate',
  'refresh',
  // Added after the first full run surfaced these as legitimate garden actions
  // the allow-set lacked (grasses, seed-saving, structure work).
  'comb',
  'collect',
  'gather',
  'mow',
  'install',
  'control',
  'mark',
  'top-dress',
  'shape',
  // Added after the round-7 herb run: annual clear-out and overwintering
  // tender plants in pots are legitimate garden actions.
  'pull',
  'bring',
])

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(plant: DbPlant, strictReminder?: string): string {
  const context = {
    common_name: plant.common_name,
    scientific_name: plant.scientific_name,
    plant_type: plant.plant_type,
    bloom_months: plant.bloom_months ?? [],
    maintenance_notes: plant.maintenance_notes ?? null,
    seasonal_rhythm: plant.seasonal_rhythm ?? null,
  }

  return `You distill a plant's care manual into per-season prescriptive tips.

Source data for this plant:
${JSON.stringify(context, null, 2)}

Return a JSON object whose TOP-LEVEL keys are EXACTLY these six, in order:
${JSON.stringify(SEASONAL_KEYS)}
Do NOT nest them under a "seasonal_care" key or any other wrapper — the six stage keys are the top level of the object.

Each stage covers specific months (this app's mapping):
${STAGE_MONTHS}
Place each action in the stage whose months are horticulturally right for it.

For each stage, the value is EITHER a single imperative care line OR null.

Rules (strict):
- null is the correct, EXPECTED value for most plants at most stages. Only write a line when there is a real, timely action a gardener should take at that stage for THIS plant. Do NOT manufacture busywork for a resting or dormant stage.
- Distill from the source only. Do not invent care facts the source doesn't support. If maintenance_notes is thin or null, prefer null over guessing.
- "Anytime" actions get null, not a season. If an action is done "as needed" / "as required" / whenever you notice it (e.g. "remove dead or damaged leaves as needed") and the source gives it NO season, leave every stage null for it — do not attach it to a stage. (Genuine conditionals tied to a real time, like "stake if needed" in the growing season, are fine.)
- Assign each seasonal action to its horticulturally CORRECT stage, even when the source states no season. Never place an action in a stage just because that stage is empty. In particular: divide/lift most perennials in EARLY SPRING (not winter — you do not divide into frozen ground); plant spring-flowering bulbs in the AUTUMN stage (October-November), not late_summer; prune spring-flowering shrubs AFTER they flower. If you are unsure of the correct season for an action, use null rather than guessing a stage.
- If a line says "after flowering" / "once flowering finishes" / "immediately after blooming", the stage you assign it to must be a stage that comes AFTER this species' actual bloom window ends — never the stage(s) it is still in bloom, and never a stage before bloom starts. Use bloom_months to find when flowering ends. This applies just as much to winter- and early-spring-flowering shrubs (bloom Dec-Mar) as to summer bloomers — an "after flowering" action for a February-blooming shrub belongs in early_spring or later, not before.
- One action per line. It must answer "why now?" — a thing you DO, not a description of what the plant is doing. Never write a line that only describes the plant's own natural behavior with no action attached (e.g. "Watch for flowers emerging", "Note new foliage appearing") — that is seasonal_rhythm content, not seasonal_care. If there is nothing to DO, the value is null.
- Start each line with an imperative verb (Water…, Prune…, Mulch…, Deadhead…, Cut back…, Divide…, Protect…).
- Maximum ${MAX_WORDS} words / ~${MAX_CHARS} characters per line. Terse. Sentence case. End with a period.
- No em dashes or en dashes anywhere. Plain sentences only.
- Vocabulary: use "fertilize" for applying fertilizer, NEVER "feed" or "feeding". BUT do NOT call the natural process of foliage nourishing a bulb, corm, rhizome, or roots "fertilize" — that is "replenish" (e.g. "Allow foliage to die back to replenish the bulb", never "fertilize the bulb").
- Keep it plant-agnostic in phrasing (the plant name is shown separately) — say "Prune after flowering.", not "Prune the rose after flowering."
${strictReminder ? `\nYour previous attempt failed validation. Fix ONLY these problems and resend the full object:\n${strictReminder}\n` : ''}
Respond with ONLY the JSON object, no markdown, no code fences, no preamble.`
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

async function getSeasonalCareFromClaude(
  plant: DbPlant,
  strictReminder?: string
): Promise<Record<string, unknown>> {
  const client = getAnthropicClient()
  const prompt = buildPrompt(plant, strictReminder)

  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 1024,
    system:
      'You are a horticultural copy assistant. Respond with ONLY valid JSON, no markdown, no code fences, no preamble, no explanation.',
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

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`)
  }
  return unwrap(parsed)
}

/**
 * The model occasionally nests the six stage keys under a single wrapper key
 * (e.g. {"seasonal_care": {...}}) despite being told not to. Unwrap it so a
 * benign format wobble never costs a plant; content validation is unchanged.
 */
function unwrap(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj)
  if (keys.length === 1) {
    const inner = obj[keys[0]!]
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const innerKeys = Object.keys(inner as Record<string, unknown>)
      if (
        innerKeys.some((k) => SEASONAL_KEYS.includes(k as keyof SeasonalRhythm))
      )
        return inner as Record<string, unknown>
    }
  }
  return obj
}

// ---------------------------------------------------------------------------
// Validation — length, imperative-not-descriptive, keys, copy rules
// ---------------------------------------------------------------------------

interface Violation {
  stage: string
  reason: string
}

// Adverbs a real imperative can legitimately lead with — the verb follows.
// ("Lightly prune...", "Hard prune...") We check the word after the adverb.
const LEAD_ADVERBS = new Set([
  'lightly',
  'hard',
  'gently',
  'carefully',
  'regularly',
  'occasionally',
  'deeply',
  'thinly',
])

// The first one or two leading words, lowercased (stripping any leading
// punctuation). Used to find the imperative verb, allowing one lead adverb.
function leadingWords(line: string): [string, string] {
  const m = line
    .trim()
    .match(/^[^A-Za-z]*([A-Za-z][A-Za-z'-]*)(?:\s+([A-Za-z][A-Za-z'-]*))?/)
  return [(m?.[1] ?? '').toLowerCase(), (m?.[2] ?? '').toLowerCase()]
}

// The imperative verb: the first word, or the second if the first is a lead
// adverb ("Lightly prune" → "prune").
function imperativeVerb(line: string): string {
  const [w1, w2] = leadingWords(line)
  return LEAD_ADVERBS.has(w1) && w2 ? w2 : w1
}

function validateLine(stage: string, line: string): Violation | null {
  const trimmed = line.trim()
  if (!trimmed) return { stage, reason: 'empty string (use null, not "")' }
  // Copy rule: no em/en dashes.
  if (/[—–]/.test(trimmed)) return { stage, reason: 'contains em/en dash' }
  // Vocabulary ruling: fertilize, never feed.
  if (/\bfeed(s|ing)?\b/i.test(trimmed))
    return { stage, reason: 'uses "feed" (must be "fertilize")' }
  // Vocabulary ruling: autumn, never the US "fall".
  if (/\bfall\b/i.test(trimmed))
    return { stage, reason: 'uses "fall" (must be "autumn")' }
  // "feed the bulb" metaphor misfire: foliage nourishing a bulb/rhizome/root is
  // "replenish", not "fertilize" — the fertilize-not-feed rule over-applied.
  if (
    /\bfertiliz(e|es|ing)\b[^.]*\b(bulb|bulbs|corm|corms|rhizome|rhizomes|tuber|tubers|root|roots)\b/i.test(
      trimmed
    )
  )
    return {
      stage,
      reason: 'foliage "fertilize" a bulb/root — use "replenish"',
    }
  // Busywork guard: an "as needed / as required" action is an anytime task with
  // an invented season attached — it should be null, not tied to a stage. The
  // retry names this so the model nulls the stage. Honest conditionals ("if
  // needed", "if desired") are real timing and pass untouched.
  if (/\bas (needed|required|necessary)\b/i.test(trimmed))
    return {
      stage,
      reason: '"as needed" is an anytime action — use null, not a stage',
    }
  // Descriptive-content tell: "Watch for X emerging" etc. is seasonal_rhythm
  // narrative (what the plant is doing) wearing an imperative verb as a
  // disguise — it isn't a care action, so grammatically-imperative isn't
  // enough. Found in editorial review (July 15 2026): every catalog instance
  // of these five starters was descriptive, none a real task.
  const leadVerb = imperativeVerb(trimmed)
  if (['watch', 'look', 'note', 'observe', 'expect'].includes(leadVerb))
    return {
      stage,
      reason: `"${leadVerb}" is descriptive narrative, not a care action — use null`,
    }
  // Length.
  const words = trimmed.split(/\s+/).length
  if (words > MAX_WORDS)
    return { stage, reason: `${words} words (max ${MAX_WORDS})` }
  if (trimmed.length > MAX_CHARS)
    return { stage, reason: `${trimmed.length} chars (max ~${MAX_CHARS})` }
  // Imperative, not descriptive (allowing one lead adverb before the verb).
  const verb = imperativeVerb(trimmed)
  if (!ACTION_VERBS.has(verb))
    return {
      stage,
      reason: `not imperative — starts with "${verb}"`,
    }
  return null
}

/**
 * Validate the raw model object. Returns violations plus a normalized
 * SeasonalCare on success (keys guaranteed, values string|null).
 */
function validateResponse(obj: Record<string, unknown>): {
  violations: Violation[]
  care: SeasonalCare | null
} {
  const violations: Violation[] = []
  const keys = Object.keys(obj)
  const extra = keys.filter(
    (k) => !SEASONAL_KEYS.includes(k as keyof SeasonalRhythm)
  )
  const missing = SEASONAL_KEYS.filter((k) => !(k in obj))
  for (const k of extra) violations.push({ stage: k, reason: 'unexpected key' })
  for (const k of missing) violations.push({ stage: k, reason: 'missing key' })

  const care = {} as SeasonalCare
  for (const key of SEASONAL_KEYS) {
    const val = obj[key]
    if (val === null || val === undefined) {
      care[key] = null
      continue
    }
    if (typeof val !== 'string') {
      violations.push({
        stage: key,
        reason: `non-string value (${typeof val})`,
      })
      care[key] = null
      continue
    }
    const v = validateLine(key, val)
    if (v) violations.push(v)
    care[key] = val.trim()
  }

  return { violations, care: violations.length ? null : care }
}

// ---------------------------------------------------------------------------
// Generate + validate, with one strict retry
// ---------------------------------------------------------------------------

interface GenerateResult {
  care: SeasonalCare | null // non-null only when validation passed
  raw: Record<string, unknown> // last attempt, for the sample artifact
  violations: Violation[] // from the last attempt
}

async function generateForPlant(plant: DbPlant): Promise<GenerateResult> {
  let obj = await getSeasonalCareFromClaude(plant)
  let { violations, care } = validateResponse(obj)
  if (!violations.length) return { care, raw: obj, violations }

  // One strict retry, naming exactly what failed.
  const reminder = violations.map((v) => `- ${v.stage}: ${v.reason}`).join('\n')
  obj = await getSeasonalCareFromClaude(plant, reminder)
  ;({ violations, care } = validateResponse(obj))
  return { care, raw: obj, violations }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function fetchEligiblePlants(newOnly: boolean): Promise<DbPlant[]> {
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('plants')
    .select('*')
    .is('seasonal_care', null)
    .not('seasonal_rhythm', 'is', null)
    .order('common_name')

  if (error) throw new Error(`Failed to fetch plants: ${error.message}`)
  let plants = (data ?? []) as DbPlant[]

  // --new-only: keep only rows created on the newest seed day (most recent
  // batch), for a targeted top-up after seeding.
  if (newOnly && plants.length) {
    const newestDay = plants
      .map((p) => p.created_at.slice(0, 10))
      .sort()
      .at(-1)
    plants = plants.filter((p) => p.created_at.slice(0, 10) === newestDay)
  }
  return plants
}

async function patchSeasonalCare(
  id: string,
  seasonal_care: SeasonalCare
): Promise<void> {
  const db = getSupabaseAdmin()
  const { error } = await db
    .from('plants')
    .update({ seasonal_care })
    .eq('id', id)
  if (error) throw new Error(`Failed to patch plant ${id}: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Sample selection — diversity across plant_type + forced-in thin notes
// ---------------------------------------------------------------------------

function notesLen(p: DbPlant): number {
  return p.maintenance_notes?.trim().length ?? 0
}

/**
 * The distillation's real failure mode is inventing actions when the source is
 * thin, and a plant_type spread alone won't surface that. So the sample forces
 * in the plants with the sparsest maintenance_notes (quota ~1/4), then fills
 * the rest by round-robin across plant_type buckets for breadth.
 */
function pickSample(plants: DbPlant[], n: number): DbPlant[] {
  if (plants.length <= n) return plants
  const chosen = new Map<string, DbPlant>()

  const thinQuota = Math.min(Math.ceil(n / 4), plants.length)
  const byNotes = [...plants].sort((a, b) => notesLen(a) - notesLen(b))
  for (const p of byNotes) {
    if (chosen.size >= thinQuota) break
    chosen.set(p.id, p)
  }

  const buckets = new Map<string, DbPlant[]>()
  for (const p of plants) {
    if (chosen.has(p.id)) continue
    const key = p.plant_type ?? 'unknown'
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(p)
  }
  const bucketList = [...buckets.values()]
  let idx = 0
  while (chosen.size < n && bucketList.some((b) => b.length)) {
    const b = bucketList[idx % bucketList.length]
    const p = b?.shift()
    if (p) chosen.set(p.id, p)
    idx++
  }
  return [...chosen.values()]
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function pad(n: number, width = 3): string {
  return String(n).padStart(width, ' ')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function countLines(care: SeasonalCare): number {
  return SEASONAL_KEYS.filter((k) => care[k] != null).length
}

interface Flags {
  sample: boolean
  sampleSize: number
  limit: number | null
  newOnly: boolean
  ids: string[] | null
}

function parseFlags(): Flags {
  const argv = process.argv.slice(2)
  const flags: Flags = {
    sample: false,
    sampleSize: DEFAULT_SAMPLE_SIZE,
    limit: null,
    newOnly: argv.includes('--new-only'),
    ids: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--sample') {
      flags.sample = true
      const next = argv[i + 1]
      if (next && /^\d+$/.test(next)) {
        flags.sampleSize = parseInt(next, 10)
        i++
      }
    } else if (a === '--limit') {
      const next = argv[i + 1]
      if (!next || !/^\d+$/.test(next))
        throw new Error('--limit must be a positive integer')
      flags.limit = parseInt(next, 10)
      i++
    } else if (a === '--ids') {
      // Restrict to specific plant ids (comma-separated). For targeted
      // re-sampling of individual plants after a fix. Bypasses pickSample.
      const next = argv[i + 1]
      if (!next) throw new Error('--ids requires a comma-separated id list')
      flags.ids = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return flags
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseFlags()

  console.log(
    '\nFetching eligible plants (seasonal_care null, seasonal_rhythm present)...'
  )
  let plants = await fetchEligiblePlants(flags.newOnly)

  // --ids: restrict to specific plants (targeted re-sample after a fix).
  if (flags.ids) {
    const wanted = new Set(flags.ids)
    plants = plants.filter((p) => wanted.has(p.id))
    const missing = flags.ids.filter((id) => !plants.some((p) => p.id === id))
    if (missing.length)
      console.log(
        `⚠  ${missing.length} requested id(s) not eligible (already filled or unknown): ${missing.join(', ')}`
      )
  }

  if (!plants.length) {
    console.log('No eligible plants found — nothing to do.')
    process.exit(0)
  }

  if (flags.sample) {
    // --ids already selected the exact plants; otherwise curate the spread.
    if (!flags.ids) plants = pickSample(plants, flags.sampleSize)
    console.log(
      `\nSAMPLE mode: generating for ${plants.length} plant(s), no DB writes.\n`
    )
  } else {
    if (flags.limit != null) plants = plants.slice(0, flags.limit)
    console.log(`\nFull run: generating for ${plants.length} plant(s).\n`)
  }

  const failures: Array<{ name: string; error: string }> = []
  const flagged: Array<{ name: string; violations: Violation[] }> = []
  const allNull: string[] = []
  const sampleRows: Array<Record<string, unknown>> = []
  let succeeded = 0

  for (const [i, plant] of plants.entries()) {
    const label = plant.scientific_name ?? plant.common_name
    const prefix = `[${pad(i + 1)}/${pad(plants.length)}]`

    try {
      process.stdout.write(`${prefix} ${label} … `)
      const { care, raw, violations } = await generateForPlant(plant)

      if (flags.sample) {
        sampleRows.push({
          id: plant.id,
          common_name: plant.common_name,
          scientific_name: plant.scientific_name,
          plant_type: plant.plant_type,
          bloom_months: plant.bloom_months,
          // Both distillation sources shown, so every output line is traceable
          // (seasonal_rhythm feeds the timing that maintenance_notes alone omits).
          maintenance_notes: plant.maintenance_notes,
          seasonal_rhythm: plant.seasonal_rhythm,
          seasonal_care: raw,
          validation: {
            ok: violations.length === 0,
            violations,
          },
        })
      }

      if (!care) {
        flagged.push({ name: label, violations })
        console.log(
          `⚠ flagged (${violations.map((v) => `${v.stage}: ${v.reason}`).join('; ')})`
        )
      } else {
        const lines = countLines(care)
        if (lines === 0) allNull.push(label)
        if (!flags.sample) await patchSeasonalCare(plant.id, care)
        console.log(
          `✓  ${lines} line(s)${lines === 0 ? ' (all null)' : ''}${
            flags.sample ? ' [not written]' : ''
          }`
        )
        succeeded++
      }
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
    `Complete: ${succeeded} ok, ${flagged.length} flagged, ${failures.length} errored`
  )

  if (allNull.length) {
    console.log(
      `\n∅  ${allNull.length} plant(s) with no action any stage (all null) — worth a glance:`
    )
    for (const name of allNull) console.log(`   • ${name}`)
  }

  if (flagged.length) {
    console.log(`\n⚠  ${flagged.length} plant(s) flagged (NOT written):`)
    for (const { name, violations } of flagged) {
      console.log(`   • ${name}`)
      for (const v of violations) console.log(`       ${v.stage}: ${v.reason}`)
    }
  }

  if (flags.sample) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const dir = join(__dirname, '..', 'reports')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `seasonal-care-sample-${stamp}.json`)
    writeFileSync(
      file,
      JSON.stringify(
        {
          ran_at: new Date().toISOString(),
          model: CURATION_MODEL,
          mode: 'sample',
          sample_size: sampleRows.length,
          results: sampleRows,
        },
        null,
        2
      )
    )
    console.log(`\nSample written to ${file}`)
    console.log('Review, then post to the Care Tips v2 spec page in Notion.')
  }

  if (failures.length) {
    console.log('\nErrored plants:')
    for (const { name, error } of failures) console.log(`  • ${name}: ${error}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
