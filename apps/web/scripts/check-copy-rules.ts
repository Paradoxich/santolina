/**
 * Copy-rule guard — walks every reader-facing prose field in scope and fails
 * (exit 1) on a violation of `lib/copy-rules.ts`. NEVER writes to the DB.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none, deliberately, and this is the honest
 * answer rather than a gap. A round's prose is written by `curate-plants` (2)
 * and `curate-seasonal-care` (7), and a guard that runs after them reports a
 * violation the round has already paid to create. So this is the guard you run
 * against a round before signing it off, the same cadence as
 * `check-bloom-colors.ts`:
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-copy-rules.ts --round 14
 *
 * WHAT ENDS IT: nothing. It is a standing guard, like the colour one — every
 * seed round invents new prose, and a rule with no check is a rule that decays
 * to a preference.
 *
 * Usage (from apps/web) — a scope flag is mandatory, see scripts/scope.ts:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-copy-rules.ts --round 14
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-copy-rules.ts --ids <a,b,c>
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-copy-rules.ts --all --why "<reason>"
 *
 * THE CATALOG IS NOT CLEAN TODAY and the whole-catalog run says so: 52
 * violations across 780 rows when this was written (2026-08-18), every one of
 * them written before any field but seasonal_care was guarded. That is why the
 * scope flag is mandatory rather than defaulted to --all — a guard that is red
 * on arrival gets skipped, and a round can be held to a rule the back catalog
 * has not been swept for yet.
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
    'It reads the whole of every prose field, and the back catalog carries ' +
      'violations no round introduced. Naming the scope is what keeps a ' +
      "round's verdict about that round."
  )
  const scopeIdList = scopeIds(scope)
  const supabase = getSupabaseAdmin()

  // Paginated (standing rule 5). A guard is exactly where a silent 1000-row
  // cap does the most damage: it stops checking the tail and still reports a
  // confident count.
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

  // Grouped by RULE rather than by plant, because the fix is per rule: one
  // person sweeps the dashes, and reading 40 plants to learn that is wasted.
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
