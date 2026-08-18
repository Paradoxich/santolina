/**
 * The common-name pass — trap 6, judged at the round instead of repaired after
 * it.
 *
 * WHICH RUNBOOK STEP RUNS THIS: step 1a, immediately after the seed and before
 * `curate-plants`, registered in `runbook.ts` and `round-status.ts`. WHAT ENDS
 * IT: nothing; every seed batch needs it, which is the finding that produced it.
 *
 * WHY IT EXISTS. `common_name` comes straight from Trefle, a botanical source,
 * and nothing between Trefle and the catalog has ever judged it. Trefle's names
 * land in three shapes a garden catalog cannot use:
 *
 *   1. NO NAME — `lib/trefle.ts` falls back to the scientific name, so the
 *      Explore card reads "Rodgersia pinnata" where every other card reads like
 *      something you could ask a nursery for. 6 of 28 in round 12, 18% in
 *      round 8.
 *   2. A NAME NOBODY USES — defensible in a flora and useless in a garden:
 *      "Cowflock" for the marsh marigold, "Premorse" for devil's-bit scabious.
 *   3. A COLLISION with a species already held. Round 8 got "Judastree" for
 *      Cercis canadensis, which is C. siliquastrum; round 11 got "Woodbine" for
 *      Parthenocissus quinquefolia, which the catalog already had as Lonicera
 *      periclymenum. `verify-round` FAILs on a duplicate common_name, by design.
 *
 * THE COST THIS REPLACES. `fix-round8-names.ts`, `fix-round11-names.ts` and
 * `fix-round12-names.ts` are three hand-written per-row correction tables in
 * three consecutive rounds; round 7 needed the same step before the pattern had
 * a name. The defect was upstream the whole time and was paid downstream, once
 * per round, by a person. Those scripts stay exactly as they are — they are the
 * record of what was corrected and when, and re-running them is a no-op.
 *
 * ONE CALL FOR THE WHOLE BATCH, WHICH IS NOT AN OPTIMISATION. Round 12's
 * collision was INTRA-batch: Trefle returned "Japanese iris" for both Iris
 * ensata and Iris laevigata, so the seed collided with itself. A per-plant call
 * cannot see that, because neither plant is in the catalog yet when the other
 * is judged. The batch is judged together and the model is told to make the
 * names distinct from each other as well as from the catalog.
 *
 * IT STAMPS EVERY ROW IT READS, NOT EVERY ROW IT CHANGES. A kept name is a
 * judgement — "a pass looked at this and it is a good garden name" — and it is
 * the judgement that has been missing, since `common_name` is never null and a
 * good name and an unexamined one are the same value. Stamping only the changed
 * rows would also be trap 28: a stamp on a subset of the counted rows cannot
 * corroborate the run.
 *
 * WHAT IT WILL NOT DO. It does not touch hyphenation or dialect preference —
 * "Creeping-jenny", "Hemp-agrimony" and "Przewalski's leopardplant" are
 * USDA-style compounds that read stiffly and are not wrong. That is taste, and
 * taste is the editorial voice pass. It does not flip `is_curated`, and it does not
 * write to a curated row at all (`onCurated: 'skip'`) — a finalised name is
 * frozen, not overruled.
 *
 * Usage (from apps/web) — a scope flag is mandatory, see scripts/scope.ts.
 * Dry run is the default; nothing writes without --apply:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-common-names.ts --round 13
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-common-names.ts --round 13 --apply
 *   ... --ids <a,b,c>   |   ... --all --why "<reason>"
 *   ... --limit <n>     smoke-test a few rows before buying the batch
 */

import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import { fetchAllRows } from '../lib/paginate'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { findCollisions, type HeldName } from './name-fixes'
import {
  asMutationDb,
  formatReport,
  openReviewedMutation,
  type MutationIntent,
} from './reviewed-mutation'
import { withRunRecord, type Witness } from './run-provenance'
import {
  describeScope,
  requireReasonForAll,
  requireScope,
  scopeGuard,
  scopeIds,
} from './scope'

const MAX_TOKENS = 4000

const SYSTEM_PROMPT =
  'You are a horticultural editor for a garden plant catalog. Respond with ONLY valid JSON, no markdown, no code fences, no preamble, no explanation.'

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  plant_type: string | null
  description: string | null
  common_name_checked_at: string | null
}

/** One row's judgement, as the model returns it. */
export interface NameVerdict {
  scientific_name: string
  /** `keep` means the stored name is already a good garden name. */
  verdict: 'keep' | 'rename'
  /** Present on `rename`. */
  to?: string
  why: string
}

// ---------------------------------------------------------------------------
// The judgement, as pure functions — the parts worth testing without a network
// ---------------------------------------------------------------------------

/**
 * Is the stored name just the scientific name wearing a hat?
 *
 * `lib/trefle.ts` does `detail.common_name ?? detail.scientific_name`, so a
 * species Trefle has no English name for arrives with its binomial in the
 * common-name column. Detected rather than trusted to the model, because it is
 * the one defect that is decidable without judgement — and it is the one that
 * shows most plainly on an Explore card.
 */
export function isBinomialFallback(row: {
  common_name: string
  scientific_name: string | null
}): boolean {
  if (!row.scientific_name) return false
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return norm(row.common_name) === norm(row.scientific_name)
}

/**
 * Renames that collide with each other INSIDE the batch.
 *
 * `findCollisions` in name-fixes.ts asks the catalog, which cannot answer this:
 * during a round the batch's own rows are the ones that do not exist yet. Round
 * 12 hit exactly this with "Japanese iris" for two different irises.
 */
export function intraBatchCollisions(
  verdicts: readonly NameVerdict[]
): Map<string, string[]> {
  const byName = new Map<string, string[]>()
  for (const v of verdicts) {
    if (v.verdict !== 'rename' || !v.to) continue
    const key = v.to.trim().toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), v.scientific_name])
  }
  return new Map([...byName].filter(([, holders]) => holders.length > 1))
}

export function buildPrompt(rows: PlantRow[], heldNames: string[]): string {
  const batch = rows.map((r) => ({
    scientific_name: r.scientific_name,
    current_common_name: r.common_name,
    looks_like_the_binomial: isBinomialFallback(r),
    plant_type: r.plant_type,
    description: r.description?.slice(0, 200) ?? null,
  }))

  return `These plants were just added to a GARDEN catalog. Their common names came from Trefle, a botanical database, so some are missing, some are flora names nobody uses, and some belong to a different plant.

For each, decide whether the stored common name is a good name for a garden catalog.

A GOOD name is the one a gardener would use and a nursery would sell it under. "Marsh marigold", "cup plant", "Siberian iris".

A BAD name is:
- the scientific name itself (looks_like_the_binomial is true) — Trefle had no English name
- a flora or herbal name nobody uses today ("Cowflock", "Premorse", "Adder-wort")
- a name that means a DIFFERENT plant ("Woodbine" is Lonicera periclymenum; "Needle grass" is Stipa)
- the food-crop name for a plant grown as an ornamental
- ambiguous without a qualifier: a bare genus-level name where the catalog could hold siblings

Rules for a replacement:
- It must be DISTINCT from every name already held, listed below.
- It must be DISTINCT from every other replacement you propose in this batch. Two plants in one batch cannot share a name.
- Prefer the most-used name over the most correct one.
- Do NOT change hyphenation, capitalisation or dialect for their own sake. "Creeping-jenny" and "Hemp-agrimony" are fine. If the only thing you would change is style, answer keep.
- When a qualifier is needed to disambiguate, add the smallest one that works ("Water forget-me-not", not "Blue water forget-me-not").

Names already held by this catalog (do not reuse any of these):
${heldNames.join(', ')}

The batch:
${JSON.stringify(batch, null, 2)}

Respond with a JSON array, one object per plant, in the same order:
[{"scientific_name": "...", "verdict": "keep" | "rename", "to": "...", "why": "one short clause"}]
Include "to" only when verdict is "rename".

"why" is read later by a person deciding whether the change was right, so give the horticultural reason, not the input that flagged it. Never restate a field name from the batch above.
  bad:  "looks_like_the_binomial is true"
  good: "Trefle had no English name; this is what nurseries sell it as"
  good: "bare genus name, and the catalog also holds L. stoechas"
  good: "Cowflock is a flora name nobody uses for it"`
}

export function parseVerdicts(raw: string): NameVerdict[] {
  const text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  const parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed))
    throw new Error('expected a JSON array of verdicts')

  return parsed.map((entry, i) => {
    const e = entry as Record<string, unknown>
    const sci = e['scientific_name']
    const verdict = e['verdict']
    if (typeof sci !== 'string' || !sci.trim())
      throw new Error(`verdict ${i}: missing scientific_name`)
    if (verdict !== 'keep' && verdict !== 'rename')
      throw new Error(`verdict ${i} (${sci}): verdict must be keep or rename`)
    const to = e['to']
    if (verdict === 'rename' && (typeof to !== 'string' || !to.trim()))
      throw new Error(`verdict ${i} (${sci}): rename with no "to"`)
    return {
      scientific_name: sci,
      verdict,
      ...(verdict === 'rename' ? { to: (to as string).trim() } : {}),
      why: typeof e['why'] === 'string' ? e['why'] : '',
    }
  })
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Read at CALL time, not at import time.
 *
 * `requireScope` exits the process when no scope flag is present, so reading it
 * at module scope makes importing this file for its pure functions kill the
 * test run — which is exactly what it did the first time. The same reason
 * `trap-pins.ts` keeps its one impure function behind a call.
 */
function readFlags() {
  const args = process.argv.slice(2)
  const limitIdx = args.indexOf('--limit')
  const scope = requireScope(
    'curate-common-names',
    'This pass bills Claude and OVERWRITES common_name, which is what Explore cards and search show. An unscoped run would re-judge every plant in the catalog.'
  )
  const scopedIds = scopeIds(scope)
  return {
    apply: args.includes('--apply'),
    limit: limitIdx >= 0 ? Number(args[limitIdx + 1]) : null,
    scope,
    scopedIds,
    whyAll: requireReasonForAll(scope),
    guardScope: scopeGuard(scope, scopedIds),
  }
}

async function main() {
  const {
    apply: APPLY,
    limit: LIMIT,
    scope: SCOPE,
    scopedIds: SCOPE_IDS,
    whyAll: WHY_ALL,
    guardScope,
  } = readFlags()
  const db = getSupabaseAdmin()

  const all = await fetchAllRows<PlantRow & HeldName>((from, to) =>
    db
      .from('plants')
      .select(
        'id, common_name, scientific_name, plant_type, description, common_name_checked_at'
      )
      .order('id')
      .range(from, to)
  )

  let selected = SCOPE_IDS
    ? all.filter((p) => SCOPE_IDS.includes(p.id))
    : [...all]
  if (LIMIT !== null) selected = selected.slice(0, LIMIT)
  for (const p of selected) guardScope(p.id, p.scientific_name ?? p.id)

  if (WHY_ALL) console.log(`\nScope: --all — ${WHY_ALL}`)
  console.log(
    `\n${selected.length} plant(s) to judge of ${all.length} in the catalog.` +
      (APPLY ? '\n' : ' DRY RUN — pass --apply to write.\n')
  )
  if (!selected.length) return

  // Every name the catalog holds EXCEPT the ones being judged: a row may keep
  // its own name, and listing it as taken would make the model rename it to
  // avoid itself.
  const judging = new Set(selected.map((p) => p.id))
  const heldNames = all
    .filter((p) => !judging.has(p.id) && p.common_name)
    .map((p) => p.common_name)

  // Wrapped so the call can be made inside the run record: the token meter is
  // windowed from the moment the run opens.
  const judge = async (): Promise<MutationIntent[]> => {
    const client = getAnthropicClient()
    const prompt = buildPrompt(selected, heldNames)
    const response = await client.messages.create({
      model: CURATION_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })
    const block = response.content[0]
    if (!block || block.type !== 'text')
      throw new Error('Claude returned no text block')
    const verdicts = parseVerdicts(block.text)

    // --- refusals, before anything is written -------------------------------
    const bySci = new Map(
      selected
        .filter((p) => p.scientific_name)
        .map((p) => [p.scientific_name!, p])
    )

    const intra = intraBatchCollisions(verdicts)
    for (const [name, holders] of intra)
      console.log(
        `  ✗   REFUSED "${name}" — proposed for ${holders.join(' and ')}`
      )

    const renames = verdicts.filter(
      (v) =>
        v.verdict === 'rename' && v.to && !intra.has(v.to.trim().toLowerCase())
    )
    const blocked = findCollisions(
      renames.map((v) => ({
        scientific_name: v.scientific_name,
        from: bySci.get(v.scientific_name)?.common_name ?? '',
        to: v.to!,
        why: v.why,
      })),
      all
    )
    for (const [sci, holders] of blocked)
      console.log(
        `  ✗   REFUSED "${renames.find((v) => v.scientific_name === sci)?.to}" for ${sci} — already held by ${holders.join(', ')}`
      )

    // --- intents ------------------------------------------------------------
    const now = new Date().toISOString()
    const intents: MutationIntent[] = []
    let kept = 0
    let renamed = 0

    for (const v of verdicts) {
      const row = bySci.get(v.scientific_name)
      if (!row) {
        console.log(`  ⚠   ${v.scientific_name} — not in this batch, ignored`)
        continue
      }
      const refused =
        blocked.has(v.scientific_name) ||
        (v.to ? intra.has(v.to.trim().toLowerCase()) : false)
      const rename = v.verdict === 'rename' && !refused

      if (rename) renamed++
      else kept++

      console.log(
        rename
          ? `  ✎   ${row.scientific_name}: "${row.common_name}" → "${v.to}" (${v.why})`
          : `  ·   ${row.scientific_name}: keeps "${row.common_name}"`
      )

      intents.push({
        id: row.id,
        label: row.scientific_name ?? row.common_name,
        // The drift guard reads the value the decision was made about. A kept
        // row writes no value column at all, only the stamp.
        from: rename ? { common_name: row.common_name } : {},
        to: rename ? { common_name: v.to! } : {},
        // The stamp goes in the SAME statement, and lands on a KEPT row too —
        // trap 28: a stamp on only the changed rows could not corroborate a run
        // that counted all of them. A kept row writes nothing but the stamp.
        alsoWrite: { common_name_checked_at: now },
        why: rename
          ? v.why || 'not a name a garden catalog can use'
          : 'judged and kept',
      })
    }

    console.log(
      `\n${renamed} rename(s), ${kept} kept, ${blocked.size + intra.size} refused.`
    )

    return intents
  }

  // A dry run makes the same paid call and opens no record, so its tokens are
  // not in runs:cost.
  if (!APPLY) {
    await judge()
    return
  }

  const writer = openReviewedMutation({
    db: asMutationDb(db),
    table: 'plants',
    // A name correction is mechanical, not editorial voice, so a curated row is
    // skipped rather than overruled — same rule as name-fixes.ts.
    onCurated: 'skip',
    dryRun: false,
  })

  const runOptions = {
    step: 'curate-common-names',
    writeSet: ['common_name', 'common_name_checked_at'],
    evidence: [
      // The stamp witnesses itself: this pass SETS it on every row it judged
      // and never clears it, and every counted row gets it — so it is not the
      // trap-28 subset shape. common_name is a value column and cannot be
      // compared to an instant, so it needs its own witness or beginRun throws.
      {
        kind: 'stamp',
        covers: 'common_name_checked_at',
        column: 'common_name_checked_at',
      },
      {
        kind: 'row-touched',
        covers: 'common_name',
        table: 'plants',
        column: 'updated_at',
      },
    ] as Witness[],
    scope: describeScope(SCOPE, SCOPE_IDS),
    recipe: {
      model: CURATION_MODEL,
      template: buildPrompt(selected.slice(0, 1), ['<held names>']),
      ingredients: {},
      decoding: { max_tokens: MAX_TOKENS },
    },
  }

  await withRunRecord(runOptions, async (run) => {
    const intents = await judge()
    const report = await writer.apply(intents, run)
    console.log(formatReport(report))
  })
}

// Guarded so the test file can import the pure seams without running the pass
// — same pattern as curate-plants.ts and pick-plant-images.ts.
if (require.main === module) {
  main().catch((err) => {
    console.error(`\n✗ ${(err as Error).message}`)
    process.exitCode = 1
  })
}
