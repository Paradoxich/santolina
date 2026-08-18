/**
 * Rewrite the season "fall" to "autumn" across the prose fields.
 *
 * The only copy rule with a safe mechanical fix; the other two need a wording
 * decision. See docs/curation.md#copy-rules.
 *
 * Dry run by default. Pass --apply to write.
 *
 * Usage (from apps/web) — a scope flag is mandatory, see scripts/scope.ts:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-copy-fixes.ts --all --why "<reason>"
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-copy-fixes.ts --round 14 --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-copy-fixes.ts --ids <a,b,c> --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import {
  checkCopy,
  fixSeasonFall,
  proseOf,
  PROSE_COLUMNS,
} from '../lib/copy-rules'
import {
  requireScope,
  scopeIds,
  applyScope,
  describeScope,
  requireReasonForAll,
} from './scope'
import {
  asMutationDb,
  openReviewedMutation,
  formatReport,
  type MutationIntent,
} from './reviewed-mutation'
import { withRunRecord, type Witness } from './run-provenance'

const SELECT = ['id', 'common_name', ...PROSE_COLUMNS].join(', ')

type PlantRow = Record<string, unknown> & { id: string; common_name: string }

/** One intent per row, covering every column that needs rewriting: the
 * guarded write is a single statement. */
export function intentsFor(row: PlantRow): MutationIntent | null {
  const from: Record<string, unknown> = {}
  const to: Record<string, unknown> = {}
  const fixedFields: string[] = []

  for (const column of PROSE_COLUMNS) {
    const value = row[column]

    if (typeof value === 'string') {
      const fixed = fixSeasonFall(value)
      if (fixed !== value) {
        from[column] = value
        to[column] = fixed
        fixedFields.push(column)
      }
      continue
    }

    // jsonb: rewrite the stages that need it, write the whole object back.
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const stages = value as Record<string, unknown>
      let changed = false
      const next: Record<string, unknown> = { ...stages }
      for (const [key, stage] of Object.entries(stages)) {
        if (typeof stage !== 'string') continue
        const fixed = fixSeasonFall(stage)
        if (fixed !== stage) {
          next[key] = fixed
          changed = true
          fixedFields.push(`${column}.${key}`)
        }
      }
      if (changed) {
        from[column] = value
        to[column] = next
      }
    }
  }

  if (fixedFields.length === 0) return null

  return {
    id: row.id,
    label: row.common_name,
    from,
    to,
    why: `season "fall" → "autumn" in ${fixedFields.join(', ')} (lib/copy-rules.ts)`,
  }
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const scope = requireScope(
    'apply-copy-fixes',
    'It rewrites reader-facing prose, so an unscoped run would reach into ' +
      'finished rounds.'
  )
  const scopeIdList = scopeIds(scope)
  const whyAll = requireReasonForAll(scope)
  const supabase = getSupabaseAdmin()

  // Paginated (standing rule 5).
  const rows = await fetchAllRows<PlantRow>((from, to) =>
    applyScope(supabase.from('plants').select(SELECT), scopeIdList)
      .order('id')
      .range(from, to)
  )

  console.log(`${describeScope(scope, scopeIdList)} — ${rows.length} row(s).`)
  if (whyAll) console.log(`Whole-catalog run, because: ${whyAll}`)

  const intents = rows
    .map(intentsFor)
    .filter((i): i is MutationIntent => i !== null)

  if (intents.length === 0) {
    console.log('\nNothing to fix.')
    return
  }

  console.log(
    `\n${apply ? 'APPLYING' : 'DRY RUN —'} ${intents.length} row(s) to rewrite.\n`
  )
  for (const intent of intents) console.log(`  ${intent.label} — ${intent.why}`)

  const session = openReviewedMutation({
    db: asMutationDb(supabase),
    table: 'plants',
    // A mechanical fix does not overrule a sign-off.
    onCurated: 'skip',
    dryRun: !apply,
  })

  const runOptions = {
    step: 'apply-copy-fixes',
    writeSet: PROSE_COLUMNS,
    // No stamp of its own: updated_at bounds the claim.
    evidence: PROSE_COLUMNS.map((covers) => ({
      kind: 'row-touched' as const,
      covers,
      table: 'plants' as const,
      column: 'updated_at',
    })) as Witness[],
    scope: `${describeScope(scope, scopeIdList)} — ${intents.length} row(s) with a season "fall"`,
    recipe: {
      model: null,
      template:
        'fixSeasonFall: rewrite \\bfall\\b to autumn where isSeasonFall (lib/copy-rules.ts)',
      ingredients: {},
      decoding: {},
    },
  }

  const report = apply
    ? await withRunRecord(runOptions, async (run) =>
        session.apply(intents, run)
      )
    : await session.apply(intents)

  console.log(`\n${formatReport(report, { dryRun: !apply })}`)

  if (!apply) {
    console.log('\nRe-run with --apply to write these.')
    return
  }

  // Re-check after writing.
  const after = await fetchAllRows<PlantRow>((from, to) =>
    applyScope(supabase.from('plants').select(SELECT), scopeIdList)
      .order('id')
      .range(from, to)
  )
  const left = after.flatMap((row) =>
    proseOf(row)
      .flatMap(({ field, kind, text }) =>
        checkCopy(text, kind).map((v) => ({ ...v, field }))
      )
      .filter((v) => v.rule === 'autumn-not-fall')
      .map((v) => `${row.common_name} [${v.field}]`)
  )
  console.log(
    left.length === 0
      ? '\n✓ no season "fall" left in scope.'
      : `\n✗ ${left.length} still present: ${left.join(', ')}`
  )
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
