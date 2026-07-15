/**
 * Post-round invariant checker — the canonical definition of catalog
 * correctness. Asserts the DB state the docs/architecture.md §25 cadence is
 * supposed to leave behind, instead of trusting that every step was run:
 *
 *   FAIL (exit 1) — the round is not done:
 *     · every plant has ai_drafted_at (curation ran to completion)
 *     · every non-hybrid plant has a non-empty native_region (regeneration ran)
 *     · every bloom_color value is mapped in lib/bloom-colors.ts
 *     · no duplicate scientific_name (the cultivar-collision trap)
 *     · required curation fields non-null on drafted rows
 *     · sun_thrives non-empty and disjoint from sun_tolerates
 *     · every plant has ≥1 combination; no self/duplicate/reversed-duplicate
 *       pairs; nobody over the 5-companion cap
 *
 *   WARN (exit 0) — known gaps, reported so they stay visible:
 *     · seasonal_care null (separate distillation track, not yet user-facing)
 *     · hardiness_rating null (track parked)
 *     · image_url null (PlantImage placeholder covers it)
 *
 * Read-only, no AI calls — cheap enough to run after every round.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/verify-round.ts
 */

import { IGNORED_BLOOM_COLORS, RAW_TO_BUCKET } from '../lib/bloom-colors'
import { getSupabaseAdmin } from '../lib/supabase-admin'

const COMPANION_CAP = 5

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  ai_drafted_at: string | null
  native_region: string[] | null
  bloom_color: string[] | null
  plant_type: string | null
  plant_type_label: string | null
  style_tags: string[] | null
  space_types: string[] | null
  description: string | null
  care_level: string | null
  seasonal_rhythm: unknown
  seasonal_care: unknown
  sun_thrives: string[] | null
  sun_tolerates: string[] | null
  hardiness_rating: string | null
  image_url: string | null
}

interface ComboRow {
  plant_id_a: string
  plant_id_b: string
}

interface Finding {
  level: 'FAIL' | 'WARN'
  check: string
  detail: string
}

// Required on every AI-drafted row. description/care_level/seasonal_rhythm
// are core product surfaces; the array fields feed Explore filters and
// placement. bloom_months/bloom_color stay out — legitimately null on
// foliage/evergreen plants.
const REQUIRED_DRAFTED_FIELDS: Array<keyof PlantRow> = [
  'plant_type',
  'plant_type_label',
  'style_tags',
  'space_types',
  'description',
  'care_level',
  'seasonal_rhythm',
]

// Garden hybrids (Cistus × purpureus, Calamagrostis × acutiflora, …) have no
// wild native range; an empty native_region is correct for them. Trefle
// sometimes stores a hybrid's name without the × marker, so known cases are
// exempted by name.
const KNOWN_HYBRID_EXEMPTIONS = new Set(['cistus purpureus'])

function isHybrid(scientificName: string | null): boolean {
  if (!scientificName) return false
  if (KNOWN_HYBRID_EXEMPTIONS.has(scientificName.trim().toLowerCase()))
    return true
  return scientificName.includes('×') || / x /i.test(scientificName)
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return false
}

async function fetchAllPlants(): Promise<PlantRow[]> {
  const db = getSupabaseAdmin()
  const pageSize = 1000
  const rows: PlantRow[] = []
  const columns =
    'id, common_name, scientific_name, ai_drafted_at, native_region, ' +
    'bloom_color, plant_type, plant_type_label, style_tags, space_types, ' +
    'description, care_level, seasonal_rhythm, seasonal_care, sun_thrives, ' +
    'sun_tolerates, hardiness_rating, image_url'
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('plants')
      .select(columns)
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to fetch plants: ${error.message}`)
    rows.push(...((data ?? []) as unknown as PlantRow[]))
    if (!data || data.length < pageSize) return rows
  }
}

async function fetchAllCombos(): Promise<ComboRow[]> {
  const db = getSupabaseAdmin()
  const pageSize = 1000
  const rows: ComboRow[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('plant_combinations')
      .select('plant_id_a, plant_id_b')
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to fetch combinations: ${error.message}`)
    rows.push(...((data ?? []) as ComboRow[]))
    if (!data || data.length < pageSize) return rows
  }
}

function checkPlants(plants: PlantRow[]): Finding[] {
  const findings: Finding[] = []

  for (const p of plants) {
    if (!p.ai_drafted_at) {
      findings.push({
        level: 'FAIL',
        check: 'ai_drafted_at',
        detail: `${p.common_name} — never curated (run curate-plants --new-only)`,
      })
      // Required-field checks only apply to drafted rows
    } else {
      for (const field of REQUIRED_DRAFTED_FIELDS) {
        if (isEmpty(p[field])) {
          findings.push({
            level: 'FAIL',
            check: `required field: ${field}`,
            detail: `${p.common_name} — drafted but ${field} is empty`,
          })
        }
      }
    }

    if (isEmpty(p.native_region) && !isHybrid(p.scientific_name)) {
      findings.push({
        level: 'FAIL',
        check: 'native_region',
        detail: `${p.common_name} — empty (run regenerate-native-region)`,
      })
    }

    for (const raw of p.bloom_color ?? []) {
      const value = raw.toLowerCase()
      if (!RAW_TO_BUCKET[value] && !IGNORED_BLOOM_COLORS.has(value)) {
        findings.push({
          level: 'FAIL',
          check: 'bloom_color mapping',
          detail: `${p.common_name} — "${raw}" not in lib/bloom-colors.ts`,
        })
      }
    }

    if (isEmpty(p.sun_thrives)) {
      findings.push({
        level: 'FAIL',
        check: 'sun_thrives',
        detail: `${p.common_name} — empty`,
      })
    } else {
      const tolerates = new Set(p.sun_tolerates ?? [])
      const overlap = (p.sun_thrives ?? []).filter((s) => tolerates.has(s))
      if (overlap.length) {
        findings.push({
          level: 'FAIL',
          check: 'sun overlap',
          detail: `${p.common_name} — ${overlap.join(', ')} in both thrives and tolerates`,
        })
      }
    }

    if (isEmpty(p.seasonal_care)) {
      findings.push({
        level: 'WARN',
        check: 'seasonal_care',
        detail: `${p.common_name} — not yet distilled`,
      })
    }
    if (!p.hardiness_rating) {
      findings.push({
        level: 'WARN',
        check: 'hardiness_rating',
        detail: `${p.common_name} — unrated (track parked)`,
      })
    }
    if (!p.image_url) {
      findings.push({
        level: 'WARN',
        check: 'image_url',
        detail: `${p.common_name} — placeholder in use`,
      })
    }
  }

  // Duplicate scientific names — the catalog is keyed on species, so two rows
  // sharing one scientific_name means a seed collision (the round-7 trap).
  const byName = new Map<string, string[]>()
  for (const p of plants) {
    if (!p.scientific_name) continue
    const key = p.scientific_name.trim().toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), p.common_name])
  }
  for (const [name, carriers] of byName) {
    if (carriers.length > 1) {
      findings.push({
        level: 'FAIL',
        check: 'duplicate scientific_name',
        detail: `"${name}" — ${carriers.join(' / ')}`,
      })
    }
  }

  return findings
}

function checkCombos(plants: PlantRow[], combos: ComboRow[]): Finding[] {
  const findings: Finding[] = []
  const nameById = new Map(plants.map((p) => [p.id, p.common_name]))
  const label = (id: string) => nameById.get(id) ?? id

  const seenPairs = new Map<string, number>()
  const counts = new Map<string, number>()

  for (const c of combos) {
    if (c.plant_id_a === c.plant_id_b) {
      findings.push({
        level: 'FAIL',
        check: 'self pair',
        detail: `${label(c.plant_id_a)} paired with itself`,
      })
      continue
    }
    const key = [c.plant_id_a, c.plant_id_b].sort().join('|')
    seenPairs.set(key, (seenPairs.get(key) ?? 0) + 1)
    counts.set(c.plant_id_a, (counts.get(c.plant_id_a) ?? 0) + 1)
    counts.set(c.plant_id_b, (counts.get(c.plant_id_b) ?? 0) + 1)
  }

  for (const [key, n] of seenPairs) {
    if (n > 1) {
      const [a, b] = key.split('|') as [string, string]
      findings.push({
        level: 'FAIL',
        check: 'duplicate pair',
        detail: `${label(a)} ↔ ${label(b)} appears ${n}×`,
      })
    }
  }

  for (const p of plants) {
    const n = counts.get(p.id) ?? 0
    if (n === 0) {
      findings.push({
        level: 'FAIL',
        check: 'no combinations',
        detail: `${p.common_name} — 0 companions (run curate-combinations)`,
      })
    } else if (n > COMPANION_CAP) {
      findings.push({
        level: 'FAIL',
        check: 'over companion cap',
        detail: `${p.common_name} — ${n} companions (cap ${COMPANION_CAP})`,
      })
    }
  }

  return findings
}

function report(findings: Finding[], group: 'FAIL' | 'WARN'): void {
  const grouped = new Map<string, string[]>()
  for (const f of findings) {
    if (f.level !== group) continue
    grouped.set(f.check, [...(grouped.get(f.check) ?? []), f.detail])
  }
  for (const [check, details] of grouped) {
    console.log(
      `\n${group === 'FAIL' ? '✗' : '⚠'} ${check} — ${details.length}`
    )
    const shown = details.slice(0, 10)
    for (const d of shown) console.log(`    ${d}`)
    if (details.length > shown.length)
      console.log(`    … and ${details.length - shown.length} more`)
  }
}

async function main() {
  console.log('Fetching catalog...')
  const [plants, combos] = await Promise.all([
    fetchAllPlants(),
    fetchAllCombos(),
  ])
  console.log(`${plants.length} plants, ${combos.length} combinations.`)

  const findings = [...checkPlants(plants), ...checkCombos(plants, combos)]
  const fails = findings.filter((f) => f.level === 'FAIL')
  const warns = findings.filter((f) => f.level === 'WARN')

  report(findings, 'FAIL')
  report(findings, 'WARN')

  console.log(
    `\n${fails.length ? '✗' : '✓'} ${fails.length} failure(s), ${warns.length} warning(s).`
  )
  if (fails.length) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
