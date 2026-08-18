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
 * Ends with two reports. The tag DISTRIBUTION warns if any tag covers more
 * than 40% of the judged set. The CALIBRATION report covers the other
 * question — whether the signature bar held — via mean tags per plant, the
 * spread, within-axis doubling and confusable-pair co-occurrence. Only the
 * within-axis half warns; see reportCalibration for why the mean does not.
 * Either warning means the definitions need another pass, not that the run
 * failed.
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
  MAX_TAGS_PER_EXCLUSIVE_AXIS,
  CONFUSABLE_STYLE_PAIRS,
  MEAN_TAGS_PER_PLANT_BASELINE,
  type StyleTag,
} from '../lib/style-tags'
import { withRunRecord, type Witness } from './run-provenance'
import {
  openReviewedMutation,
  asMutationDb,
  mergeReports,
  formatReport,
  type MutationReport,
} from './reviewed-mutation'

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
 * This pass may only write through a writer that REPORTS verdict retirement.
 *
 * WHY. `style_tags` is watched by `invalidate_editorial_verdict`, so every row
 * this pass re-tags loses its editorial sign-off — and the clear happens inside
 * the database, where a script that does not look cannot see it. That is trap
 * 31: on 2026-08-15 a repair re-tagged 86 rows, said "86 tagged", could not say
 * "86 un-curated", and nobody noticed for two days.
 *
 * IT COVERS EVERY WRITING RUN, NOT JUST `--all`. The obvious gate is the
 * catalog-wide one, since the vocabulary expansion ahead is 748 rows. But the
 * trap-31 incident WAS a scoped run, `--round 9` and `--round 10` — modest, and
 * exactly the shape a gate on `--all` would wave through. The size was never the
 * problem; the silence was.
 *
 * THIS USED TO BE A DATED BOOLEAN, `STYLE_WRITES_BLOCKED_UNTIL_STEP_C`, which
 * refused every writing run outright while the primitive did not exist. The
 * primitive exists now, so the check is conditional on the CAPABILITY instead:
 * it asserts that whatever writes here observes and reports retirement. Deleting
 * the check along with the flag would have left nothing standing between the
 * next writer and the same incident.
 */
function assertReportsRetirement(writer: {
  reportsVerdictRetirement: boolean
}): void {
  if (writer.reportsVerdictRetirement) return
  console.error(
    `\n✗ curate-styles will not write through a writer that cannot report\n` +
      `  verdict retirement.\n\n` +
      `  Re-tagging withdraws the editorial verdict on every row whose tags\n` +
      `  change, and the clear happens inside the database. Trap 31 is what\n` +
      `  the silence costs: 86 rows un-curated on 2026-08-15, unnoticed for\n` +
      `  two days.\n\n` +
      `  Use openReviewedMutation from scripts/reviewed-mutation.ts.\n`
  )
  process.exit(1)
}

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

  // The writer, and the gate that is now about it rather than about a date.
  // `retire` because a re-tag is exactly the judgment the `tags` criterion was
  // made about: the verdict SHOULD fall. Reporting it is the whole fix.
  const writer = openReviewedMutation({
    db: asMutationDb(db),
    table: 'plants',
    onCurated: 'retire',
    dryRun: DRY_RUN,
  })
  assertReportsRetirement(writer)

  const tagCounts = new Map<StyleTag, number>()
  // Per-plant judgments, kept for the calibration report below — a share is a
  // statement about the population, and the bar being checked is per plant.
  const judgments: { name: string; tags: StyleTag[] }[] = []
  let unchanged = 0
  let neutral = 0
  const failed: string[] = []
  const reports: MutationReport[] = []

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

        // Applied per row, not batched at the end: an interrupted run must have
        // written what it judged, and each row's `to` is only known once the
        // model has answered. `guardWrite` still runs, so the scope refusal
        // cannot be separated from the write it protects.
        reports.push(
          await writer.apply(
            [
              {
                id: guardWrite(plant),
                label: plant.scientific_name ?? plant.common_name,
                // The tags as read at fetch time. A row re-tagged by anything
                // else since then is drift and is skipped rather than clobbered
                // — a guard these 748 rows never had.
                from: { style_tags: plant.style_tags ?? null },
                to: { style_tags: tags },
                // Stamped in the SAME statement, and on an unchanged row too:
                // a stamp that lands on only some of the counted rows cannot
                // witness the run (trap 28).
                alsoWrite: { style_checked_at: new Date().toISOString() },
                why: 'blind re-judgment against the lib/style-tags definitions',
              },
            ],
            { wrote }
          )
        )
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

  // The retirement report — the sentence trap 31 was missing. Printed before
  // the distribution and calibration reports because it is the one that says a
  // paid editorial pass has to be re-run.
  console.log(
    '\n' +
      formatReport(mergeReports(reports), {
        dryRun: DRY_RUN,
        reJudgeWith: 'curate-editorial --ids <the ids above>',
      })
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

  // The bar counts tags per exclusive axis. TWO is legitimate — a peony anchors
  // both the cottage tradition and the classic one — and THREE is a judgment
  // that answered "which of these" with "all of them". See
  // MAX_TAGS_PER_EXCLUSIVE_AXIS for the bar, and for what did NOT change: a
  // tag still means SIGNATURE OF.
  const violations: string[] = []
  for (const axis of EXCLUSIVE_STYLE_AXES) {
    const members: StyleTag[] = STYLE_AXES[axis]
    const onAxis = (j: { tags: StyleTag[] }) =>
      j.tags.filter((t) => members.includes(t))
    const over = judgments.filter(
      (j) => onAxis(j).length > MAX_TAGS_PER_EXCLUSIVE_AXIS
    )
    // Two is reported without warning: it is the number worth watching for
    // drift even though it is allowed, and a count nobody prints is a count
    // nobody notices moving.
    const paired = judgments.filter((j) => onAxis(j).length === 2)
    console.log(
      `  two ${axis.padEnd(10)} tags   ${String(paired.length).padStart(3)} of ${judgments.length}   (allowed)`
    )
    console.log(
      `  3+  ${axis.padEnd(10)} tags   ${String(over.length).padStart(3)} of ${judgments.length}`
    )
    for (const d of over)
      violations.push(`${d.name}: [${onAxis(d).join(', ')}] (${axis})`)
  }

  if (violations.length) {
    console.log(
      `\nWARNING: ${violations.length} plant(s) carry more than ${MAX_TAGS_PER_EXCLUSIVE_AXIS} tags on one axis.`
    )
    console.log(
      'A plant may be the signature of two looks. Three means the judgment did not'
    )
    console.log('choose. Tighten those definitions in lib/style-tags.ts:')
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
