/**
 * Re-judge `sun_tolerates` on rows that record no tolerance at all.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none. It is a REPAIR pass, the same class as
 * `curate-styles` and `curate-greenery` — new seeds get both sun fields from
 * `curate-plants` in one call, so a round does not owe this. WHAT ENDS IT: the
 * day no row in the catalog thrives in one exposure and tolerates nothing.
 *
 * THE PROBLEM, AND IT IS NOT A MISSING VALUE. Every row has been asked: all 780
 * carry a non-empty `sun_thrives`, and the pair is drafted in the same call. So
 * `sun_tolerates = []` is an ANSWER — "performs only in its thriving range" —
 * and 175 rows carry it (measured 2026-08-18). `curate-plants --only` cannot
 * reach them at all, because it selects `.is(field, null)` and these are `[]`.
 *
 * WHAT MAKES 51 OF THEM SUSPECT RATHER THAN ALL 175. With a three-value
 * vocabulary, a plant that thrives in TWO exposures has one value left, so `[]`
 * is a mild claim: 73 rows thriving in partial sun and shade are saying "never
 * full sun", which is true of most woodland plants, and 51 thriving in full sun
 * and partial sun are saying "not shade", equally ordinary. The sharp class is
 * the 51 that thrive in FULL SUN ALONE and tolerate nothing — "thrives in full
 * sun, tolerates nothing" is almost never true of a real plant, and an empty
 * tolerance makes one read as fussier than it is, which is the expensive
 * direction to be wrong in for a beginner (Ana, 2026-08-18).
 *
 * All 175 are judged anyway, and the reason is that this is a re-judgement, not
 * a widening: the model is asked what the species actually tolerates and is
 * told plainly that `[]` is a legitimate answer. A woodland plant that keeps
 * `[]` is the pass working, not failing.
 *
 * WHAT THE FIRST FULL RUN ACTUALLY FOUND (2026-08-18), because the paragraph
 * above is the expectation and this is the outcome: 81 of 175 widened (46%),
 * 75 written, 6 frozen as `is_curated`, and 94 kept `[]`. So an empty tolerance
 * is right more often than "almost never true of a real plant" suggests —
 * lavender, rosemary and cistus do not take shade, and woodland species do not
 * take full sun. **A 25-row sample predicted 16%**, a third of the real rate,
 * because the first rows by id happened to be Mediterranean and woodland: the
 * predicate correlated with id order, which sampling by the predicate does not
 * protect against.
 *
 * ⚠ A ROW THAT KEEPS `[]` IS SELECTED AGAIN NEXT RUN. There is no
 * `sun_checked_at`, so "judged and kept empty" and "never judged" are the same
 * value — trap 26's family, and the third instance this session after
 * `style_tags` and `foliage_color`. Not closed here because the sun model's
 * standing ruling is "add no schema" (Ana, 2026-08-18) and a stamp is a
 * migration; the pass is cheap enough (7 calls, ~$0.19 for all 175, measured)
 * that re-judging is affordable, and `--ids` narrows a repeat run. If this becomes routine,
 * the stamp is the fix, exactly as it was for foliage_color.
 *
 * DRY RUN BY DEFAULT (house discipline). Pass --apply to write.
 *
 * Usage (from apps/web) — a scope flag is mandatory, see scripts/scope.ts:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-sun-tolerance.ts --all --why "<reason>" --limit 3
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-sun-tolerance.ts --all --why "<reason>" --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-sun-tolerance.ts --ids <a,b,c> --apply
 *
 *   --limit N   judge at most N rows. Smoke-test the prompt before the batch.
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import {
  requireScope,
  scopeIds,
  applyScope,
  describeScope,
  requireReasonForAll,
  flagValue,
} from './scope'
import {
  asMutationDb,
  openReviewedMutation,
  formatReport,
  type MutationIntent,
} from './reviewed-mutation'
import { withRunRecord, type Witness } from './run-provenance'

const SUN_VALUES = ['full_sun', 'partial_sun', 'shade'] as const
type Sun = (typeof SUN_VALUES)[number]

/** Judged in batches: one call for 25 plants, the curate-common-names shape. */
const BATCH_SIZE = 25
const MAX_TOKENS = 4096

const SYSTEM_PROMPT =
  'You are a horticultural data assistant. Respond with ONLY valid JSON, no markdown, no code fences, no preamble.'

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  plant_type: string | null
  native_to: string | null
  light_needs: string | null
  sun_thrives: Sun[]
  sun_tolerates: Sun[]
}

interface Verdict {
  scientific_name: string
  tolerates: Sun[]
  why: string
}

/**
 * The prompt, and the two things it is careful about.
 *
 * It states that `[]` is a real answer, because a prompt that only ever asks
 * "what else does it tolerate?" gets a tolerance for everything — the pass
 * would then widen 175 rows and mean nothing by it. And it gives the stored
 * `thrives` values, because tolerance is defined against them: the answer must
 * be disjoint, which is an invariant `verify-round` enforces (FAIL) rather than
 * a preference.
 */
export function buildPrompt(plants: PlantRow[]): string {
  const rows = plants.map((p) => ({
    scientific_name: p.scientific_name,
    common_name: p.common_name,
    plant_type: p.plant_type,
    native_to: p.native_to,
    light_needs: p.light_needs,
    thrives_in: p.sun_thrives,
  }))

  return `For each plant below, decide which sun exposures it TOLERATES — grows acceptably in, without being at its best.

Plants:
${JSON.stringify(rows, null, 2)}

Rules:
- Values are exactly ${JSON.stringify(SUN_VALUES)}.
- "tolerates" must be DISJOINT from the plant's "thrives_in". Never repeat a thriving exposure.
- [] IS A CORRECT AND EXPECTED ANSWER. Many woodland species genuinely scorch in full sun, and many Mediterranean species genuinely fail in shade. Do not invent a tolerance to fill the field.
- Judge the base species, not cultivars, and judge for a temperate European garden.
- Consider the plant's native habitat: an understorey species tolerates less sun than a plant of open ground.

Return JSON: {"verdicts":[{"scientific_name":"...","tolerates":["..."],"why":"<8 words or fewer>"}]}
One entry per plant, using the scientific_name exactly as given.`
}

/** Parse and harden the model's answer. Exported: the seam a test can call. */
export function parseVerdicts(text: string): Verdict[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
  const parsed = JSON.parse(cleaned) as { verdicts?: unknown }
  if (!Array.isArray(parsed.verdicts))
    throw new Error('response has no verdicts array')

  return parsed.verdicts.flatMap((raw) => {
    const v = raw as Partial<Verdict>
    if (!v.scientific_name || !Array.isArray(v.tolerates)) return []
    // Unknown values are DROPPED rather than failing the batch: one invented
    // string should not cost 24 good verdicts. Anything dropped shows up as a
    // narrower tolerance, which is the safe direction.
    const tolerates = v.tolerates.filter((t): t is Sun =>
      (SUN_VALUES as readonly string[]).includes(t)
    )
    return [
      {
        scientific_name: v.scientific_name,
        tolerates: [...new Set(tolerates)],
        why: v.why ?? '',
      },
    ]
  })
}

/**
 * The verdict as it will be written, with the invariant enforced HERE rather
 * than hoped for in the prompt.
 *
 * `sun_thrives` and `sun_tolerates` must be disjoint — `verify-round` FAILs on
 * an overlap, so a model that repeats a thriving exposure would turn a helpful
 * pass into a red catalog. Subtracting is right rather than rejecting: the
 * model's intent ("also copes with partial sun") survives, and only the
 * duplicate is dropped.
 *
 * Exported and pure, because this is the line that decides what lands in the
 * database.
 */
export function tolerancePatch(
  row: Pick<PlantRow, 'sun_thrives'>,
  verdict: Sun[]
): Sun[] {
  const thrives = new Set(row.sun_thrives)
  return verdict.filter((t) => !thrives.has(t))
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const limitRaw = flagValue('--limit')
  const limit = limitRaw ? Number(limitRaw) : null
  if (limit !== null && (!Number.isFinite(limit) || limit < 1))
    throw new Error('--limit needs a positive number')

  const scope = requireScope(
    'curate-sun-tolerance',
    'It rewrites a field the Explore sun filter reads. An unscoped run would ' +
      'reach into finished rounds.'
  )
  const scopeIdList = scopeIds(scope)
  const whyAll = requireReasonForAll(scope)
  const db = getSupabaseAdmin()

  // Never a bare .select() — Supabase caps unpaginated reads at 1000 rows.
  const all = await fetchAllRows<PlantRow>((from, to) =>
    applyScope(
      db
        .from('plants')
        .select(
          'id, common_name, scientific_name, plant_type, native_to, light_needs, sun_thrives, sun_tolerates'
        ),
      scopeIdList
    )
      .order('id')
      .range(from, to)
  )

  console.log(`${describeScope(scope, scopeIdList)} — ${all.length} row(s).`)
  if (whyAll) console.log(`Whole-catalog run, because: ${whyAll}`)

  // The state predicate, narrowing WITHIN the scope: rows recording no
  // tolerance. A row with a tolerance has been answered and is left alone.
  let selected = all.filter(
    (p) => !p.sun_tolerates?.length && p.scientific_name
  )
  if (limit !== null) selected = selected.slice(0, limit)

  const sharp = selected.filter(
    (p) => p.sun_thrives?.length === 1 && p.sun_thrives[0] === 'full_sun'
  ).length
  console.log(
    `\n${selected.length} row(s) record no tolerance — ${sharp} of them thrive in full sun ALONE, ` +
      `which is the shape that reads as fussier than the plant is.`
  )
  if (!selected.length) return

  const byName = new Map(
    selected
      .filter((p) => p.scientific_name)
      .map((p) => [p.scientific_name!, p])
  )

  const judge = async (): Promise<MutationIntent[]> => {
    const client = getAnthropicClient()
    const intents: MutationIntent[] = []
    let widened = 0
    let kept = 0

    for (let i = 0; i < selected.length; i += BATCH_SIZE) {
      const batch = selected.slice(i, i + BATCH_SIZE)
      console.log(
        `\n  batch ${Math.floor(i / BATCH_SIZE) + 1} — ${batch.length} plant(s)`
      )
      const response = await client.messages.create({
        model: CURATION_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPrompt(batch) }],
      })
      const block = response.content[0]
      if (!block || block.type !== 'text')
        throw new Error('Claude returned no text block')

      for (const v of parseVerdicts(block.text)) {
        const row = byName.get(v.scientific_name)
        if (!row) {
          console.log(
            `    ⚠  ${v.scientific_name} — not in this batch, ignored`
          )
          continue
        }
        const tolerates = tolerancePatch(row, v.tolerates)
        if (!tolerates.length) {
          kept++
          console.log(`    ·  ${row.common_name}: stays [] (${v.why})`)
          continue
        }
        widened++
        console.log(
          `    ✎  ${row.common_name}: [] → ${JSON.stringify(tolerates)} (${v.why})`
        )
        intents.push({
          id: row.id,
          label: row.scientific_name ?? row.common_name,
          from: { sun_tolerates: row.sun_tolerates ?? [] },
          to: { sun_tolerates: tolerates },
          why: v.why || 'tolerance re-judged against the species habitat',
        })
      }
    }

    console.log(`\n${widened} widened, ${kept} keep an empty tolerance.`)
    return intents
  }

  if (!apply) {
    await judge()
    console.log('\nDRY RUN — nothing written. Re-run with --apply.')
    return
  }

  const writer = openReviewedMutation({
    db: asMutationDb(db),
    table: 'plants',
    // sun_tolerates is NOT watched by invalidate_editorial_verdict (migration
    // 20260729101133 watches description, style_tags, space_types and the two
    // image columns), so a write here retires no verdict. `skip` regardless:
    // 8 of the selected rows are signed off, and a re-judgement of a field the
    // reviewer saw is not a correction that should overrule them.
    onCurated: 'skip',
    dryRun: false,
  })

  const runOptions = {
    step: 'curate-sun-tolerance',
    writeSet: ['sun_tolerates'],
    // A value column, so it cannot be compared to an instant. No stamp exists
    // for this pass (see the header), so updated_at bounds the claim.
    evidence: [
      {
        kind: 'row-touched' as const,
        covers: 'sun_tolerates',
        table: 'plants' as const,
        column: 'updated_at',
      },
    ] as Witness[],
    scope: `${describeScope(scope, scopeIdList)} — ${selected.length} row(s) with no tolerance`,
    recipe: {
      model: CURATION_MODEL,
      template: buildPrompt(selected.slice(0, 1)),
      ingredients: {},
      decoding: { max_tokens: MAX_TOKENS },
    },
  }

  await withRunRecord(runOptions, async (run) => {
    // Inside the record, so the tokens are counted — trap 37.
    const intents = await judge()
    if (!intents.length) {
      console.log('\nNo row earned a widening.')
      return
    }
    const report = await writer.apply(intents, run)
    console.log(formatReport(report))
  })
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n✗ ${(err as Error).message}`)
    process.exitCode = 1
  })
}
