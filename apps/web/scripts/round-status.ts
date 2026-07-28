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
  /** Step name, matching the §25 runbook order. */
  step: string
  /** How many of the round's plants carry this step's evidence. */
  done: number
  /** How many should (hybrids are excluded where the step can't apply). */
  total: number
  complete: boolean
  /** The DB state that counts as evidence — shown in reports so a reader can verify the claim. */
  evidence: string
  /** Level to report a gap at. Fields that are deliberately parked warn instead of failing. */
  level: 'FAIL' | 'WARN'
}

interface StatusRow {
  id: string
  scientific_name: string | null
  ai_drafted_at: string | null
  native_region: string[] | null
  botanical_checked_at: string | null
  native_checked_at: string | null
  hardiness_rating: string | null
  seasonal_care: unknown
  style_checked_at: string | null
  greenery_checked_at: string | null
  image_checked_at: string | null
}

/** A garden hybrid has no wild range, so an empty native_region is correct. */
const isHybrid = (sci: string | null): boolean =>
  !!sci && (sci.includes('×') || sci.includes(' x '))

const nonEmpty = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined

/**
 * Inspect the live DB and report which pipeline steps have run for `ids`.
 *
 * FAIL vs WARN mirrors whether the underlying feature is shipped or parked
 * (§27 hardiness is parked; everything else is live). The round-8 lesson is
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
          'botanical_checked_at, native_checked_at, hardiness_rating, seasonal_care, ' +
          'style_checked_at, greenery_checked_at, image_checked_at'
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

  const total = plants.length
  const nonHybrid = plants.filter((p) => !isHybrid(p.scientific_name))

  return [
    {
      step: 'curate-plants',
      done: plants.filter((p) => p.ai_drafted_at).length,
      total,
      evidence: 'ai_drafted_at NOT NULL',
      level: 'FAIL',
      complete: plants.every((p) => p.ai_drafted_at),
    },
    {
      step: 'curate-combinations',
      done: plants.filter((p) => paired.has(p.id)).length,
      total,
      evidence: 'appears in plant_combinations',
      level: 'FAIL',
      complete: plants.every((p) => paired.has(p.id)),
    },
    {
      step: 'regenerate-native-region',
      done: nonHybrid.filter((p) => nonEmpty(p.native_region)).length,
      total: nonHybrid.length,
      evidence: 'native_region non-empty (hybrids excluded)',
      level: 'FAIL',
      complete: nonHybrid.every((p) => nonEmpty(p.native_region)),
    },
    {
      step: 'cross-check-plants',
      done: plants.filter((p) => p.botanical_checked_at).length,
      total,
      evidence: 'botanical_checked_at NOT NULL',
      level: 'FAIL',
      complete: plants.every((p) => p.botanical_checked_at),
    },
    {
      step: 'cross-check-native-to',
      done: plants.filter((p) => p.native_checked_at).length,
      total,
      evidence: 'native_checked_at NOT NULL',
      level: 'FAIL',
      complete: plants.every((p) => p.native_checked_at),
    },
    {
      step: 'curate-seasonal-care',
      done: plants.filter((p) => nonEmpty(p.seasonal_care)).length,
      total,
      evidence: 'seasonal_care NOT NULL',
      // Care Tips v2 is LIVE and reads seasonal_care[currentStage], so a plant
      // without it shows no tip at all. This is a shipped feature: FAIL.
      level: 'FAIL',
      complete: plants.every((p) => nonEmpty(p.seasonal_care)),
    },
    {
      step: 'draft-hardiness',
      done: plants.filter((p) => p.hardiness_rating).length,
      total,
      evidence: 'hardiness_rating NOT NULL',
      // §27 hardiness is PARKED — it feeds only a dormant survive-winter
      // bullet. Warn until that work resumes, then promote to FAIL.
      level: 'WARN',
      complete: plants.every((p) => p.hardiness_rating),
    },
    {
      step: 'curate-styles',
      done: plants.filter((p) => p.style_checked_at).length,
      total,
      evidence: 'style_checked_at NOT NULL',
      // The Explore style browse tiles are live. An unjudged row keeps
      // whatever curate-plants drafted under the loose pre-July-28 prompt,
      // which is what put cottage on 89.6% of the catalog.
      level: 'FAIL',
      complete: plants.every((p) => p.style_checked_at),
    },
    {
      step: 'curate-greenery',
      done: plants.filter((p) => p.greenery_checked_at).length,
      total,
      evidence: 'greenery_checked_at NOT NULL',
      // is_greenery is the ONLY way into the Explore Green colour bucket
      // (lib/plant-colors.ts — plain green foliage deliberately never maps).
      // It defaults to false, so an unjudged plant is silently excluded from
      // a live filter rather than flagged. Shipped feature: FAIL.
      level: 'FAIL',
      complete: plants.every((p) => p.greenery_checked_at),
    },
    {
      step: 'pick-plant-images',
      done: plants.filter((p) => p.image_checked_at).length,
      total,
      evidence: 'image_checked_at NOT NULL',
      // WARN, not FAIL: the vision pick is a separate costed Batch API flow
      // (§30/§31), deliberately not part of the per-round cadence, and
      // PlantImage falls back to a placeholder. Visible so a round cannot
      // quietly ship without one, but it should not redden every round.
      level: 'WARN',
      complete: plants.every((p) => p.image_checked_at),
    },
  ]
}

/** One-line-per-step render, used by both the verifier and the log writer. */
export function formatStatus(rows: StepStatus[]): string[] {
  return rows.map((r) => {
    const mark = r.complete ? '✓' : r.level === 'FAIL' ? '✗' : '⚠'
    const count = r.complete ? `${r.total}/${r.total}` : `${r.done}/${r.total}`
    return `${mark} ${r.step.padEnd(26)} ${count.padStart(9)}   ${r.evidence}`
  })
}
