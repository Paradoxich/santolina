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
 * Stamps style_checked_at on every judged row (migration 20260728114824);
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
import {
  requireScope,
  scopeIds,
  describeScope,
  applyScope,
  scopeGuard,
  requireReasonForAll,
} from './scope'
import { fetchAllRows } from '../lib/paginate'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import {
  STYLE_TAGS,
  STYLE_TAG_PROMPT,
  STYLE_AXES,
  EXCLUSIVE_STYLE_AXES,
  CONFUSABLE_STYLE_PAIRS,
  MEAN_TAGS_PER_PLANT_BASELINE,
  type StyleTag,
} from '../lib/style-tags'
import { withRunRecord, type Witness } from './run-provenance'

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

// Scope is mandatory (scripts/scope.ts). This script used to select
// catalog-wide and narrow with a state predicate, which is not a scope: it
// looks like one until the day it matches an older round's rows, which is
// exactly how round 8 wrote to plants it had never seeded.
const SCOPE = requireScope(
  'curate-styles',
  'This pass bills Claude per row and OVERWRITES style_tags, which drive the Explore browse tiles. An unscoped run would re-judge every plant in the catalog.'
)
const SCOPE_IDS = scopeIds(SCOPE)
const WHY_ALL = requireReasonForAll(SCOPE)
const guardScope = scopeGuard(SCOPE, SCOPE_IDS)

/**
 * The id to write to, refusing if the row is outside the active scope.
 *
 * Used inline at the `.eq('id', ...)` so the check cannot be separated from
 * the write it protects — a guard two lines above a write is a guard someone
 * eventually moves.
 */
function guardWrite(plant: { id: string; common_name: string }): string {
  guardScope(plant.id, plant.common_name)
  return plant.id
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * An empty row, used ONLY to render the template for the recipe hash.
 *
 * The recipe is what was constant across rows: the model, the assembled
 * template and the tag vocabulary. Substituting a real plant would fold its
 * subject into the hash and give every row its own cohort, which is the one
 * thing the hash exists not to do. Same shape as curate-plants' probe row.
 */
const RECIPE_PROBE_ROW: PlantRow = {
  id: 'recipe-probe',
  common_name: '',
  scientific_name: null,
  plant_type: null,
  plant_type_label: null,
  description: null,
  bloom_color: null,
  bloom_months: null,
  foliage_color: null,
  is_greenery: null,
  native_to: null,
  style_tags: null,
  style_checked_at: null,
}

function buildPrompt(plant: PlantRow): string {
  // Deliberately excludes the current style_tags — a blind re-judgment.
  // garden_use_tags is excluded too: it dates from the loose-prompt era and
  // often literally says "cottage gardens" (all 57 such rows carried the
  // cottage tag), which anchors exactly the judgment this pass re-makes.
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

  // Full-table read — through the shared helper, not a hand-rolled loop. Four
  // scripts had grown their own copy of this paging code, which is how a rule
  // drifts: every copy is a place the fix can fail to reach.
  const plants = await fetchAllRows<PlantRow>((from, to) => {
    let query = db
      .from('plants')
      .select(
        'id, common_name, scientific_name, plant_type, plant_type_label, description, bloom_color, bloom_months, foliage_color, is_greenery, native_to, style_tags, style_checked_at'
      )
      .order('common_name')
      .order('id')
      .range(from, to)
    if (NEW_ONLY) query = query.is('style_checked_at', null)
    query = applyScope(query, SCOPE_IDS)
    return query
  })

  let selected = plants
  if (LIMIT) selected = selected.slice(0, LIMIT)

  console.log(describeScope(SCOPE, SCOPE_IDS))
  if (WHY_ALL) console.log(`Whole-catalog run, because: ${WHY_ALL}`)

  console.log(
    `Judging ${selected.length} plant(s)${NEW_ONLY ? ' (new only)' : ''}${DRY_RUN ? ' — DRY RUN, no writes' : ''}`
  )

  const tagCounts = new Map<StyleTag, number>()
  // Per-plant judgments, kept for the calibration report below — a share is a
  // statement about the population, and the bar being checked is per plant.
  const judgments: { name: string; tags: StyleTag[] }[] = []
  let unchanged = 0
  let neutral = 0
  const failed: string[] = []

  const judgeAll = async (wrote: (id: string) => void) => {
    for (const [i, plant] of selected.entries()) {
      try {
        const tags = await judgePlant(plant)

        for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
        judgments.push({ name: plant.common_name, tags })
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
            .eq('id', guardWrite(plant))
          if (error) throw new Error(`DB write failed: ${error.message}`)
          wrote(plant.id)
        }
      } catch (err) {
        failed.push(`${plant.common_name} — ${(err as Error).message}`)
        console.error(
          `  [${i + 1}/${selected.length}] ${plant.common_name}: FAILED — ${(err as Error).message}`
        )
      }
      if (i < selected.length - 1) await sleep(INTER_PLANT_DELAY_MS)
    }
  }

  const runOptions = {
    step: 'curate-styles',
    // Both members are written in the SAME statement on every row this pass
    // writes at all, so neither is the trap-28 shape: there is no branch where
    // the stamp moves on a subset of the counted rows.
    writeSet: ['style_tags', 'style_checked_at'],
    // style_checked_at witnesses itself — the pass SETS it, never clears it.
    // style_tags is a value column and cannot be compared to an instant, so
    // beginRun would throw without an explicit witness for it.
    evidence: [
      { kind: 'stamp', covers: 'style_checked_at', column: 'style_checked_at' },
      {
        kind: 'row-touched',
        covers: 'style_tags',
        table: 'plants',
        column: 'updated_at',
      },
    ] as Witness[],
    scope: describeScope(SCOPE, SCOPE_IDS),
    recipe: {
      model: CURATION_MODEL,
      template: buildPrompt(RECIPE_PROBE_ROW),
      ingredients: { style_tags: STYLE_TAG_PROMPT },
      decoding: { max_tokens: 256 },
    },
  }

  // A dry run opens NO run, because provenance records what produced a value
  // and a pass that writes none produced none. Recording one would file an
  // invocation that no stamp can ever corroborate — a row in the log that
  // looks like a write and is not, which is the shelf-life problem the module
  // header warns about, manufactured on purpose.
  if (DRY_RUN) {
    await judgeAll(() => {})
  } else {
    await withRunRecord(runOptions, async (run) => {
      await judgeAll((id) => run.wrote(id))
    })
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

    reportCalibration(judgments)
  }
  if (failed.length) {
    console.log(`\n${failed.length} failure(s):`)
    for (const f of failed) console.log(`  ${f}`)
    process.exit(1)
  }
}

/**
 * The calibration half of the report: whether the SIGNATURE bar held, as
 * opposed to how the tags are spread.
 *
 * The two questions are different and only the second used to be asked. A tag
 * share is a property of the population — it moves when a seed round lands and
 * nobody re-judged anything, which is how `modern` reading low was mistaken
 * for a species gap. These numbers are properties of the judgment and do not
 * move with catalog size.
 *
 * Mean tags per plant is printed against the round-12 baseline but NOT warned
 * on, deliberately. The 6 -> 20 expansion added purpose and mood styles that
 * cut across aesthetics, so a higher mean is ambiguous between a working
 * vocabulary and a slipped bar (see STYLE_AXES). Warning on an ambiguous
 * number would train the next person to tune until it went green.
 *
 * The warn is on within-axis doubling, which stays unambiguous: two aesthetic
 * tags means one plant was judged the signature of two different looks.
 */
function reportCalibration(judgments: { name: string; tags: StyleTag[] }[]) {
  if (judgments.length === 0) return

  const instances = judgments.reduce((a, j) => a + j.tags.length, 0)
  const mean = instances / judgments.length
  const spread = new Map<number, number>()
  for (const j of judgments)
    spread.set(j.tags.length, (spread.get(j.tags.length) ?? 0) + 1)

  console.log(
    '\nCalibration — properties of the judgment, not of catalog size:'
  )
  console.log(
    `  mean tags per plant   ${mean.toFixed(2)}   (round-12 baseline ${MEAN_TAGS_PER_PLANT_BASELINE}, 6 styles)`
  )
  console.log(
    `  spread                ${[...spread.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, c]) => `${n}:${c}`)
      .join(' · ')}`
  )

  const violations: string[] = []
  for (const axis of EXCLUSIVE_STYLE_AXES) {
    const members: StyleTag[] = STYLE_AXES[axis]
    const doubled = judgments.filter(
      (j) => j.tags.filter((t) => members.includes(t)).length > 1
    )
    console.log(
      `  two ${axis.padEnd(10)} tags   ${String(doubled.length).padStart(3)} of ${judgments.length}`
    )
    for (const d of doubled)
      violations.push(
        `${d.name}: [${d.tags.filter((t) => members.includes(t)).join(', ')}] (${axis})`
      )
  }

  if (violations.length) {
    console.log(
      `\nWARNING: ${violations.length} plant(s) carry two tags on an axis where that is a judgment error.`
    )
    console.log(
      'A plant is the signature of at most one look and at most one place. Tighten'
    )
    console.log('those definitions against each other in lib/style-tags.ts:')
    for (const v of violations) console.log(`  ${v}`)
  }

  const pairHits = CONFUSABLE_STYLE_PAIRS.map(([a, b]) => {
    const both = judgments.filter(
      (j) => j.tags.includes(a) && j.tags.includes(b)
    )
    const either = judgments.filter(
      (j) => j.tags.includes(a) || j.tags.includes(b)
    ).length
    return { a, b, both: both.length, either }
  }).filter((p) => p.both > 0)

  if (pairHits.length) {
    console.log(
      '\nConfusable pairs that co-occurred (bleed, not necessarily wrong):'
    )
    for (const p of pairHits)
      console.log(
        `  ${`${p.a} + ${p.b}`.padEnd(32)} ${p.both} of ${p.either} carrying either`
      )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
