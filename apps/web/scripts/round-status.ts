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
import { NOT_A_STEP_STAMP, isStampColumn } from './stamp-columns'

export interface StepStatus {
  /** Step name, matching the runbook order (docs/curation.md#round-runbook). */
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
  common_name_checked_at: string | null
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
  // Round 11, both checked by hand against GBIF on 2026-08-14 before being
  // written here — the discipline this list is under, since an entry claims
  // upstream has nothing and a wrong claim hides real data.
  'Vernonia noveboracensis':
    'GBIF has the taxon (EXACT, usageKey 8271565) and returns 2 distribution rows, 0 of them WCVP (round 11)',
  // The Viburnum davidii case exactly: species-rank match only via the gender
  // variant "atrosanguineus", which carries a single WCVP row — too thin to
  // validate a range against, so this is a no-data row and NOT a naming miss.
  // Contrast Andropogon gerardii from the same round: its variant spelling
  // carries 60 WCVP rows, so it is an alias (GBIF_NAME_ALIASES in
  // scripts/wcvp-lookup.ts) and deliberately not listed here.
  'Rhodochiton atrosanguineum':
    'no species-rank GBIF match; gender variant R. atrosanguineus resolves but carries a single WCVP row (round 11)',
}

/** State a step needs beyond the plant row itself. */
export interface StepContext {
  paired: Set<string>
}

interface StepDef {
  /** Step name, matching the runbook order (docs/curation.md#round-runbook). */
  step: string
  /** The DB state that counts as evidence — printed so a reader can check it. */
  evidence: string
  /** FAIL once the feature the step feeds is shipped; WARN while it is parked. */
  level: 'FAIL' | 'WARN'
  /**
   * WHO OWES THIS ROW — the second axis, added 2026-08-17 (Ana's ruling).
   *
   * `level` answers "how loudly does a MISSING stamp read", and it is about the
   * feature. This answers a different question the registry could not previously
   * express: when a standard arrives AFTER a row was seeded, does that row owe
   * the standard at all?
   *
   *   `catalog` — every row owes it, whenever it was seeded. A gap is work.
   *   `forward` — a gap reaches no reader, so it is information, not work.
   *
   * The usual `forward` case is a standard that arrived after the rows and never
   * became visible, and it is tempting to define the class as "older rows are
   * settled". Do not: `draft-hardiness` is missing on rounds 9-12, the NEWEST
   * rows, because ratings were drafted for the then-catalog in July and the track
   * was parked before those rounds existed. Seeding order is the common
   * explanation, never the test.
   *
   * WHY THE AXIS EXISTS. Eleven stamp columns landed between 2026-07-06 and
   * 2026-08-13, five of them inside one 22-hour window while round 8 was open.
   * Each made every already-seeded row NULL, so a new standard has always cost
   * the catalog size rather than the round size, and nothing anywhere said
   * whether that cost was owed. It was decided ad hoc each time, and one such
   * decision — 277 `native_checked_at` rows ruled "recorded debt, left" — was
   * quietly reversed by a later session because nothing held it.
   *
   * THE TEST IS ABOUT THE CHECK, NOT THE COLUMN. "Does anything read this
   * column?" is the obvious formulation and it is wrong. Nothing reads
   * `is_curated` anywhere under app/, components/ or hooks/ — but the pass that
   * records it rewrites descriptions on ~60% of the rows it touches and holds
   * rows whose photograph shows the wrong species. Classifying on the column
   * would have declared ~504 rows finished while the descriptions a reader
   * actually sees had never been through the bar. Ask instead: if this check had
   * never run on a row, could a user tell?
   *
   * WHAT THIS IS NOT. It never backdates a stamp. A stamp is evidence and
   * evidence cannot be invented (trap 28); `forward` changes what work is OWED,
   * never what the record SAYS. A `forward` step still FAILs inside its own
   * round's manifest — the standard applies going forward — it simply raises no
   * catalog-wide obligation. Every `forward` step must carry a witness in
   * FORWARD_STEP_WITNESSES (check-pipeline-invariants.ts), which is what makes
   * the ruling fail the day it stops being true.
   */
  obligation: 'catalog' | 'forward'
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
    // Since 2026-07-29 the drafting call also answers the style and greenery
    // questions, so the evidence covers all three stamps — the obligation
    // moved into this step, and its proof moves with it. Checking only
    // ai_drafted_at is how trap 26 (docs/database-log.md) hid for three
    // weeks: the style leg silently no-oped while the rounds closed green,
    // because the step whose stamp would have caught it (curate-styles) is a
    // perRound: false repair pass that round close never looks at.
    step: 'curate-plants',
    evidence:
      'ai_drafted_at, style_checked_at, greenery_checked_at all NOT NULL',
    level: 'FAIL',
    // Drafts description, care instructions, style tags and greenery. Every one
    // of those renders.
    obligation: 'catalog',
    ran: (p) =>
      Boolean(p.ai_drafted_at && p.style_checked_at && p.greenery_checked_at),
  },
  {
    step: 'curate-common-names',
    evidence: 'common_name_checked_at NOT NULL',
    level: 'FAIL',
    // `catalog`, and the test settles it immediately: if this check had never
    // run on a row, could a user tell? Yes — 50 rows show a Latin binomial
    // where a garden name belongs, on the Explore card and in search. It is
    // the most visible unjudged field in the catalog.
    //
    // So this step arrives with every row owing it, which is the honest number
    // rather than a discouraging one. It was always true and was previously
    // unreportable: common_name is never null (lib/trefle.ts falls back to the
    // binomial), so a good name and an unexamined one are the same value.
    // Backfilling the stamp instead of judging the rows would assert a
    // judgement nobody made.
    obligation: 'catalog',
    stampColumn: 'common_name_checked_at',
    ran: (p) => Boolean(p.common_name_checked_at),
  },
  {
    step: 'curate-combinations',
    evidence: 'appears in plant_combinations',
    level: 'FAIL',
    // Companion pairings are a card on the plant page.
    obligation: 'catalog',
    ran: (p, ctx) => ctx.paired.has(p.id),
  },
  {
    step: 'regenerate-native-region',
    evidence: 'native_region non-empty (hybrids excluded)',
    level: 'FAIL',
    // native_region is the Explore native filter (lib/native-to-me.ts).
    obligation: 'catalog',
    applies: (p) => !isHybrid(p.scientific_name),
    ran: (p) => nonEmpty(p.native_region),
  },
  {
    step: 'cross-check-plants',
    evidence: 'botanical_checked_at NOT NULL',
    level: 'FAIL',
    // Fact-checks the botanical fields the plant page prints. A wrong one is
    // wrong on screen, whatever the stamp says.
    obligation: 'catalog',
    stampColumn: 'botanical_checked_at',
    ran: (p) => Boolean(p.botanical_checked_at),
  },
  {
    step: 'cross-check-native-to',
    evidence: 'native_checked_at NOT NULL',
    level: 'FAIL',
    // native_to is the "Native to" row on the plant page.
    obligation: 'catalog',
    stampColumn: 'native_checked_at',
    ran: (p) => Boolean(p.native_checked_at),
  },
  {
    // docs/curation.md#round-runbook step 5b. FAIL rather than WARN: native_region powers a live filter
    // (lib/native-to-me.ts), the pass costs nothing to run (GBIF plus a local
    // geojson, no Claude call), and Trefle conflates native with introduced
    // range — the failure this guard exists to catch is a plant tagged with
    // exactly the range it was introduced into.
    step: 'cross-check-native-region',
    evidence: 'native_region_checked_at NOT NULL',
    level: 'FAIL',
    // Same live filter as the step it audits, and this one catches the plant
    // tagged with the range it was INTRODUCED into.
    obligation: 'catalog',
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
    // Care Tips v2 is live and reads seasonal_care[currentStage]; without it a
    // plant shows no tip at all.
    obligation: 'catalog',
    ran: (p) => nonEmpty(p.seasonal_care),
  },
  {
    // Hardiness is PARKED (docs/curation.md#hardiness) — it feeds only a dormant survive-winter
    // bullet, so a round does not owe it. Drafting a rating per round for a
    // feature nobody can see is a paid step that buys a warning symbol.
    // When that work resumes: perRound true and level FAIL, in one change.
    step: 'draft-hardiness',
    evidence: 'hardiness_rating NOT NULL',
    level: 'WARN',
    perRound: false,
    // THE ONLY `forward` STEP IN THE REGISTRY TODAY, and worth stating plainly
    // because a lone entry looks like an oversight.
    //
    // NOT because the display gate is stuck false — checked 2026-08-17 and it
    // is not: `catalog-state.ts:185` counts 267 rows with
    // `hardiness_verified = true`, from the July 2026 verification pass. The
    // 2026-08-14 audit said "zero writers, so the gate is permanently false",
    // and that was carried into the plan for this work as the justification.
    // It is untrue, and it would have been read as evidence.
    //
    // The real reason is that no rendering path reaches these columns.
    // `lib/hardiness.ts` formats a rating and **nothing imports it** — zero
    // importers across lib/, app/, components/ and server/. The survive-winter
    // bullet that DOES render (`lib/good-for-your-garden.ts:59-72`) reads
    // `hardiness_zone_min` / `hardiness_zone_max` against the garden's zone:
    // different columns, USDA rather than RHS. So an old plant with no
    // `hardiness_rating` is invisible to a reader because the module that would
    // show it is wired to nothing.
    //
    // WHAT FLIPS THIS TO `catalog`: the day `lib/hardiness.ts` gains an
    // importer. FORWARD_STEP_WITNESSES asserts exactly that, because a column
    // scan cannot see it — the module names its columns only in prose.
    obligation: 'forward',
    ran: (p) => Boolean(p.hardiness_rating),
  },
  {
    // NOT per round since 2026-07-29. curate-plants tags new seeds using the
    // SAME tightened definitions (both import lib/style-tags.ts), so running
    // this over a fresh batch re-asks a question already answered correctly.
    // It remains the repair pass for rows drafted under the loose
    // pre-July-28 prompt — the ones that put cottage on 89.6% of the catalog.
    // Round close still owes this stamp: since 2026-08-14 (trap 26) it is
    // part of curate-plants' evidence above.
    step: 'curate-styles',
    evidence: 'style_checked_at NOT NULL',
    level: 'FAIL',
    perRound: false,
    // `perRound: false` and `obligation: 'catalog'` together, which reads odd
    // and is exactly the case the two axes exist to separate: a ROUND does not
    // owe this step (curate-plants already tags new seeds from the same
    // definitions), and every ROW in the catalog still owes the STANDARD.
    // style_tags drives the Explore filter and the gap test that picks a
    // round's theme.
    obligation: 'catalog',
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
    // now carries that, and the stamp is what proves it — and since
    // 2026-08-14 round close checks it, as part of curate-plants' evidence.
    step: 'curate-greenery',
    evidence: 'greenery_checked_at NOT NULL',
    level: 'FAIL',
    perRound: false,
    // Same split as curate-styles above. is_greenery is the ONLY way into the
    // Explore Green bucket and defaults to false, so an unjudged plant is
    // silently missing from a live filter.
    obligation: 'catalog',
    stampColumn: 'greenery_checked_at',
    ran: (p) => Boolean(p.greenery_checked_at),
  },
  {
    // WARN, not FAIL: the vision pick is a separate costed Batch API flow
    // (docs/curation.md#hero-images, docs/curation.md#wikimedia-attribution),
    // deliberately not part of the per-round cadence, and
    // PlantImage falls back to a placeholder. Visible so a round cannot
    // quietly ship without one, but it should not redden every round.
    step: 'pick-plant-images',
    evidence: 'image_checked_at NOT NULL',
    level: 'WARN',
    // WARN and `catalog` together, the other instructive pairing: the pick is
    // off the per-round cadence and a placeholder covers a miss, so it should
    // not redden a round — but the hero photo is the most looked-at thing on
    // the page, so every row owes it.
    obligation: 'catalog',
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
    // Answers whether the photograph shows the species it claims. Getting that
    // wrong is a reader looking at the wrong plant.
    obligation: 'catalog',
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
    // THE CASE THE AXIS WAS DEFINED AGAINST, so the reasoning lives here rather
    // than only in the interface above.
    //
    // Nothing reads `is_curated` anywhere under app/, components/ or hooks/,
    // and no query filters on it. By the obvious test — "does anything read the
    // column?" — this is `forward`, and ~504 never-judged rows are finished.
    //
    // That answer is wrong, and expensively so. The pass this stamp records
    // REWRITES descriptions that miss the bar in lib/editorial-standard.ts, at
    // 30/50, 29/50 and 17/28 on rounds 9, 10 and 12 — about 60% — and holds
    // rows whose photograph cannot be confirmed as the species. Declaring those
    // rows done would have left roughly 250 descriptions on the site that had
    // never been read against the standard. The flag is invisible; the copy and
    // the photographs are the two things a reader looks at hardest.
    obligation: 'catalog',
    stampColumn: 'editorial_checked_at',
    ran: (p) => Boolean(p.editorial_checked_at),
  },
]

/**
 * The bookkeeping columns some step claims. `verify-round` compares this
 * against the columns that actually exist on `plants`.
 */
/**
 * The columns `roundStatus` actually fetches — exported so a test can hold it
 * to `STEP_DEFS` rather than trusting that they agree.
 *
 * TRAP 36. This was an inline string in the query, and `common_name_checked_at`
 * was missing from it for the whole life of the step. Nothing caught it from
 * either side: `StatusRow` DECLARES the field, so `ran: (p) =>
 * Boolean(p.common_name_checked_at)` typechecks and reads `undefined` on every
 * row; PostgREST does not complain about a column you simply did not ask for.
 * The step was therefore undetectable as done, and `run-round` would have
 * re-run and re-billed it every round forever.
 *
 * A projection is a string, so it is the one part of a typed query the compiler
 * cannot see into. Anything a step reads has to be listed here AND asserted.
 */
export const STATUS_PROJECTION =
  'id, scientific_name, ai_drafted_at, native_region, ' +
  'common_name_checked_at, ' +
  'botanical_checked_at, native_checked_at, native_region_checked_at, ' +
  'hardiness_rating, seasonal_care, ' +
  'style_checked_at, greenery_checked_at, image_checked_at, ' +
  'image_pick_confidence, image_verified_at, ' +
  'editorial_checked_at'

export function registeredStampColumns(): Set<string> {
  return new Set(
    STEP_DEFS.map((d) => d.stampColumn).filter((c): c is string => Boolean(c))
  )
}

/**
 * Inspect the live DB and report which pipeline steps have run for `ids`.
 *
 * FAIL vs WARN mirrors whether the underlying feature is shipped or parked
 * (hardiness is parked, docs/curation.md#hardiness; everything else is live). The round-8 lesson is
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
      .select(STATUS_PROJECTION)
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
      // The suffix vocabulary lives in ./stamp-columns.ts since 2026-08-16,
      // shared with check-round-scope.ts — which held a DIFFERENT two of the
      // three suffixes. One fact in two homes, each updated by a different
      // migration, and the gap is how native_to_reviewed_at drained unnoticed.
      //
      // A stamp that is deliberately NO step's (a human verdict recorded inside
      // a step) is named with its reason in NOT_A_STEP_STAMP, not excluded by
      // silence — same discipline as the criterion-stamp paragraph above.
      .filter(isStampColumn)
      .filter((c) => !NOT_A_STEP_STAMP[c])
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
