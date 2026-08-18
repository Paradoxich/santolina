/**
 * Botanical fact cross-check — a second, independent Claude pass over
 * AI-drafted plants that fact-checks the first pass's botanical fields:
 * plant_type, hardiness_zone_min/max, sun exposure, bloom_months.
 *
 * The check is BLIND: Claude is given only the species identity (names +
 * family), never the stored values, so it can't be anchored by the first
 * pass's answers. Comparison happens in code with tolerance rules —
 * botanical sources legitimately disagree at the margins, so only
 * meaningful disagreements are flagged.
 *
 * Never EDITS catalog data — output is a terminal report plus a JSON report
 * file for human spot-checking (reports/ is gitignored). The only column it
 * writes is the operational botanical_checked_at stamp (docs/curation.md#botanical-cross-check, migration
 * 20260716120000), recording when each row was checked.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-plants.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-plants.ts --limit 5
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-plants.ts --new-only
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-plants.ts --round 8
 *
 * --round <label> is the preferred post-seed scope: exactly the ids the seed
 * run recorded in rounds/<label>/manifest.json. --new-only scopes to rows
 * never checked before (botanical_checked_at IS NULL), which is only a batch
 * once the rest of the catalog is stamped — see the parseRound note below for
 * why that baseline does not exist. Default re-checks (and re-stamps) the
 * whole is_curated = false catalog.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import {
  requireScope,
  scopeIds,
  describeScope,
  scopeGuard,
  requireReasonForAll,
} from './scope'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import type { DbPlant, PlantType } from '../lib/plants-db'
import { fetchAllRows } from '../lib/paginate'
import { readRoundManifest } from './round-manifest'
import { withRunRecord } from './run-provenance'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// 2s between Claude calls — same pacing as curate-plants.ts
const INTER_PLANT_DELAY_MS = 2000

// Part of the recipe, not an implementation detail: a decoding parameter change
// is a recipe change, so it is read from one place and hashed from that place.
const MAX_TOKENS = 512

const PLANT_TYPES: PlantType[] = [
  'annual',
  'perennial',
  'biennial',
  'shrub',
  'tree',
  'grass',
  'climber',
  'succulent',
  'bulb',
]

const SUN_VALUES = ['full_sun', 'partial_sun', 'shade'] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrossCheckResponse {
  plant_type?: PlantType | null
  hardiness_zone_min?: number | null
  hardiness_zone_max?: number | null
  sun_requirements?: Array<(typeof SUN_VALUES)[number]>
  bloom_months?: number[]
}

type Severity = 'disagree' | 'minor'

interface Flag {
  field: string
  severity: Severity
  stored: unknown
  checked: unknown
  detail: string
}

interface PlantReport {
  id: string
  common_name: string
  scientific_name: string | null
  flags: Flag[]
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseLimit(): number | null {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--limit')
  const limitArg = idx >= 0 ? args[idx + 1] : undefined
  const limit = limitArg ? parseInt(limitArg, 10) : null
  if (limit !== null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('--limit must be a positive integer')
  }
  return limit
}

// --round <label> scopes the check to exactly the ids a seed run recorded in
// rounds/<label>/manifest.json.
//
// WHY this exists alongside --new-only. --new-only is state-based
// (botanical_checked_at IS NULL), which only narrows to the fresh batch once
// every OTHER row already carries a stamp. That baseline was never
// established: the stamp column shipped mid-history and the rows seeded before
// it were never backfilled, so at round 8 the catalog held 494 unstamped rows
// and `--new-only` selected all 595 — silently re-billing the whole catalog,
// the exact waste the runbook warns about. Manifest scoping doesn't depend on
// a baseline, which is what manifests were introduced for: nothing downstream
// should have to infer "this round's plants".
//
// Backfilling the 494 was considered and rejected: there is no per-row
// evidence they were ever checked, and stamping them on an assumption would
// hide any genuinely unchecked plant from this guard permanently.
function parseRound(): string | null {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--round')
  if (idx < 0) return null
  const label = args[idx + 1]
  if (!label || label.startsWith('--')) {
    throw new Error('--round requires a label, e.g. --round 8')
  }
  return label
}

// --new-only restricts the check to rows this guard has never checked —
// botanical_checked_at IS NULL. State-based, so it's exact (no UTC-midnight
// batch split) and resumable (a killed run leaves the rest unstamped for the
// next pass). Replaced an earlier newest-calendar-day heuristic. Default (no
// flag) re-checks and re-stamps the whole is_curated = false catalog — the way
// to re-run after a prompt revision, or filter by date on the column.

// Stamp a row as botanically checked. Operational metadata only — never
// touches a catalog field, so the flags-only rule (docs/curation.md#botanical-cross-check) holds.
/**
 * The id to stamp, refusing if it is outside the active scope.
 *
 * A guard is set up in main() and consumed here, so the module-level indirection
 * is deliberate: the check has to sit ON the write, not near it.
 */
let activeGuard: ((id: string) => void) | null = null
function guardStampTarget(id: string): string {
  activeGuard?.(id)
  return id
}

async function stampChecked(id: string): Promise<void> {
  const db = getSupabaseAdmin()
  const { error } = await db
    .from('plants')
    .update({ botanical_checked_at: new Date().toISOString() })
    .eq('id', guardStampTarget(id))
  if (error) throw new Error(`Failed to stamp ${id}: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Claude call — blind: species identity only, no stored values
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  'You are a botanical fact-checker. Respond with ONLY valid JSON, no markdown, no code fences, no preamble, no explanation.'

/**
 * A row used ONLY to render the template for the recipe hash — never sent.
 *
 * FULLY POPULATED, which is the opposite of curate-plants' empty probe and for
 * the same reason. The rule is "render the MAXIMAL template, so every optional
 * instruction is present and a change to any of them moves the hash". There,
 * `buildPrompt` branches on what is MISSING, so an empty row takes every branch.
 * Here it branches on what is PRESENT — the scientific name and family lines are
 * omitted when absent — so an empty row would render the minimal template and
 * hide two of the three identity lines from the recipe.
 */
const RECIPE_PROBE_ROW = {
  id: 'recipe-probe',
  common_name: 'probe',
  scientific_name: 'Probe probe',
  family: 'Probeaceae',
} as DbPlant

function buildPrompt(plant: DbPlant): string {
  const identity = [
    `common name: ${plant.common_name}`,
    plant.scientific_name ? `scientific name: ${plant.scientific_name}` : '',
    plant.family ? `family: ${plant.family}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return `You are a botanical fact-checker. For the garden plant below, state its botanical facts from your own knowledge. Classify the base species, not cultivars.

${identity}

Respond with a JSON object:
{
  "plant_type": one of ${JSON.stringify(PLANT_TYPES)},
  "hardiness_zone_min": integer USDA zone 1-13, or null if plant_type is "annual",
  "hardiness_zone_max": integer USDA zone 1-13, or null if plant_type is "annual",
  "sun_requirements": subset of ${JSON.stringify(SUN_VALUES)} the species tolerates,
  "bloom_months": array of integers 1-12 (Jan=1) for the species' typical bloom period; [] if it does not flower notably
}`
}

async function getCheckFromClaude(plant: DbPlant): Promise<CrossCheckResponse> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(plant) }],
  })

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned) as CrossCheckResponse
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`)
  }
}

// ---------------------------------------------------------------------------
// Comparison — tolerance rules, since botanical sources disagree at margins
// ---------------------------------------------------------------------------

/**
 * The exposures a row actually records, and whether they come from the split.
 *
 * `sun_thrives ∪ sun_tolerates` is the truth about what a person edited.
 * `sun_requirements` is the trigger's recomputation of it, and is the ONLY
 * thing a row predating migration 20260709220000 has — that migration says so:
 * rows with both source fields empty keep their existing mirror.
 */
export function storedSunExposures(plant: DbPlant): {
  exposures: string[]
  split: boolean
} {
  const thrives = plant.sun_thrives ?? []
  const tolerates = plant.sun_tolerates ?? []
  if (thrives.length || tolerates.length)
    return { exposures: [...new Set([...thrives, ...tolerates])], split: true }
  return { exposures: plant.sun_requirements ?? [], split: false }
}

/** Exported as a seam: the flags are the artefact, and untestable inline. */
export function comparePlant(
  plant: DbPlant,
  check: CrossCheckResponse
): Flag[] {
  const flags: Flag[] = []

  // plant_type: exact match expected
  if (
    plant.plant_type &&
    check.plant_type &&
    plant.plant_type !== check.plant_type
  ) {
    flags.push({
      field: 'plant_type',
      severity: 'disagree',
      stored: plant.plant_type,
      checked: check.plant_type,
      detail: 'classification mismatch',
    })
  }

  // hardiness zones: ±1 zone is within normal source disagreement.
  // Annuals legitimately have null zones on both sides.
  const bothAnnual =
    plant.plant_type === 'annual' && check.plant_type === 'annual'
  if (!bothAnnual) {
    for (const field of ['hardiness_zone_min', 'hardiness_zone_max'] as const) {
      const stored = plant[field]
      const checked = check[field]
      if (stored == null && checked == null) continue
      if (stored == null || checked == null) {
        flags.push({
          field,
          severity: 'minor',
          stored,
          checked,
          detail: 'one side has no value',
        })
        continue
      }
      const diff = Math.abs(Number(stored) - Number(checked))
      if (diff >= 2) {
        flags.push({
          field,
          severity: 'disagree',
          stored,
          checked,
          detail: `${diff} zones apart`,
        })
      }
    }
  }

  // SUN: compared as sets, and reported against the fields a person can edit.
  //
  // WHY NOT sun_requirements, WHICH IS WHAT THE MODEL IS ASKED FOR. That column
  // is a DERIVED mirror — migration 20260709220000 made it `sun_thrives ∪
  // sun_tolerates`, recomputed by a BEFORE trigger — so a flag naming it is a
  // flag nobody can act on: a write to it is recomputed away, and the one
  // consumer that ever tried, apply-sun-widening, was non-convergent for
  // exactly that reason and is now archived. The comparison itself was always
  // sound; the model is asked for everything the species accepts, which IS the
  // union. Only the address was wrong.
  const stored = storedSunExposures(plant)
  const checkedSun = check.sun_requirements ?? []
  if (stored.exposures.length && checkedSun.length) {
    const checkedSet = new Set<string>(checkedSun)
    const overlap = stored.exposures.filter((s) => checkedSet.has(s))
    const payload = stored.split
      ? { sun_thrives: plant.sun_thrives, sun_tolerates: plant.sun_tolerates }
      : { sun_requirements: plant.sun_requirements }
    // A row whose source fields are both empty predates the split and still
    // carries only the mirror. Saying so is the remedy: it has to be split
    // before either flag below can be acted on at all.
    const unsplit = stored.split
      ? ''
      : ' (row predates the sun split — its source fields are empty, so split it first)'

    if (!overlap.length) {
      // No overlap contradicts the recorded exposures outright, and nothing
      // here can tell which of the two fields carries the error.
      flags.push({
        field: 'sun_thrives+sun_tolerates',
        severity: 'disagree',
        stored: payload,
        checked: checkedSun,
        detail: `no overlap${unsplit}`,
      })
    } else {
      const storedSubsetOfChecked = stored.exposures.every((s) =>
        checkedSet.has(s)
      )
      const widened =
        storedSubsetOfChecked && checkedSun.length > stored.exposures.length
      if (widened) {
        // Accepting more than is recorded is under-reported TOLERANCE by the
        // migration's own definition — sun_thrives is where it performs best,
        // sun_tolerates is what it additionally accepts. That names one field,
        // and curate-sun-tolerance is the pass that writes it.
        flags.push({
          field: 'sun_tolerates',
          severity: 'disagree',
          stored: payload,
          checked: checkedSun,
          detail: `stored range narrower than check (under-reported tolerance — curate-sun-tolerance writes this field)${unsplit}`,
        })
      } else if (
        stored.exposures.length !== checkedSun.length ||
        overlap.length !== stored.exposures.length
      ) {
        flags.push({
          field: 'sun_thrives+sun_tolerates',
          severity: 'minor',
          stored: payload,
          checked: checkedSun,
          detail: `partial overlap${unsplit}`,
        })
      }
    }
  }

  // bloom_months: compared as sets. Both non-empty with no shared month →
  // disagree; window boundaries drifting > 1 month → minor. One side empty
  // while the other blooms → minor (foliage vs bloom judgment call).
  const storedBloom = plant.bloom_months ?? []
  const checkedBloom = check.bloom_months ?? []
  if (storedBloom.length && checkedBloom.length) {
    const shared = storedBloom.filter((m) => checkedBloom.includes(m))
    if (!shared.length) {
      flags.push({
        field: 'bloom_months',
        severity: 'disagree',
        stored: storedBloom,
        checked: checkedBloom,
        detail: 'no shared months',
      })
    } else {
      const minDrift = Math.abs(
        Math.min(...storedBloom) - Math.min(...checkedBloom)
      )
      const maxDrift = Math.abs(
        Math.max(...storedBloom) - Math.max(...checkedBloom)
      )
      if (minDrift > 1 || maxDrift > 1) {
        flags.push({
          field: 'bloom_months',
          severity: 'minor',
          stored: storedBloom,
          checked: checkedBloom,
          detail: `window boundaries drift ${Math.max(minDrift, maxDrift)} month(s)`,
        })
      }
    }
  } else if (storedBloom.length !== checkedBloom.length) {
    flags.push({
      field: 'bloom_months',
      severity: 'minor',
      stored: storedBloom,
      checked: checkedBloom,
      detail: 'one side reports no bloom',
    })
  }

  return flags
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function pad(n: number, width = 3): string {
  return String(n).padStart(width, ' ')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const limit = parseLimit()
  const newOnly = process.argv.slice(2).includes('--new-only')
  const roundLabel = parseRound()
  const db = getSupabaseAdmin()

  // --round is the exact scope: the ids the seed run recorded. Prefer it to
  // --new-only whenever a manifest exists, because --new-only's state guard
  // only narrows to a batch once the REST of the catalog carries a stamp, and
  // rows seeded before the stamp column shipped never got backfilled (see the
  // --round note in this file's header).
  // Scope is MANDATORY (scripts/scope.ts). It used to be optional here, with
  // `--new-only` as the fallback — and `--new-only` is a state predicate, not
  // a scope, so a run without --round quietly reached every unstamped plant in
  // the catalog and billed for it.
  const scope = requireScope(
    'cross-check-plants',
    'This guard bills Claude a blind second-opinion call per plant. An unscoped run re-checks the whole catalog, which is what every round did before the stamp baseline was backfilled.'
  )
  const roundIds = scopeIds(scope)
  const whyAll = requireReasonForAll(scope)
  activeGuard = scopeGuard(scope, roundIds)
  console.log(`\n${describeScope(scope, roundIds)}`)
  if (whyAll) console.log(`Whole-catalog run, because: ${whyAll}`)

  console.log('\nFetching AI-drafted plants from Supabase...')
  const data = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let q = db.from('plants').select('*').not('ai_drafted_at', 'is', null)
    if (newOnly) q = q.is('botanical_checked_at', null)
    if (roundIds) q = q.in('id', roundIds)
    return q.order('id').range(from, to)
  })

  const plants = (limit ? data.slice(0, limit) : data) as unknown as DbPlant[]

  // withRunRecord owns the terminal paths: finalisation on return, on throw and
  // on markFailed, so the record does not depend on this file's control flow
  // staying correct. The "nothing to check" case is INSIDE the body on purpose —
  // it is a real invocation whose honest row_count is 0, and the earlier
  // process.exit(0) there would have skipped finalisation entirely.
  const outcome = await withRunRecord(
    {
      step: 'cross-check-plants',
      // Flags-only by contract: the ONLY column this guard writes is its own
      // operational stamp. It is window-queryable, so the default evidence —
      // botanical_checked_at witnessing itself — is the right witness.
      writeSet: ['botanical_checked_at'],
      scope: describeScope(scope, roundIds),
      recipe: {
        model: CURATION_MODEL,
        // Both halves of the assembled prompt. The system prompt is constant
        // across rows and shapes the output, so it is recipe, not plumbing.
        template: [SYSTEM_PROMPT, buildPrompt(RECIPE_PROBE_ROW)],
        // The two vocabularies the template interpolates. They are already
        // inside the rendered template above; naming them here means a future
        // reader sees WHICH constants the cohort depended on without diffing
        // the prompt.
        ingredients: { plant_types: PLANT_TYPES, sun_values: SUN_VALUES },
        decoding: { max_tokens: MAX_TOKENS },
      },
    },
    async (run) => {
      if (!plants.length) {
        console.log('No AI-drafted plants found — nothing to check.')
        return null
      }

      console.log(`\nCross-checking ${plants.length} plant(s)...\n`)

      const reports: PlantReport[] = []
      const failures: Array<{ name: string; error: string }> = []
      let clean = 0
      let stamped = 0

      for (const [i, plant] of plants.entries()) {
        const label = plant.scientific_name ?? plant.common_name
        const prefix = `[${pad(i + 1)}/${pad(plants.length)}]`

        try {
          process.stdout.write(`${prefix} ${label} … `)
          const check = await getCheckFromClaude(plant)
          const flags = comparePlant(plant, check)

          if (flags.length) {
            reports.push({
              id: plant.id,
              common_name: plant.common_name,
              scientific_name: plant.scientific_name,
              flags,
            })
            const summary = flags
              .map((f) => `${f.severity === 'disagree' ? '✗' : '~'} ${f.field}`)
              .join(', ')
            console.log(`⚠  ${summary}`)
          } else {
            clean++
            console.log('✓')
          }

          // Stamp only after a successful check (flagged or clean — both mean the
          // guard ran on this row). A row that threw stays unstamped, so --new-only
          // picks it up on the next run.
          await stampChecked(plant.id)
          // Counted only after the write returned, so an interrupted run's count
          // is what it actually got through rather than what it attempted.
          run.wrote(plant.id)
          stamped++
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.log(`✗  ${message}`)
          failures.push({ name: label, error: message })
        }

        if (i < plants.length - 1) await sleep(INTER_PLANT_DELAY_MS)
      }

      // A pass where every row errored is a failure even though nothing threw.
      if (failures.length && !stamped) {
        run.markFailed(`all ${failures.length} row(s) failed`)
      }
      return { reports, failures, clean }
    }
  )

  // Nothing to check: the run recorded a vacuous invocation and there is no
  // report to write.
  if (!outcome) return
  const { reports, failures, clean } = outcome

  // Terminal report — disagreements first
  const disagreements = reports.filter((r) =>
    r.flags.some((f) => f.severity === 'disagree')
  )
  const minorOnly = reports.filter(
    (r) => !r.flags.some((f) => f.severity === 'disagree')
  )

  console.log('\n─────────────────────────────────────────────────────────────')
  console.log(
    `Cross-check complete: ${clean} clean, ${disagreements.length} with disagreements, ` +
      `${minorOnly.length} with minor drift only, ${failures.length} failed`
  )

  if (disagreements.length) {
    console.log('\nDISAGREEMENTS — spot-check these:')
    for (const r of disagreements) {
      console.log(`\n  ${r.scientific_name ?? r.common_name}`)
      for (const f of r.flags) {
        const marker = f.severity === 'disagree' ? '✗' : '~'
        console.log(
          `    ${marker} ${f.field}: stored ${JSON.stringify(f.stored)} vs checked ${JSON.stringify(f.checked)} (${f.detail})`
        )
      }
    }
  }

  if (minorOnly.length) {
    console.log('\nMinor drift (likely fine, listed for completeness):')
    for (const r of minorOnly) {
      const fields = r.flags.map((f) => f.field).join(', ')
      console.log(`  ~ ${r.scientific_name ?? r.common_name}: ${fields}`)
    }
  }

  // JSON report for later review
  const reportsDir = join(__dirname, '..', 'reports')
  mkdirSync(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const reportPath = join(reportsDir, `cross-check-${stamp}.json`)
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        ran_at: new Date().toISOString(),
        model: CURATION_MODEL,
        checked: plants.length,
        clean,
        flagged: reports,
        failures,
      },
      null,
      2
    )
  )
  console.log(`\nFull report written to ${reportPath}`)

  if (failures.length) {
    console.log('\nFailed plants:')
    for (const { name, error } of failures) console.log(`  • ${name}: ${error}`)
    process.exit(1)
  }
}

// Only when invoked, so comparePlant can be imported and asserted. The seam is
// the point: a finding you cannot call is a finding you cannot pin. Same shape
// as run-ci-checks.ts, and the reason editorial-report.ts was split out at all.
if (require.main === module) {
  main().catch((err) => {
    console.error('Unexpected error:', err)
    process.exit(1)
  })
}
