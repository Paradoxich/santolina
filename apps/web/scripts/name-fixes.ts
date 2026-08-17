/**
 * A committed list of `common_name` corrections, applied safely.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none. It is a library, not a script — the
 * shared half of `fix-round8-names.ts`, `fix-round11-names.ts` and
 * `fix-round12-names.ts`, which are now their decision tables and a header
 * each. WHAT ENDS IT: nothing. A seed batch reliably lands names that are
 * absent, wrong, or ambiguous in a GARDEN catalog (Trefle is a botanical
 * source), so the next round needs a fourth table and no fourth copy of this.
 *
 * WHY IT IS ONE FILE NOW. `fix-round11-names.ts` and `fix-round12-names.ts` had
 * byte-identical `main()` bodies — the collision pre-check, the per-fix read,
 * the four dispositions, the summary line, the exit code. `fix-round8-names.ts`
 * was the same minus the pre-check, which is not a design difference but an age
 * difference: it predates trap 6. Three copies of one procedure is the
 * third-script rule in CLAUDE.md, and the rule's own remedy — extract the shared
 * part — is what this is.
 *
 * ROUND 8 GAINS THE COLLISION PRE-CHECK by being migrated, and that is the
 * point rather than a side effect. Its own header records that the pass CREATED
 * a collision it then had to fix in a third pass ("SELF-INFLICTED", Anemone
 * quinquefolia). The check that would have caught it existed two rounds later
 * and could not reach backwards; now it can.
 *
 * WHAT IT DOES NOT DO. It does not flip `is_curated`. A name correction is
 * mechanical, not Ana's editorial voice pass (docs/architecture.md#curation-layer),
 * and `onCurated: 'skip'` means a finalised row's name is frozen rather than
 * overruled.
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { withRunRecord, type Witness } from './run-provenance'
import {
  openReviewedMutation,
  asMutationDb,
  formatReport,
  type MutationIntent,
} from './reviewed-mutation'

export interface NameFix {
  /** Matched on, because a scientific name is stable where a common one is not. */
  scientific_name: string
  /** Expected current value — the drift guard. */
  from: string
  to: string
  why: string
}

/** One row of the catalog, as the collision pre-check needs to see it. */
export interface HeldName {
  scientific_name: string
  common_name: string | null
}

/**
 * Targets that another row already holds, keyed by the fix's scientific name.
 *
 * TRAP 6: a name pass can CREATE the collision it exists to remove. Round 8
 * renamed `Anemonoides nemorosa` to "Wood anemone" onto a catalog that already
 * had one, and needed a third group of fixes to undo it.
 *
 * Pure, and separated from the query on purpose — the query's only job is to
 * hand it the WHOLE catalog. That half is where this check has already failed
 * once in spirit: a bare `.select()` returns 1000 rows (standing rule 5), so a
 * pre-check reading one page stops firing exactly when the catalog is big
 * enough to make a collision likely. Case-insensitive, because "Grape-hyacinth"
 * and "grape-hyacinth" are one name to a reader.
 */
export function findCollisions(
  fixes: NameFix[],
  catalog: HeldName[]
): Map<string, string[]> {
  const heldBy = new Map<string, string[]>()
  for (const row of catalog) {
    if (!row.common_name) continue
    const key = row.common_name.toLowerCase()
    heldBy.set(key, [...(heldBy.get(key) ?? []), row.scientific_name])
  }

  const blocked = new Map<string, string[]>()
  for (const fix of fixes) {
    const holders = (heldBy.get(fix.to.toLowerCase()) ?? []).filter(
      // A row already holding its own target is the idempotent case, not a
      // collision. Without this every re-run refuses everything it once wrote.
      (name) => name !== fix.scientific_name
    )
    if (holders.length) blocked.set(fix.scientific_name, holders)
  }
  return blocked
}

export interface NameFixRun {
  /** The step name in the run record. Matches the calling script's filename. */
  step: string
  fixes: NameFix[]
  /** The counts line each caller prints, e.g. "18 missing, 31 wrong". */
  summary: string
}

/**
 * Run one round's name corrections. Owns argv, the writes and the exit code, so
 * a calling script is its decision table and its reasoning and nothing else.
 */
export async function runNameFixes({
  step,
  fixes,
  summary,
}: NameFixRun): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply')
  const db = getSupabaseAdmin()

  console.log(
    `\n${fixes.length} name fixes (${summary}).` +
      (apply ? '\n' : ' DRY RUN — pass --apply to write.\n')
  )

  // One read, serving both the collision pre-check and the id resolution. The
  // pre-check needs the WHOLE catalog either way, so a second query would only
  // add a window in which the two could disagree.
  const catalog = await fetchAllRows<HeldName & { id: string }>((from, to) =>
    db
      .from('plants')
      .select('id, scientific_name, common_name')
      .order('id')
      .range(from, to)
  )

  const blocked = findCollisions(fixes, catalog)
  for (const [name, holders] of blocked)
    console.log(
      `  ✗   REFUSED "${fixes.find((f) => f.scientific_name === name)?.to}" for ${name} — already held by ${holders.join(', ')}`
    )
  if (blocked.size) console.log('')

  // The primitive takes ids on purpose: a name is a value, and the guard is
  // worthless if the thing it keys on can move between the read and the write.
  const ids = new Map<string, string>()
  for (const row of catalog) {
    if (ids.has(row.scientific_name))
      throw new Error(
        `${row.scientific_name} matches more than one catalog row. These ` +
          `decisions are keyed by name and cannot say which was meant — ` +
          `resolve the duplicate before running this.`
      )
    ids.set(row.scientific_name, row.id)
  }

  const intents: MutationIntent[] = []
  const unresolved: string[] = []
  for (const fix of fixes) {
    if (blocked.has(fix.scientific_name)) continue
    const id = ids.get(fix.scientific_name)
    if (!id) {
      unresolved.push(fix.scientific_name)
      console.log(`  ??  ${fix.scientific_name} — no such row`)
      continue
    }
    intents.push({
      id,
      label: fix.scientific_name,
      from: { common_name: fix.from },
      to: { common_name: fix.to },
      why: fix.why,
    })
  }

  const writer = openReviewedMutation({
    db: asMutationDb(db),
    table: 'plants',
    // A mechanical name correction does not overrule a human sign-off.
    onCurated: 'skip',
    dryRun: !apply,
  })

  const runOptions = {
    step,
    writeSet: ['common_name'],
    // A value column cannot be compared to an instant, and this pass writes no
    // stamp, so `updated_at` BOUNDS the claim and cannot corroborate it. That
    // is the honest ceiling for a write that leaves no certification behind.
    evidence: [
      {
        kind: 'row-touched',
        covers: 'common_name',
        table: 'plants',
        column: 'updated_at',
      },
    ] as Witness[],
    scope: `${intents.length} hand-authored name decision(s) — ${summary}`,
    // No model and no prompt: the decision table IS the recipe, and its content
    // hash is what identifies this cohort.
    recipe: {
      model: 'human',
      template: JSON.stringify(fixes, null, 2),
      ingredients: {},
      decoding: {},
    },
  }

  // A dry run opens NO run: provenance records what produced a value, and a
  // pass that writes none produced none. Same reasoning as curate-styles.
  const report = apply
    ? await withRunRecord(runOptions, (run) =>
        writer.apply(intents, { wrote: (id) => run.wrote(id) })
      )
    : await writer.apply(intents)

  for (const outcome of report.outcomes)
    if (outcome.disposition === 'written')
      console.log(
        `  ${apply ? '✓' : '·'}   "${outcome.intent.from['common_name']}" → "${outcome.intent.to['common_name']}"  (${outcome.intent.label}) — ${outcome.intent.why}`
      )

  console.log('\n─────────────────────────────────────────')
  console.log(
    formatReport(report, {
      dryRun: !apply,
      reJudgeWith: 'curate-editorial --ids <the ids above>',
    })
  )
  console.log(`Refused (collision): ${blocked.size}`)
  if (unresolved.length)
    console.log(`Unresolved name(s): ${unresolved.join(', ')}`)
  if (!apply && report.written) console.log('\nRe-run with --apply to write.')
  // A refused target is a defect in the decision file, not a skip: it means two
  // rows would end up sharing a display name. Exit non-zero so a runbook step
  // wrapping this cannot pass over it.
  if (blocked.size) process.exit(1)
}
