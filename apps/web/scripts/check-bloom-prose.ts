/**
 * Guard: prose that asserts flowering in a season `bloom_months` does not
 * cover. Never writes.
 *
 * Run it after correcting a scalar, which is when a wrong value has already
 * propagated into the prose. See docs/curation.md#bloom-prose.
 *
 * Usage (from apps/web) — a scope flag is mandatory, see scripts/scope.ts:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-bloom-prose.ts --round 14
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-bloom-prose.ts --ids <a,b,c>
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-bloom-prose.ts --all --why "<reason>"
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { contradictions, seasonsOfMonths } from '../lib/bloom-prose'
import { requireScope, scopeIds, applyScope, describeScope } from './scope'

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  bloom_months: number[] | null
  description: string | null
  seasonal_rhythm: Record<string, string | null> | null
}

/** Words from the plant's own names, so "Autumn sage" is not read as a claim. */
export function nameWords(row: {
  common_name: string
  scientific_name: string | null
}): string[] {
  return `${row.common_name} ${row.scientific_name ?? ''}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
}

async function main() {
  const scope = requireScope(
    'check-bloom-prose',
    'It reads every prose field against bloom_months, and the back catalog ' +
      'carries disagreements no round introduced.'
  )
  const scopeIdList = scopeIds(scope)
  const db = getSupabaseAdmin()

  // Paginated (standing rule 5).
  const rows = await fetchAllRows<PlantRow>((from, to) =>
    applyScope(
      db
        .from('plants')
        .select(
          'id, common_name, scientific_name, bloom_months, description, seasonal_rhythm'
        ),
      scopeIdList
    )
      .order('id')
      .range(from, to)
  )

  console.log(`${describeScope(scope, scopeIdList)} — ${rows.length} row(s).\n`)

  let flagged = 0
  for (const row of rows) {
    if (!row.bloom_months?.length) continue
    const skip = nameWords(row)

    const fields: Array<[string, string]> = []
    if (row.description) fields.push(['description', row.description])
    for (const [stage, text] of Object.entries(row.seasonal_rhythm ?? {})) {
      if (typeof text === 'string' && text.trim())
        fields.push([`seasonal_rhythm.${stage}`, text])
    }

    const hits = fields.flatMap(([field, text]) =>
      contradictions(text, row.bloom_months!, skip).map((season) => ({
        field,
        season,
        text,
      }))
    )
    if (!hits.length) continue

    flagged++
    console.log(
      `${row.common_name} — bloom_months ${JSON.stringify(row.bloom_months)} ` +
        `(${seasonsOfMonths(row.bloom_months).join(', ')})`
    )
    for (const h of hits) {
      console.log(`  [${h.field}] asserts ${h.season}: ${h.text.slice(0, 120)}`)
    }
  }

  console.log(
    flagged === 0
      ? '\n✓ no prose asserts flowering outside its bloom_months.'
      : `\n${flagged} plant(s) where prose and bloom_months disagree. Read each ` +
          `one before writing anything: either half can be wrong, and on ` +
          `2026-08-18 the set of 20 split three ways — scalar too narrow, ` +
          `prose over-claiming a shoulder season, and prose the detector ` +
          `misread. Correcting the scalar on sight would have been a ` +
          `regression on 6 of them.`
  )
  if (flagged > 0) process.exit(1)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
