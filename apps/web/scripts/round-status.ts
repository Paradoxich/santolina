/**
 * Round completeness — did every pipeline step actually RUN for a round's
 * plants? Shared by `verify-round.ts` (which fails on a gap) and
 * `log-db-session.ts` (which records the answer).
 *
 * WHY THIS EXISTS. Every guard in this repo checks whether a value is WRONG.
 * Nothing checked whether work HAPPENED. Round 8 found three separate steps
 * that had silently not run, and all three were invisible for the same reason:
 *
 *   · `--new-only` never scoped to a batch on either cross-check guard,
 *     because its stamp-column baseline was never backfilled. Every round
 *     since those columns shipped re-checked and re-billed the whole catalog.
 *   · No `seasonal_care` step existed in the runbook at all, so every plant
 *     seeded after Care Tips v2 shipped showed no care tip.
 *   · Round 7's 76 plants were never hardiness-drafted, discovered only
 *     because round 8's draft picked up 177 plants instead of 101.
 *
 * A skipped step produces no error, no bad value, and no output anyone has
 * reason to question — the run just looks smaller or larger than it should.
 * The manifest (`rounds/<label>/manifest.json`) is what finally makes this
 * checkable: it records exactly which plants a round added, so "did step N
 * run for them" becomes a query instead of a memory.
 *
 * WHAT A STEP'S EVIDENCE IS. Each step below is detected by the DB state it
 * leaves behind, never by a log or a flag file — state is the only thing that
 * survives a killed run, a re-run, or a different machine. That also makes
 * these checks honest about partial work: a run killed at 60% reports 60%.
 *
 * THIS LIST IS HAND-MAINTAINED, AND THAT IS ITS OWN FAILURE MODE. A step
 * missing from here is invisible in exactly the way this file exists to
 * prevent: `verify-round --round 8` reported 7/7 green while curate-greenery
 * and the image pass had never run for any of round 8's 101 plants (found
 * 2026-07-28, by querying the DB rather than by any guard). If you add a
 * pipeline step that stamps a column, add it here in the same commit — the
 * standing check is that every `*_checked_at` column on `plants` should
 * correspond to a step below.
 */

import { getSupabaseAdmin } from './../lib/supabase-admin'
import { fetchAllRows } from './../lib/paginate'

export interface StepStatus {
  /** Step name, matching the runbook order (docs/architecture.md#round-runbook). */
  step: string
  /** How many of the round's plants carry this step's evidence. */
  done: number
  /** How many should (hybrids are excluded where the step can't apply). */
  total: number
  complete: boolean
  /**
   * `complete` is true because NOTHING APPLIED, not because work was done.
   *
   * This is the distinction that cost round 9 a wasted vision pass. A step
   * with an `applies` predicate has `total === 0` until the step that feeds
   * that predicate has run — `pick-plant-images --verify` applies only to
   * medium-confidence heroes, and no plant has a confidence at all until the
   * image pass runs. `done === total` is then `0 === 0`, and the step reports
   * itself finished before it has ever looked at anything.
   *
   * It is not specific to that step: EVERY step with an `applies` predicate
   * has this shape whenever its scope is empty. So the emptiness is surfaced
   * rather than folded into a boolean, and each caller decides what it means.
   * `verify-round` can treat "nothing to do" as fine; `run-round` must NOT
   * treat it as "already done", because the reason may be that an upstream
   * step has not run.
   *
   * Zero evidence is not evidence of completion — the same rule this codebase
   * already applies to a failed fetch.
   */
  vacuous: boolean
  /** The DB state that counts as evidence — shown in reports so a reader can verify the claim. */
  evidence: string
  /** Level to report a gap at. Fields that are deliberately parked warn instead of failing. */
  level: 'FAIL' | 'WARN'
}

export interface StatusRow {
  id: string
  scientific_name: string | null
  ai_drafted_at: string | null
  native_region: string[] | null
  botanical_checked_at: string | null
  native_checked_at: string | null
  native_region_checked_at: string | null
  hardiness_rating: string | null
  seasonal_care: unknown
  style_checked_at: string | null
  greenery_checked_at: string | null
  image_checked_at: string | null
  image_pick_confidence: string | null
  image_verified_at: string | null
  editorial_checked_at: string | null
}

/** A garden hybrid has no wild range, so an empty native_region is correct. */
const isHybrid = (sci: string | null): boolean =>
  !!sci && (sci.includes('×') || sci.includes(' x '))

const nonEmpty = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined

/**
 * Taxa GBIF carries no usable WCVP distribution for, so
 * cross-check-native-region can never stamp them — it deliberately leaves a
 * no-data row NULL rather than record a check that did not happen (migration
 * 20260728193815). Without this list those rows would hold the step at
 * 96/101 forever and the only way to green it would be to soften a FAIL to a
 * WARN, which is how a skipped step stays invisible.
 *
 * Named, with the reason, in the same spirit as MANUAL_EXCLUSIONS in the
 * cross-check and the waivers in rounds/<n>/scope-allow.json: an exception is
 * written down, not switched off. Re-checked July 28 2026 — resolving each to
 * its accepted synonym (Struthiopteris spicant, Isotrema macrophyllum) still
 * returns no WCVP rows, so this is upstream absence, not a naming miss.
 */
const NO_WCVP_DISTRIBUTION: Record<string, string> = {
  'Stylophorum diphyllum': 'GBIF has the taxon, no WCVP distribution rows',
  'Musa basjoo': 'GBIF has the taxon, no WCVP distribution rows',
  'Viburnum davidii':
    'GBIF only matches fuzzily to "Viburnum davidi", which carries a single WCVP row — too thin to validate against',
  'Aristolochia macrophylla':
    'no species-rank GBIF match; accepted synonym Isotrema macrophyllum resolves but carries no WCVP rows',
  'Blechnum spicant':
    'no species-rank GBIF match; segregate genus Struthiopteris spicant resolves but carries no WCVP rows',
  // Round 9. Verdict came back 'no-data' on 2026-07-29 with the stored range
  // (nine North American regions) left untouched — the cross-check reported
  // "GBIF has the taxon but carries no WCVP distribution for it". Nothing was
  // learned about this row, so it is deliberately unstamped rather than
  // recorded as validated.
  'Symphoricarpos albus':
    'GBIF has the taxon, no WCVP distribution rows (round 9)',
  // Round 10. Same verdict shape as Symphoricarpos albus above: cross-check
  // reported "GBIF has the taxon but carries no WCVP distribution for it",
  // stored range (Mexico + three US regions) left untouched, row deliberately
  // unstamped rather than recorded as validated.
  'Bidens ferulifolia':
    'GBIF has the taxon, no WCVP distribution rows (round 10)',
}

/** State a step needs beyond the plant row itself. */
export interface StepContext {
  paired: Set<string>
}

interface StepDef {
  /** Step name, matching the runbook order (docs/architecture.md#round-runbook). */
  step: string
  /** The DB state that counts as evidence — printed so a reader can check it. */
  evidence: string
  /** FAIL once the feature the step feeds is shipped; WARN while it is parked. */
  level: 'FAIL' | 'WARN'
  /**
   * The bookkeeping column this step stamps, when it stamps one.
   *
   * This field is what makes the registry self-checking. `verify-round`
   * asserts that every `*_checked_at` and `*_verified_at` column on `plants` is claimed by some
   * step here, so adding a stamp column without adding its step FAILS instead
   * of going unnoticed — which is precisely how curate-greenery and the image
   * pass stayed invisible through round 8.
   */
  stampColumn?: string
  /**
   * False for a step a round does not owe.
   *
   * Some passes exist to REPAIR older data, not to run per round, and holding
   * a round incomplete until they have run is how a pipeline grows to
   * thirteen manual gates. `curate-styles` re-judges tags drafted under the
   * loose pre-July-28 prompt — a plant seeded today is already tagged by the
   * same tightened definitions inside `curate-plants`, so re-asking is a step
   * that cannot change anything. `curate-greenery` is the same story since
   * `is_greenery` was folded into the drafting call.
   *
   * They stay in this registry, because the registry is what proves every
   * stamp column on `plants` is claimed by something. They are simply not
   * part of what "round N is done" means.
   */
  perRound?: boolean
  /** Rows the step can apply to. Default: every plant in the round. */
  applies?: (p: StatusRow) => boolean
  /** Has this step run for this row? */
  ran: (p: StatusRow, ctx: StepContext) => boolean
}

/**
 * THE STEP REGISTRY — the single source of truth for what a round consists of.
 *
 * Adding a pipeline step means adding an entry here, in the same commit as the
 * script. Everything else reads from this list: `roundStatus` counts against
 * it, `verify-round` fails on a gap, `log-db-session` records it, and the
 * stamp-column assertion above proves nothing was left out.
 */
export const STEP_DEFS: StepDef[] = [
  {
    step: 'curate-plants',
    evidence: 'ai_drafted_at NOT NULL',
    level: 'FAIL',
    ran: (p) => Boolean(p.ai_drafted_at),
  },
  {
    step: 'curate-combinations',
    evidence: 'appears in plant_combinations',
    level: 'FAIL',
    ran: (p, ctx) => ctx.paired.has(p.id),
  },
  {
    step: 'regenerate-native-region',
    evidence: 'native_region non-empty (hybrids excluded)',
    level: 'FAIL',
    applies: (p) => !isHybrid(p.scientific_name),
    ran: (p) => nonEmpty(p.native_region),
  },
  {
    step: 'cross-check-plants',
    evidence: 'botanical_checked_at NOT NULL',
    level: 'FAIL',
    stampColumn: 'botanical_checked_at',
    ran: (p) => Boolean(p.botanical_checked_at),
  },
  {
    step: 'cross-check-native-to',
    evidence: 'native_checked_at NOT NULL',
    level: 'FAIL',
    stampColumn: 'native_checked_at',
    ran: (p) => Boolean(p.native_checked_at),
  },
  {
    // docs/architecture.md#round-runbook step 5b. FAIL rather than WARN: native_region powers a live filter
    // (lib/native-to-me.ts), the pass costs nothing to run (GBIF plus a local
    // geojson, no Claude call), and Trefle conflates native with introduced
    // range — the failure this guard exists to catch is a plant tagged with
    // exactly the range it was introduced into.
    step: 'cross-check-native-region',
    evidence: 'native_region_checked_at NOT NULL',
    level: 'FAIL',
    stampColumn: 'native_region_checked_at',
    // A row with no scientific_name can't be looked up in GBIF, and neither
    // can the taxa upstream has no WCVP distribution for. Counting either
    // would hold the step permanently incomplete on rows that no re-run can
    // ever fix.
    applies: (p) =>
      Boolean(p.scientific_name) &&
      !(p.scientific_name! in NO_WCVP_DISTRIBUTION),
    ran: (p) => Boolean(p.native_region_checked_at),
  },
  {
    // Care Tips v2 is LIVE and reads seasonal_care[currentStage], so a plant
    // without it shows no tip at all. Shipped feature: FAIL.
    step: 'curate-seasonal-care',
    evidence: 'seasonal_care NOT NULL',
    level: 'FAIL',
    ran: (p) => nonEmpty(p.seasonal_care),
  },
  {
    // Hardiness is PARKED (docs/architecture.md#hardiness) — it feeds only a dormant survive-winter
    // bullet, so a round does not owe it. Drafting a rating per round for a
    // feature nobody can see is a paid step that buys a warning symbol.
    // When that work resumes: perRound true and level FAIL, in one change.
    step: 'draft-hardiness',
    evidence: 'hardiness_rating NOT NULL',
    level: 'WARN',
    perRound: false,
    ran: (p) => Boolean(p.hardiness_rating),
  },
  {
    // NOT per round since 2026-07-29. curate-plants tags new seeds using the
    // SAME tightened definitions (both import lib/style-tags.ts), so running
    // this over a fresh batch re-asks a question already answered correctly.
    // It remains the repair pass for rows drafted under the loose
    // pre-July-28 prompt — the ones that put cottage on 89.6% of the catalog.
    step: 'curate-styles',
    evidence: 'style_checked_at NOT NULL',
    level: 'FAIL',
    perRound: false,
    stampColumn: 'style_checked_at',
    ran: (p) => Boolean(p.style_checked_at),
  },
  {
    // NOT per round since 2026-07-29: is_greenery is now answered inside
    // curate-plants, on a call already being made, and stamped there. This
    // survives as the repair pass for rows seeded before that.
    //
    // The obligation has not gone away, it has moved: is_greenery is the ONLY
    // way into the Explore Green colour bucket (lib/plant-colors.ts — plain
    // green foliage deliberately never maps) and defaults to false, so an
    // unjudged plant is silently missing from a live filter. curate-plants
    // now carries that, and the stamp is what proves it.
    step: 'curate-greenery',
    evidence: 'greenery_checked_at NOT NULL',
    level: 'FAIL',
    perRound: false,
    stampColumn: 'greenery_checked_at',
    ran: (p) => Boolean(p.greenery_checked_at),
  },
  {
    // WARN, not FAIL: the vision pick is a separate costed Batch API flow
    // (docs/architecture.md#hero-images, docs/architecture.md#wikimedia-attribution),
    // deliberately not part of the per-round cadence, and
    // PlantImage falls back to a placeholder. Visible so a round cannot
    // quietly ship without one, but it should not redden every round.
    step: 'pick-plant-images',
    evidence: 'image_checked_at NOT NULL',
    level: 'WARN',
    stampColumn: 'image_checked_at',
    ran: (p) => Boolean(p.image_checked_at),
  },
  {
    // The remediation half of the image pass, and the only step here that is
    // CONDITIONAL: a row only owes a verification if the pick came out
    // `medium`. `high` is settled and `low` needs a new candidate image, not a
    // second opinion on the same one — so both are outside the obligation
    // rather than passing it trivially.
    //
    // A row cleared to `high` by the verification stops applying, which is
    // correct: the question it was asked has been answered and the answer is
    // recorded in image_pick_confidence. A row that stays `medium` keeps
    // applying and is satisfied by the stamp, so "we looked again and still
    // could not confirm it" reads as done work with an unresolved answer,
    // exactly like a held-back editorial verdict.
    //
    // WARN, following the pick step it belongs to.
    step: 'pick-plant-images --verify',
    evidence: 'image_verified_at NOT NULL (medium-confidence heroes only)',
    level: 'WARN',
    stampColumn: 'image_verified_at',
    applies: (p) => p.image_pick_confidence === 'medium',
    ran: (p) => Boolean(p.image_verified_at),
  },
  {
    // The sign-off step (docs/architecture.md#curation-layer), and deliberately last: it judges the output of
    // every step above it, so it can only run once they have.
    //
    // FAIL rather than WARN, even though it will show older rounds as
    // incomplete. The editorial pass is owed, not parked, and the round-8
    // lesson was precisely that a WARN on a live obligation is how a skipped
    // step stays invisible. A red older round here is a true statement about
    // the catalog, not noise.
    //
    // Evidence is the STAMP, never is_curated: a row the pass judged and held
    // back is finished work with a "no" verdict, and counting only approvals
    // would make a strict pass look like a pass that never ran.
    step: 'curate-editorial',
    evidence: 'editorial_checked_at NOT NULL',
    level: 'FAIL',
    stampColumn: 'editorial_checked_at',
    ran: (p) => Boolean(p.editorial_checked_at),
  },
]

/**
 * The bookkeeping columns some step claims. `verify-round` compares this
 * against the columns that actually exist on `plants`.
 */
export function registeredStampColumns(): Set<string> {
  return new Set(
    STEP_DEFS.map((d) => d.stampColumn).filter((c): c is string => Boolean(c))
  )
}

/**
 * Inspect the live DB and report which pipeline steps have run for `ids`.
 *
 * FAIL vs WARN mirrors whether the underlying feature is shipped or parked
 * (hardiness is parked, docs/architecture.md#hardiness; everything else is live). The round-8 lesson is
 * that a WARN is correct for a parked field and WRONG for a shipped one —
 * `seasonal_care` sat at WARN while Care Tips v2 was live in front of users,
 * which is exactly why a whole batch shipped without tips. When hardiness
 * work resumes, promote it here.
 */
export async function roundStatus(ids: string[]): Promise<StepStatus[]> {
  const db = getSupabaseAdmin()
  const idSet = new Set(ids)

  const plants = await fetchAllRows<StatusRow>((from, to) =>
    db
      .from('plants')
      .select(
        'id, scientific_name, ai_drafted_at, native_region, ' +
          'botanical_checked_at, native_checked_at, native_region_checked_at, ' +
          'hardiness_rating, seasonal_care, ' +
          'style_checked_at, greenery_checked_at, image_checked_at, ' +
          'image_pick_confidence, image_verified_at, ' +
          'editorial_checked_at'
      )
      .in('id', ids)
      .order('id')
      .range(from, to)
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
    if (idSet.has(c.plant_id_a)) paired.add(c.plant_id_a)
    if (idSet.has(c.plant_id_b)) paired.add(c.plant_id_b)
  }

  const ctx: StepContext = { paired }

  return computeStatus(plants, ctx)
}

/**
 * The pure half of `roundStatus` — same answer, no database.
 *
 * Split out so the vacuous-completion rule can be tested against a synthetic
 * freshly-seeded plant instead of against a real round. That test is the whole
 * point: round 9 discovered this behaviour by spending a vision pass on 50
 * plants, and the same finding is available for free from a plant object with
 * every column null.
 */
export function computeStatus(
  plants: StatusRow[],
  ctx: StepContext
): StepStatus[] {
  // Only the steps a round actually owes. A repair pass for older data
  // (perRound: false) stays in the registry so its stamp column is claimed,
  // but a round is not held incomplete waiting for it.
  return STEP_DEFS.filter((def) => def.perRound !== false).map((def) => {
    const scope = def.applies ? plants.filter(def.applies) : plants
    const done = scope.filter((p) => def.ran(p, ctx)).length
    return {
      step: def.step,
      done,
      total: scope.length,
      complete: done === scope.length,
      // Nothing applied, so nothing was learned. See StepStatus.vacuous.
      vacuous: scope.length === 0 && plants.length > 0,
      evidence: def.evidence,
      level: def.level,
    }
  })
}

/**
 * Assert that every bookkeeping column on `plants` is claimed by a step in
 * STEP_DEFS. Returns the unclaimed ones.
 *
 * This is the check that would have caught the round-8 miss. `greenery_checked_at`
 * and `image_checked_at` both existed on the table while no step mentioned
 * them, so a round could skip those passes entirely and still report a clean
 * sweep. Reads the live column list rather than a hardcoded one, so a column
 * added by a future migration is covered the day it ships.
 */
export async function unregisteredStampColumns(): Promise<string[]> {
  const db = getSupabaseAdmin()
  const { data, error } = await db.from('plants').select('*').limit(1)
  if (error) throw new Error(`Failed to read plants columns: ${error.message}`)
  if (!data?.length) return []

  const registered = registeredStampColumns()
  return (
    Object.keys(data[0])
      // Criterion stamps (editorial_image_at, editorial_description_at,
      // editorial_tags_at) are deliberately NOT matched here, and saying so is
      // the point — an omission this file did not state explicitly is what
      // trap 1b is about. They are not step stamps: they are three parts of ONE
      // step's verdict, and that step already claims editorial_checked_at. A
      // round is complete when the pass reached a verdict, not when every
      // criterion passed; holding a round open until nothing is ever held back
      // would make a strict pass unable to finish.
      //
      // `_verified_at` as well as `_checked_at`: image_verified_at (migration
      // 20260729083058) is a bookkeeping stamp in every sense that matters, and
      // a suffix check looking only for the older name would have sailed past
      // it — which is the precise failure this function exists to prevent,
      // repeating itself one naming convention later.
      .filter((c) => c.endsWith('_checked_at') || c.endsWith('_verified_at'))
      .filter((c) => !registered.has(c))
      .sort()
  )
}

/** One-line-per-step render, used by both the verifier and the log writer. */
export function formatStatus(rows: StepStatus[]): string[] {
  return rows.map((r) => {
    const mark = r.complete ? '✓' : r.level === 'FAIL' ? '✗' : '⚠'
    const count = r.complete ? `${r.total}/${r.total}` : `${r.done}/${r.total}`
    return `${mark} ${r.step.padEnd(26)} ${count.padStart(9)}   ${r.evidence}`
  })
}
