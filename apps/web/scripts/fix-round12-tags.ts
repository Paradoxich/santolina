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
 *      docs/architecture.md#plant-type-label (Ana's ruling, July 10 2026) says
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
 * THREE OLDER ROWS CARRY THE SAME DEFECT AND ARE FIXED HERE TOO (Ana, this
 * session). Carex comans and Carex testacea read "ornamental grass", Luzula
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
 * SAFETY — the same discipline as fix-round12-names.ts:
 *   - Every entry carries the value it EXPECTS to find; a drifted row is
 *     skipped and reported, never overwritten.
 *   - Only `is_curated = false` rows are touched.
 *   - Idempotent: a row already holding the target value is skipped.
 *   - Matched by `scientific_name`, which is stable.
 *
 * Usage (from apps/web) — dry run is the default:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round12-tags.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round12-tags.ts --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'

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

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const db = getSupabaseAdmin()

  console.log(
    `\n${FIXES.length} tag fixes.` +
      (apply ? '\n' : ' DRY RUN — pass --apply to write.\n')
  )

  let changed = 0
  const already: string[] = []
  const drifted: string[] = []
  const curated: string[] = []
  const missing: string[] = []

  for (const fix of FIXES) {
    const { data, error } = await db
      .from('plants')
      .select(`id, is_curated, ${fix.column}`)
      .eq('scientific_name', fix.scientific_name)
      .maybeSingle()

    if (error) throw new Error(`${fix.scientific_name}: ${error.message}`)
    if (!data) {
      missing.push(fix.scientific_name)
      console.log(`  ??  ${fix.scientific_name} — no such row`)
      continue
    }

    const row = data as unknown as Record<string, unknown>
    const live = JSON.stringify(row[fix.column])

    if (live === fix.to) {
      already.push(fix.scientific_name)
      continue
    }
    if (row['is_curated']) {
      curated.push(fix.scientific_name)
      console.log(`  --  ${fix.scientific_name} — is_curated, frozen`)
      continue
    }
    if (live !== fix.from) {
      drifted.push(fix.scientific_name)
      console.log(
        `  !!  ${fix.scientific_name}.${fix.column} — expected ${fix.from}, found ${live} — skipped`
      )
      continue
    }

    if (apply) {
      const { error: upErr } = await db
        .from('plants')
        .update({ [fix.column]: JSON.parse(fix.to) })
        .eq('id', row['id'] as string)
      if (upErr) throw new Error(`${fix.scientific_name}: ${upErr.message}`)
    }
    changed++
    console.log(
      `  ${apply ? '✓' : '·'}   ${fix.scientific_name}.${fix.column}: ${fix.from} → ${fix.to} — ${fix.why}`
    )
  }

  console.log('\n─────────────────────────────────────────')
  console.log(
    `${apply ? 'Updated' : 'Would update'}: ${changed}  ·  already correct: ${already.length}  ·  drifted (skipped): ${drifted.length}  ·  frozen: ${curated.length}  ·  no row: ${missing.length}`
  )
  if (!apply && changed) console.log('\nRe-run with --apply to write.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
