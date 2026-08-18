/**
 * Sweep the ONE copy rule that has a mechanical fix: the season "fall" becomes
 * "autumn", everywhere a reader can see it.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none, and that is deliberate. It is a standing
 * corrective like `apply-description-fixes.ts` — it runs when a sweep is owed,
 * which is not a thing a round can schedule. A round's own violations are
 * reported by `verify-round` at WARN and by `pnpm copy:check --round <label>`.
 * WHAT ENDS IT: the day `pnpm copy:check --all` is clean and stays clean; until
 * then it is re-runnable and idempotent.
 *
 * WHY ONLY THIS RULE. `fixSeasonFall` rewrites exactly what `isSeasonFall`
 * flags, so the fix cannot disagree with the check. The other two rules have no
 * safe substitution: removing an em dash is a wording decision (comma,
 * semicolon, or a second sentence, depending on the clause), and "feed" becomes
 * either "fertilize" or "replenish" depending on whether a gardener or the
 * plant's own foliage is doing it. Guessing either would be a silent editorial
 * act on copy a reader sees. Those two are left for a person, and
 * `copy:check` is how they are found.
 *
 * MEASURED BEFORE IT WAS WRITTEN (2026-08-18, 780 rows): 36 season-"fall"
 * occurrences across 26 plants — 15 in description, 13 in seasonal_rhythm, 6 in
 * maintenance_notes, 2 in environment_benefits. **0 of those rows are
 * `is_curated`**, so the editorial-verdict question this write would otherwise
 * raise does not arise for this sweep. The query is the warrant for
 * `onCurated: 'skip'` below, not a belief about it — and `skip` is still the
 * policy, so a curated row that appears later is frozen and reported rather
 * than quietly re-judged.
 *
 * Every write goes through `reviewed-mutation.ts`: the stored value must still
 * be what the fix was computed from, or the row is drift and is skipped rather
 * than clobbered.
 *
 * DRY RUN BY DEFAULT (house discipline). Pass --apply to write.
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

/**
 * Build one intent per ROW, not per occurrence.
 *
 * A row with a "fall" in two columns is one UPDATE: `reviewed-mutation` guards
 * every written column against its stored value in a single statement, and two
 * intents for one row would have the second read a row the first had already
 * changed and report drift against its own sibling.
 *
 * Exported and pure so the shape can be tested without a database — the seam
 * that matters here is "what would this write", which is precisely what a live
 * dry run tells you last.
 */
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

    // A jsonb prose object: rewrite the stages that need it and write the
    // WHOLE object back, because that is the column's unit of storage. The
    // untouched stages travel unchanged, so the guard still compares the
    // stored object to what the fix was computed from.
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
    // No stamp. This pass records nothing per row — there is no
    // "copy_checked_at", and inventing one would claim a judgement nobody made
    // about the rules it does NOT fix. The run record is the provenance.
    why: `season "fall" → "autumn" in ${fixedFields.join(', ')} (lib/copy-rules.ts)`,
  }
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const scope = requireScope(
    'apply-copy-fixes',
    'It rewrites reader-facing prose. An unscoped run would reach into ' +
      'finished rounds, which is the one thing a corrective sweep must be ' +
      'asked for rather than assumed.'
  )
  const scopeIdList = scopeIds(scope)
  const whyAll = requireReasonForAll(scope)
  const supabase = getSupabaseAdmin()

  // Never a bare .select() — Supabase caps unpaginated reads at 1000 rows.
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
    // A mechanical vocabulary fix does not overrule a human sign-off. Measured
    // 0 curated rows in scope when this was written, so `skip` costs nothing
    // today and is the right policy the day that stops being true.
    onCurated: 'skip',
    dryRun: !apply,
  })

  const runOptions = {
    step: 'apply-copy-fixes',
    writeSet: PROSE_COLUMNS,
    // No stamp column of its own, so the claim is bounded by updated_at — the
    // same reasoning as the Wikimedia feeder. A row this pass rewrote is not
    // distinguishable later from a row another pass rewrote, and pretending
    // otherwise would be inventing evidence.
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

  // Prove it, rather than assert it: the check is the thing that decides
  // whether a violation exists, so re-running it is the only honest close.
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
