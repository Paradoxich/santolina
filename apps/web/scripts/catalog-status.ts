/**
 * Catalog-wide step coverage — did every step run for every plant, not just for
 * the plants a round remembered?
 *
 * WHICH RUNBOOK STEP RUNS THIS: none, and that is the point. It is a guard, like
 * `verify-round` and `invariants:check`, run by `pnpm catalog:status` and by CI
 * on main. WHAT ENDS IT: nothing. A guard has no end condition; it goes green.
 *
 * WHY IT EXISTS. `verify-round --round <label>` asks the per-plant question — it
 * is how round 10's `curate-editorial 6/50` was found — but it can only ask it of
 * plants listed in `rounds/<label>/manifest.json`, and manifests begin at round 8.
 * Every plant seeded before that is unreportable: `round-progress.ts` says so in
 * as many words ("Rounds 1-7 predate manifests and cannot be reported on"). That
 * is the majority of the catalog, and its state was simply unknown.
 *
 * Unknown is the part that costs. A number that is either zero or not can be
 * acted on or ignored on purpose; an unknown ambushes whichever session next
 * looks at it, which is how "clean up the old rows" became a task that reappeared
 * every round without ever being finished. This turns it into a number.
 *
 * WHAT IT ADDS OVER `verify-round` WITH NO SCOPE. That mode already checks
 * catalog-wide INVARIANTS — no duplicate names, no unmapped colour, every
 * combination inside the cap. Those are properties of a value. This asks the
 * other question: whether the WORK happened, per plant, per step. A row can
 * satisfy every invariant and have had four steps never run on it.
 *
 * IT REPORTS, IT DOES NOT FAIL. Exit code is 0 with gaps present, deliberately.
 * The catalog-wide gap is a known quantity being worked down on a schedule, and
 * a check that goes red for months teaches people to ignore it. Round
 * close still FAILs through `verify-round`, which is where a REGRESSION shows up.
 * The one thing that does exit 1 is the ordering guard below.
 *
 *   pnpm catalog:status            the report
 *   pnpm catalog:status --json     the same numbers, for a script
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { readRoundManifest } from './round-manifest'
import { STEP_DEFS, type StatusRow, type StepContext } from './round-status'

const JSON_OUT = process.argv.slice(2).includes('--json')

/**
 * THE A-BEFORE-B GUARD, and the reason it is four lines rather than forty.
 *
 * This script's entire output is a classification of what is OWED, and
 * `StepDef.obligation` is what defines owed. Run before that field exists and
 * every number here is a confident answer to a question with no meaning — which
 * is worse than no report, because a session acts on it.
 *
 * The plan for this work specified a runtime check that exits 1 naming any
 * unclassified step. That check would be theatre: `obligation` is a REQUIRED
 * field on `StepDef`, so a step without one does not compile, and `pnpm
 * typecheck` runs in CI ahead of this. The type system is the guard, and it is
 * strictly stronger — it fails at the moment the step is written rather than the
 * moment someone runs the report. What is left for runtime is the case types
 * cannot see: a value that got past `as` or arrived from JSON.
 */
function requireEveryStepClassified(): void {
  const unclassified = STEP_DEFS.filter(
    (d) => d.obligation !== 'catalog' && d.obligation !== 'forward'
  )
  if (unclassified.length === 0) return
  console.error(
    `\n✗ ${unclassified.length} step(s) carry no obligation: ` +
      `${unclassified.map((d) => d.step).join(', ')}\n\n` +
      `This report says what is OWED, and StepDef.obligation is what defines\n` +
      `owed. Classify them in scripts/round-status.ts first — the field is\n` +
      `required, so reaching this line means a cast or a bad JSON round-trip.\n`
  )
  process.exit(1)
}

/** Every column the steps read, plus the three editorial criterion stamps. */
const SELECT =
  'id, scientific_name, ai_drafted_at, native_region, ' +
  'botanical_checked_at, native_checked_at, native_region_checked_at, ' +
  'hardiness_rating, seasonal_care, style_checked_at, greenery_checked_at, ' +
  'image_checked_at, image_pick_confidence, image_verified_at, ' +
  'editorial_checked_at, editorial_image_at, editorial_description_at, ' +
  'editorial_tags_at, common_name_checked_at'

type Row = StatusRow & EditorialRow

/** The four columns the editorial split reads, and nothing else. */
export interface EditorialRow {
  editorial_checked_at: string | null
  editorial_image_at: string | null
  editorial_description_at: string | null
  editorial_tags_at: string | null
}

/**
 * Tell a never-judged row from one whose verdict was taken back.
 *
 * A callable seam rather than a filter inside `main`, because this is the only
 * judgment in this file and the one thing about it that can be wrong. Pinned by
 * `catalog-status.test.ts`.
 *
 * WHY IT CANNOT KEY ON `editorial_checked_at`. `invalidate_editorial_verdict`
 * (migration `20260729112046`) nulls that column when it clears any criterion, so
 * after a withdrawal a judged row is byte-identical to one the pass never
 * reached. The per-criterion stamps are the only surviving difference: the
 * trigger clears ONLY the criterion whose fields changed, so a row that lost its
 * tags leg still carries `editorial_image_at` and `editorial_description_at`.
 * That is trap 31's 86 rows exactly — "descriptions and heroes already passed
 * once, only the tags changed".
 *
 * The distinction is not cosmetic. A withdrawal is a REGRESSION: the work was
 * done and undone, so re-judging restores something that existed. A never-judged
 * row is a RETROFIT: the standard arrived after it. They carry different
 * arguments about whether to spend money on them, and one debt number hides that.
 */
export function splitEditorial<T extends EditorialRow>(
  plants: T[]
): { neverJudged: T[]; withdrawn: T[] } {
  const noVerdict = plants.filter((p) => !p.editorial_checked_at)
  const hasCriterion = (p: T) =>
    Boolean(
      p.editorial_image_at || p.editorial_description_at || p.editorial_tags_at
    )
  return {
    neverJudged: noVerdict.filter((p) => !hasCriterion(p)),
    withdrawn: noVerdict.filter(hasCriterion),
  }
}

/**
 * Which round introduced each plant, for the rows a manifest can answer for.
 *
 * Rounds 1-7 have no manifest and never will — the files were not written at the
 * time and inventing them now would be fabricating a record. Those rows are
 * reported as `pre-manifest`, which is a true statement about the evidence
 * rather than a guess about the plant.
 */
function roundOf(): Map<string, string> {
  const byId = new Map<string, string>()
  for (let n = 1; n <= 40; n++) {
    const m = readRoundManifest(String(n))
    if (!m) continue
    for (const id of m.seeded_ids) byId.set(id, String(n))
  }
  return byId
}

async function main() {
  requireEveryStepClassified()
  const db = getSupabaseAdmin()

  const plants = await fetchAllRows<Row>((from, to) =>
    db.from('plants').select(SELECT).order('id').range(from, to)
  )

  const combos = await fetchAllRows<{ plant_id_a: string; plant_id_b: string }>(
    (from, to) =>
      db
        .from('plant_combinations')
        .select('plant_id_a, plant_id_b')
        .order('id')
        .range(from, to)
  )
  const paired = new Set<string>()
  for (const c of combos) {
    paired.add(c.plant_id_a)
    paired.add(c.plant_id_b)
  }
  const ctx: StepContext = { paired }

  const manifestRound = roundOf()
  const total = plants.length
  const roundLabel = (id: string) => manifestRound.get(id) ?? 'pre-manifest'

  // EVERY step, including perRound: false. computeStatus drops those because a
  // ROUND does not owe a repair pass — but catalog-wide the question is whether
  // a ROW meets the standard, and curate-styles/curate-greenery are exactly the
  // standards old rows are most likely to miss.
  const rows = STEP_DEFS.map((def) => {
    const scope = def.applies ? plants.filter(def.applies) : plants
    const missing = scope.filter((p) => !def.ran(p, ctx))
    const byRound = new Map<string, number>()
    for (const p of missing) {
      const r = roundLabel(p.id)
      byRound.set(r, (byRound.get(r) ?? 0) + 1)
    }
    return {
      step: def.step,
      obligation: def.obligation,
      applicable: scope.length,
      done: scope.length - missing.length,
      missing: missing.length,
      byRound: [...byRound.entries()].sort((a, b) => b[1] - a[1]),
    }
  })

  /**
   * The editorial split, which is the one number people get wrong.
   *
   * A row with no verdict is in one of two states that look identical on
   * `editorial_checked_at` — the trigger nulls it either way (migration
   * 20260729112046). They are NOT the same fact and do not want the same remedy:
   *
   *   never judged      — the pass has not reached this row. All three criterion
   *                       stamps null. This is the rounds 1-6 backlog.
   *   verdict withdrawn — the pass DID judge it and a later write to a watched
   *                       field took the verdict back. At least one criterion
   *                       stamp survives, which is what tells them apart. This is
   *                       trap 31's 86 rows, and it is a regression, not a
   *                       retrofit: the work was done once and undone.
   *
   * Collapsing the two into one debt number is the semantic flattening that
   * produced the backlog this check exists to measure.
   */
  const { neverJudged, withdrawn } = splitEditorial(plants)
  const withdrawnByRound = new Map<string, number>()
  for (const p of withdrawn) {
    const r = roundLabel(p.id)
    withdrawnByRound.set(r, (withdrawnByRound.get(r) ?? 0) + 1)
  }

  const reportable = plants.filter((p) => manifestRound.has(p.id)).length

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          total,
          reportable_by_manifest: reportable,
          steps: rows,
          editorial: {
            never_judged: neverJudged.length,
            verdict_withdrawn: withdrawn.length,
            withdrawn_by_round: [...withdrawnByRound.entries()],
          },
        },
        null,
        2
      )
    )
    return
  }

  console.log(`\n━━━ CATALOG STATUS ━━━\n`)
  console.log(
    `${total} plants. ${reportable} are in a round manifest and could already ` +
      `be reported\non by verify-round; ${total - reportable} predate manifests ` +
      `and could not. Both are below.\n`
  )

  const owed = rows.filter((r) => r.obligation === 'catalog')
  const notOwed = rows.filter((r) => r.obligation === 'forward')

  const line = (r: (typeof rows)[number]) => {
    const head = `  ${r.step.padEnd(28)} ${String(r.done).padStart(4)}/${String(r.applicable).padEnd(4)}`
    if (r.missing === 0) return `${head}  ✓`
    const where = r.byRound
      .map(([label, n]) => `${label}:${n}`)
      .slice(0, 6)
      .join('  ')
    return `${head}  ${String(r.missing).padStart(4)} missing   ${where}`
  }

  console.log('OWED — every row owes these, whenever it was seeded.\n')
  for (const r of owed) console.log(line(r))

  if (notOwed.length) {
    // The header says "no reader can tell", NOT "these rows predate the step".
    // Seeding order is the usual reason a forward gap is harmless and it is not
    // the rule, and draft-hardiness is the counter-example sitting right here:
    // its missing rows are rounds 9-12, the NEWEST ones, because the ratings
    // were drafted for the older catalog in July and the track was parked before
    // those rounds existed. A header claiming they are settled by age would be
    // false about every row it printed. What actually makes the gap
    // informational is that nothing renders the column — the claim
    // FORWARD_STEP_WITNESSES asserts and re-checks.
    console.log(
      `\nNOT OWED — a gap here reaches no reader, so it is information, not work.\n` +
        `Each of these carries a witness in check-pipeline-invariants.ts that fails\n` +
        `the day that stops being true. Not a statement about when the rows were seeded.\n`
    )
    for (const r of notOwed) console.log(line(r))
  }

  console.log(`\nEDITORIAL, split by what actually happened to the row:\n`)
  console.log(
    `  never judged        ${String(neverJudged.length).padStart(4)}   the pass has not reached these`
  )
  console.log(
    `  verdict withdrawn   ${String(withdrawn.length).padStart(4)}   judged once, then a watched field changed` +
      (withdrawn.length
        ? `\n                             ${[...withdrawnByRound.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([l, n]) => `${l}:${n}`)
            .join('  ')}`
        : '')
  )
  console.log(
    `\n  The two are indistinguishable on editorial_checked_at — the trigger nulls\n` +
      `  it either way — and are told apart by whether any per-criterion stamp\n` +
      `  survived. A withdrawal is a regression; a never-judged row is a retrofit.\n`
  )
}

// Guarded so `splitEditorial` can be imported by the test without the module
// connecting to Supabase on the way in — the pattern regenerate-native-region.ts
// and cross-check-native-region.ts already use.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
