/**
 * Re-judge `sun_tolerates` on rows that record no tolerance at all.
 *
 * A repair pass, not a runbook step: new seeds get both sun fields from
 * `curate-plants`. Reasoning, measured rates and what is left open:
 * docs/curation.md#sun-model.
 *
 * Dry run by default. Pass --apply to write.
 *
 * Usage (from apps/web) — a scope flag is mandatory, see scripts/scope.ts:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-sun-tolerance.ts --all --why "<reason>" --limit 3
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-sun-tolerance.ts --all --why "<reason>" --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-sun-tolerance.ts --ids <a,b,c> --apply
 *
 *   --limit N   judge at most N rows.
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

/** The batch prompt. States that `[]` is a valid answer, and passes `thrives`
 * so the model can keep its answer disjoint from it. */
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

/** Parse the model's answer, dropping values outside the vocabulary. */
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

/** The tolerance to write: the verdict minus any thriving exposure, which
 * `verify-round` requires to be disjoint. */
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

  // State predicate, narrowing within the scope.
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
    onCurated: 'skip',
    dryRun: false,
  })

  const runOptions = {
    step: 'curate-sun-tolerance',
    writeSet: ['sun_tolerates'],
    // A value column: updated_at bounds the claim.
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
