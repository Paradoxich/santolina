/**
 * Round-12 tag corrections — the two `tags:` blockers the editorial pass held.
 *
 * WHICH STEP RUNS THIS, AND WHAT ENDS IT. It runs once, after runbook step 7b
 * (`curate-editorial`) raised these two, and before `curate-editorial` is
 * re-run so the corrected rows can be re-judged. What ends it is round 12
 * closing; it is scoped to two rows by scientific name and is a no-op after.
 *
 * WHY THESE TWO AND NOT THE OTHER FIVE HOLDS. A held IMAGE waits on a
 * photograph nobody has, so it is a recorded verdict. A held TAG means the
 * catalog is WRONG RIGHT NOW and a reader can see it
 * (docs/curation.md#round-runbook). Only the tag holds are defects; the five
 * image holds stay recorded.
 *
 *   1. JUNCUS EFFUSUS — `plant_type_label` read "Ornamental grass" for a
 *      plant that is a rush. Its `plant_type` stays `grass`, and that is the
 *      DOCUMENTED split rather than a judgement made here:
 *      docs/architecture.md#plant-type-label says
 *      `plant_type` is "a gardener-facing 'what kind of plant is this' label —
 *      how you buy, place, and care for it — not a botanical growth-form
 *      classification", and that "the descriptive `plant_type_label` may carry
 *      the nuance". Eleven non-Poaceae rows depend on `grass` to reach the
 *      Explore grass shelf. The label is the sentence on the page and has to
 *      be true. The catalog already draws this line where the drafter happened
 *      to get it right: Carex buchananii, elata and muskingumensis read
 *      "Ornamental sedge" and Luzula nivea reads "Evergreen perennial rush",
 *      all while typed `grass`.
 *
 *      Same ruling explains why `cross-check-plants` flagging `plant_type` on
 *      this row and on Carex elata was correctly DISMISSED: that is the round-4
 *      false-positive class, where a blind second pass applies stricter botany
 *      than the product wants. The flag next door was right and this one was
 *      not, which is the whole reason both had to be read rather than batched.
 *   2. MYOSOTIS SCORPIOIDES — `bloom_color` carried both `blue` and `yellow`.
 *      The flower is blue with a yellow eye. A detail inside a bloom is not a
 *      bloom colour, and leaving it in puts a forget-me-not on the Yellow
 *      shelf in Explore, where nobody looking for a yellow flower wants it.
 *      Same class as the ignore rules in `lib/bloom-colors.ts` for
 *      underside-only and plain-green-plus-a-detail values.
 *
 * THREE OLDER ROWS CARRY THE SAME DEFECT AND ARE FIXED HERE TOO. Carex comans and Carex testacea read "ornamental grass", Luzula
 * sylvatica reads "Evergreen perennial grass" — found by the same query that
 * caught the Juncus row, and wrong for the same reason. They belong to earlier
 * rounds, so `check-round-scope` reports them as out-of-scope writes for round
 * 12; that is correct and they are waived BY NAME in `rounds/12/scope-allow.json`
 * rather than hidden. The check's own header says it: "an editorial fix to an
 * older row during a round is a real thing to do... the answer to a legitimate
 * one is to write down why rather than to stop running the check."
 *
 * The alternative was a Build Backlog row, and it was rejected for the reason
 * standing rule 14 gives — a mechanical item parked in a document is invisible
 * the day it stops being true, and nothing was watching these three: not
 * `invariants:check` (it scans source, not data), not `verify-round` (it only
 * reads the round's own rows).
 *
 * NOT TOUCHED: Luzula nivea already reads "Evergreen perennial rush" and is
 * `is_curated = true` — frozen, and correct enough. Its wording differs from
 * the "wood-rush" used below; a curated row is not re-worded by a mechanical
 * pass.
 *
 * SAFETY — no longer hand-rolled. `openReviewedMutation` owns all four of the
 * properties this script used to spell out for itself, and owns them the same
 * way for every caller (scripts/reviewed-mutation.ts):
 *   - Every entry carries the value it EXPECTS to find; a drifted row is
 *     skipped and reported, never overwritten.
 *   - `onCurated: 'skip'` — a mechanical label fix does not overrule a human
 *     sign-off, so an `is_curated` row is frozen and reported.
 *   - Idempotent: a row already holding the target value is a `noop`.
 *   - The primitive reads `is_curated` back for the rows it wrote, so a verdict
 *     this pass retires is REPORTED rather than lost silently (trap 31).
 *
 * IT NOW TAKES IDS, AND THE NAMES ARE RESOLVED FIRST. The decisions below are
 * still authored against `scientific_name`, because that is what a person
 * reading a held tag has in front of them — but a name is a value and values
 * drift, so it is resolved to an id in one query up front and the guarded write
 * is keyed on the id. A name that resolves to nothing is reported and skipped;
 * a name that resolves to more than one row is a hard error, because "which of
 * these two did I mean" is not a question a mutation may answer by guessing.
 *
 * WHAT ITS RUN RECORD CLAIMS. `plant_type_label` and `bloom_color` are value
 * columns and this pass writes no stamp, so neither can witness itself: both
 * are covered by `plants.updated_at`, which BOUNDS the claim rather than
 * corroborating it (docs/write-provenance.md). That is the honest ceiling for a
 * write that leaves no certification behind, and inventing a stamp for it would
 * be manufacturing evidence rather than recording it.
 *
 * Usage (from apps/web) — dry run is the default:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round12-tags.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round12-tags.ts --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { withRunRecord, type Witness } from './run-provenance'
import {
  openReviewedMutation,
  asMutationDb,
  formatReport,
  type MutationIntent,
} from './reviewed-mutation'

interface Fix {
  scientific_name: string
  column: 'plant_type_label' | 'bloom_color'
  from: string // JSON for arrays, so the drift guard reads the same either way
  to: string
  why: string
}

const FIXES: Fix[] = [
  {
    scientific_name: 'Juncus effusus',
    column: 'plant_type_label',
    from: '"Ornamental grass"',
    to: '"Ornamental rush"',
    why: 'a rush, not a grass; plant_type stays `grass` for the filter bucket',
  },
  {
    scientific_name: 'Myosotis scorpioides',
    column: 'bloom_color',
    from: '["blue","yellow"]',
    to: '["blue"]',
    why: 'blue with a yellow eye; the eye is a detail, not a bloom colour',
  },
  // --- earlier rounds' rows, same defect. Waived by name in scope-allow.json.
  {
    scientific_name: 'Carex comans',
    column: 'plant_type_label',
    from: '"Ornamental grass"',
    to: '"Ornamental sedge"',
    why: 'a sedge; matches Carex buchananii, elata and muskingumensis',
  },
  {
    scientific_name: 'Carex testacea',
    column: 'plant_type_label',
    from: '"Evergreen ornamental grass"',
    to: '"Evergreen ornamental sedge"',
    why: 'a sedge; keeps its own evergreen wording, changes only the noun',
  },
  {
    scientific_name: 'Luzula sylvatica',
    column: 'plant_type_label',
    from: '"Evergreen perennial grass"',
    to: '"Evergreen perennial wood-rush"',
    why: 'Luzula is a wood-rush (Juncaceae), not a grass',
  },
]

/**
 * Resolve each decision's `scientific_name` to the id the write is keyed on.
 *
 * One query, not one per fix. A name matching two rows throws rather than
 * picking: the catalog has carried duplicate binomials before (the Hydrangea
 * pair), and a mutation that guesses which of them a hand-written decision meant
 * is worse than one that stops.
 */
async function resolveIds(
  db: ReturnType<typeof getSupabaseAdmin>
): Promise<Map<string, string>> {
  const names = [...new Set(FIXES.map((f) => f.scientific_name))]
  const { data, error } = await db
    .from('plants')
    .select('id, scientific_name')
    .in('scientific_name', names)
  if (error) throw new Error(`resolving names: ${error.message}`)

  const byName = new Map<string, string>()
  for (const row of data ?? []) {
    const name = row.scientific_name as string
    if (byName.has(name))
      throw new Error(
        `${name} matches more than one catalog row. These decisions are keyed ` +
          `by name and cannot say which was meant — resolve the duplicate first.`
      )
    byName.set(name, row.id as string)
  }
  return byName
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const db = getSupabaseAdmin()

  console.log(
    `\n${FIXES.length} tag fixes.` +
      (apply ? '\n' : ' DRY RUN — pass --apply to write.\n')
  )

  const byName = await resolveIds(db)
  const intents: MutationIntent[] = []
  const unresolved: string[] = []

  for (const fix of FIXES) {
    const id = byName.get(fix.scientific_name)
    if (!id) {
      unresolved.push(fix.scientific_name)
      console.log(`  ??  ${fix.scientific_name} — no such row`)
      continue
    }
    intents.push({
      id,
      label: fix.scientific_name,
      from: { [fix.column]: JSON.parse(fix.from) },
      to: { [fix.column]: JSON.parse(fix.to) },
      why: fix.why,
    })
  }

  const writer = openReviewedMutation({
    db: asMutationDb(db),
    table: 'plants',
    // Both columns, so one read covers the two-column decision set rather than
    // the union happening to be right.
    guardedColumns: ['plant_type_label', 'bloom_color'],
    // A mechanical label correction does not overrule a human sign-off.
    onCurated: 'skip',
    dryRun: !apply,
  })

  const runOptions = {
    step: 'fix-round12-tags',
    writeSet: ['plant_type_label', 'bloom_color'],
    // Neither is a stamp, so neither can witness itself. `updated_at` sees any
    // write to the row by anyone, so it bounds this claim and cannot confirm it.
    evidence: [
      {
        kind: 'row-touched',
        covers: 'plant_type_label',
        table: 'plants',
        column: 'updated_at',
      },
      {
        kind: 'row-touched',
        covers: 'bloom_color',
        table: 'plants',
        column: 'updated_at',
      },
    ] as Witness[],
    scope: `${intents.length} hand-authored tag decision(s), round 12`,
    // No model and no prompt: the decision table above IS the recipe, and its
    // content hash is what identifies this cohort.
    recipe: {
      model: 'human',
      template: JSON.stringify(FIXES, null, 2),
      ingredients: {},
      decoding: {},
    },
  }

  // A dry run opens NO run: provenance records what produced a value, and a
  // pass that writes none produced none. Same reasoning as curate-styles.
  const report = apply
    ? await withRunRecord(runOptions, (run) =>
        writer.apply(intents, { wrote: (id) => run.wrote(id) })
      )
    : await writer.apply(intents)

  console.log('\n─────────────────────────────────────────')
  console.log(
    formatReport(report, {
      dryRun: !apply,
      reJudgeWith: 'curate-editorial --ids <the ids above>',
    })
  )
  if (unresolved.length)
    console.log(`\nUnresolved name(s): ${unresolved.join(', ')}`)
  if (!apply && report.written) console.log('\nRe-run with --apply to write.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
