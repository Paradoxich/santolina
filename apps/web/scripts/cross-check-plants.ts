/**
 * Botanical fact cross-check — a second, independent Claude pass over
 * AI-drafted plants that fact-checks the first pass's botanical fields:
 * plant_type, hardiness_zone_min/max, sun_requirements, bloom_months.
 *
 * The check is BLIND: Claude is given only the species identity (names +
 * family), never the stored values, so it can't be anchored by the first
 * pass's answers. Comparison happens in code with tolerance rules —
 * botanical sources legitimately disagree at the margins, so only
 * meaningful disagreements are flagged.
 *
 * NEVER writes to the plants table — output is a terminal report plus a
 * JSON report file for human spot-checking (reports/ is gitignored).
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-plants.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-plants.ts --limit 5
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import type { DbPlant, PlantType } from '../lib/plants-db'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// 2s between Claude calls — same pacing as curate-plants.ts
const INTER_PLANT_DELAY_MS = 2000

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

interface CrossCheckResponse {
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

// ---------------------------------------------------------------------------
// Claude call — blind: species identity only, no stored values
// ---------------------------------------------------------------------------

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
    max_tokens: 512,
    system:
      'You are a botanical fact-checker. Respond with ONLY valid JSON, no markdown, no code fences, no preamble, no explanation.',
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

function comparePlant(plant: DbPlant, check: CrossCheckResponse): Flag[] {
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

  // sun_requirements: compared as sets. No overlap → disagree;
  // different-but-overlapping → minor.
  const storedSun = plant.sun_requirements ?? []
  const checkedSun = check.sun_requirements ?? []
  if (storedSun.length && checkedSun.length) {
    const overlap = storedSun.filter((s) =>
      (checkedSun as string[]).includes(s)
    )
    if (!overlap.length) {
      flags.push({
        field: 'sun_requirements',
        severity: 'disagree',
        stored: storedSun,
        checked: checkedSun,
        detail: 'no overlap',
      })
    } else if (
      storedSun.length !== checkedSun.length ||
      overlap.length !== storedSun.length
    ) {
      flags.push({
        field: 'sun_requirements',
        severity: 'minor',
        stored: storedSun,
        checked: checkedSun,
        detail: 'partial overlap',
      })
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
  const db = getSupabaseAdmin()

  console.log('\nFetching AI-drafted plants from Supabase...')
  const { data, error } = await db
    .from('plants')
    .select('*')
    .not('ai_drafted_at', 'is', null)
    .order('common_name')
  if (error) throw new Error(`Failed to fetch plants: ${error.message}`)

  const plants = (
    limit ? (data ?? []).slice(0, limit) : (data ?? [])
  ) as DbPlant[]
  if (!plants.length) {
    console.log('No AI-drafted plants found — nothing to check.')
    process.exit(0)
  }

  console.log(`\nCross-checking ${plants.length} plant(s)...\n`)

  const reports: PlantReport[] = []
  const failures: Array<{ name: string; error: string }> = []
  let clean = 0

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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`✗  ${message}`)
      failures.push({ name: label, error: message })
    }

    if (i < plants.length - 1) await sleep(INTER_PLANT_DELAY_MS)
  }

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

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
