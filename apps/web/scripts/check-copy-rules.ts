/**
 * Copy-rule guard: reports violations of lib/copy-rules.ts across every
 * reader-facing prose field. Never writes.
 *
 * Not a runbook step — a round's own violations are reported by verify-round.
 * See docs/curation.md#copy-rules.
 *
 * Usage (from apps/web) — a scope flag is mandatory, see scripts/scope.ts:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-copy-rules.ts --round 14
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-copy-rules.ts --ids <a,b,c>
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-copy-rules.ts --all --why "<reason>"
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import {
  checkCopy,
  proseOf,
  PROSE_COLUMNS,
  type CopyViolation,
} from '../lib/copy-rules'
import { requireScope, scopeIds, applyScope, describeScope } from './scope'

const SELECT = ['id', 'common_name', ...PROSE_COLUMNS].join(', ')

type PlantRow = Record<string, unknown> & {
  id: string
  common_name: string
}

interface Finding extends CopyViolation {
  plant: string
  field: string
}

async function main() {
  const scope = requireScope(
    'check-copy-rules',
    'The back catalog carries violations no round introduced, so the scope ' +
      "keeps a round's verdict about that round."
  )
  const scopeIdList = scopeIds(scope)
  const supabase = getSupabaseAdmin()

  // Paginated (standing rule 5).
  const rows = await fetchAllRows<PlantRow>((from, to) =>
    applyScope(supabase.from('plants').select(SELECT), scopeIdList)
      .order('id')
      .range(from, to)
  )

  console.log(`${describeScope(scope, scopeIdList)} — ${rows.length} row(s).\n`)

  const findings: Finding[] = []
  for (const row of rows) {
    for (const { field, kind, text } of proseOf(row)) {
      for (const violation of checkCopy(text, kind)) {
        findings.push({ ...violation, plant: row.common_name, field })
      }
    }
  }

  if (findings.length === 0) {
    console.log('✓ every prose field in scope follows the copy rules.')
    return
  }

  // Grouped by rule: that is the unit a fix is applied in.
  const byRule = new Map<string, Finding[]>()
  for (const f of findings) {
    const list = byRule.get(f.rule) ?? []
    list.push(f)
    byRule.set(f.rule, list)
  }

  for (const [rule, list] of [...byRule].sort()) {
    console.log(`\n${rule} — ${list.length}`)
    for (const f of list) {
      console.log(`  ${f.plant} [${f.field}] …${f.match.replace(/\n/g, ' ')}…`)
    }
  }

  console.log(
    `\n✗ ${findings.length} copy-rule violation(s) across ${new Set(findings.map((f) => f.plant)).size} plant(s).`
  )
  process.exit(1)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
