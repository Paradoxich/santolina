/**
 * Apply hand-authored `description` rewrites from a committed decision file.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none, and that is deliberate. Like
 * `set-plant-hero.ts` this is a standing manual-override tool, not a round
 * step — it runs when a person has written a correction, which is not a thing
 * a round can schedule. WHAT ENDS IT: nothing; it is the permanent home for
 * hand-written description copy, the way `apply-native-to-fixes.ts` is for
 * `native_to`.
 *
 * THE GAP THIS FILLS. `curate-plants` writes a description only when there
 * isn't one (fill-only) and cannot be pointed at this column at all —
 * `--only description` is refused, because field-scoped mode drops the
 * `is_curated` selection filter and `description` is one of the three things an
 * editorial verdict is ABOUT. `curate-editorial` rewrites descriptions, but it
 * writes what a model produces; it has no way to accept "say THIS, for this
 * reason". Between them there was no path for a correction a person authored,
 * which is how the _Hydrangea hydrangeoides_ rewrite came to be blocked on
 * 2026-08-17 after the decision itself had been made.
 *
 * THE DECISION FILE IS COMMITTED to reference/, not left in reports/. Trap 8:
 * reports/ is gitignored and dies with its worktree, and for a copy edit the
 * reasoning is the only record of why a sentence says what it says. Every entry
 * carries `why` for that reason.
 *
 * Guarded, the same discipline as the botanical and native_to corrections:
 * - `expect` must still match the stored description exactly, or the row is
 *   STALE and skipped rather than clobbered. Someone else's rewrite is never
 *   silently overwritten by a decision made about older text. EXACTLY is now
 *   literal: the guard moved to `scripts/reviewed-mutation.ts`, which compares
 *   normalised JSON, where this file used to compare trimmed strings. A stored
 *   description differing only in surrounding whitespace therefore reports
 *   stale and exits 1 rather than being written. That is the safe direction —
 *   loud and skipped, not silent and clobbered — and it is worth knowing before
 *   authoring a decision file by hand.
 * - Refuses any replacement containing an em dash, en dash or semicolon (the UI
 *   copy rules), so a bad decision file fails before it reaches a page. All 748
 *   live descriptions were free of all three when this shipped (counted
 *   2026-08-17), so the rule describes the corpus rather than imposing on it.
 * - Logs every before → after.
 *
 * IT LETS THE EDITORIAL VERDICT FALL, and does not re-assert it. The trigger
 * `invalidate_editorial_verdict` (migration 20260729101133) clears
 * `is_curated` and `editorial_checked_at` whenever the description changes,
 * because "the description reads well" is one of the three criteria the
 * sign-off is made of (lib/editorial-standard.ts). A verdict about text that no
 * longer exists is not a verdict.
 *
 * `fix-oversized-heroes.ts` re-asserts in a second statement and is right to:
 * a smaller rendition of the same photograph is not something a reviewer would
 * judge differently. NEW PROSE IS. Whether a sentence is too technical for a
 * beginner is exactly what the editorial pass decides, so this script prints
 * the rows whose verdict it retired and tells you to re-run `curate-editorial`
 * on them.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-description-fixes.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-description-fixes.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-description-fixes.ts --file reference/<name>.json
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { withRunRecord, type Witness } from './run-provenance'
import {
  classify,
  openReviewedMutation,
  asMutationDb,
  formatReport,
  type MutationIntent,
} from './reviewed-mutation'

const DEFAULT_FILE = 'reference/description-fixes-2026-08-17.json'

interface DescriptionFix {
  id: string
  scientific_name: string
  common_name: string
  /** The stored description this decision was made about. */
  expect: string
  /** The replacement copy. */
  description: string
  /** Why the old text was wrong. The only record of the reasoning. */
  why: string
}

interface PlantRow {
  id: string
  common_name: string
  description: string | null
  is_curated: boolean
}

// The UI copy rules, enforced before a page can ever render the text.
const FORBIDDEN_PUNCTUATION: Array<[RegExp, string]> = [
  [/—/, 'em dash'],
  [/–/, 'en dash'],
  [/;/, 'semicolon'],
]

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const fileIdx = args.indexOf('--file')
const FILE = fileIdx >= 0 ? (args[fileIdx + 1] ?? DEFAULT_FILE) : DEFAULT_FILE

function loadFixes(file: string): DescriptionFix[] {
  const parsed = JSON.parse(
    readFileSync(join(process.cwd(), file), 'utf8')
  ) as DescriptionFix[]
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Error(`${file} holds no decisions`)

  for (const fix of parsed) {
    for (const field of ['id', 'expect', 'description', 'why'] as const) {
      if (!fix[field]?.trim())
        throw new Error(
          `${fix.scientific_name ?? fix.id}: ${field} is required. A correction with no ${field === 'why' ? 'reasoning' : field} is not reviewable.`
        )
    }
    for (const [pattern, name] of FORBIDDEN_PUNCTUATION) {
      if (pattern.test(fix.description))
        throw new Error(
          `${fix.scientific_name}: replacement contains a ${name}, which the UI copy rules forbid. Fix the decision file.`
        )
    }
    if (fix.description.trim() === fix.expect.trim())
      throw new Error(
        `${fix.scientific_name}: replacement is identical to expect, so this entry does nothing.`
      )
  }
  return parsed
}

async function main() {
  const fixes = loadFixes(FILE)
  const db = getSupabaseAdmin()

  console.log(
    `\n${fixes.length} description decision(s) from ${FILE}${DRY_RUN ? ' — DRY RUN, no writes' : ''}\n`
  )

  const ids = fixes.map((f) => f.id)
  const rows = await fetchAllRows<PlantRow>((from, to) =>
    db
      .from('plants')
      .select('id, common_name, description, is_curated')
      .in('id', ids)
      .order('id')
      .range(from, to)
  )
  const byId = new Map(rows.map((r) => [r.id, r]))

  // CLASSIFICATION IS THE PRIMITIVE'S NOW. Its four dispositions are this
  // script's four outcomes under different names, and the mapping is exact:
  // `noop` is already-applied, `drift` is stale, `missing` is missing, and
  // `written` is applicable. The ordering that matters — already-applied
  // checked BEFORE drift — is a property of `classify`, and its header records
  // the same incident this file used to record on its own: a decision file is
  // COMMITTED and stays in the tree, so already-applied is the normal steady
  // state, and calling it stale made the default invocation fail forever.
  //
  // `retire`, not `skip`: a description rewrite is exactly what the sign-off
  // was partly a judgment about, so the verdict SHOULD fall. What changes is
  // that the retirement is now OBSERVED — the primitive reads `is_curated` back
  // for the rows it wrote — where this script inferred it from the before-state
  // and would have kept reporting confidently if the trigger ever stopped
  // watching `description`.
  const writer = openReviewedMutation({
    db: asMutationDb(db),
    table: 'plants',
    onCurated: 'retire',
    dryRun: DRY_RUN,
  })

  const intents: MutationIntent[] = []
  const unknown: string[] = []
  for (const fix of fixes) {
    if (!byId.has(fix.id)) {
      unknown.push(`${fix.scientific_name} — no row with id ${fix.id}`)
      continue
    }
    intents.push({
      id: fix.id,
      label: `${fix.common_name} (${fix.scientific_name})`,
      from: { description: fix.expect },
      to: { description: fix.description },
      why: fix.why,
    })
  }

  const runOptions = {
    step: 'apply-description-fixes',
    // description only. The verdict columns the trigger clears are NOT declared:
    // this run does not write them, the database does, and claiming them would
    // be claiming authorship of a cascade.
    writeSet: ['description'],
    // A value column cannot be compared to an instant, so it needs a witness or
    // beginRun throws. Written on every row this run writes.
    evidence: [
      {
        kind: 'row-touched',
        covers: 'description',
        table: 'plants',
        column: 'updated_at',
      },
    ] as Witness[],
    scope: `${intents.length} hand-authored decision(s) from ${FILE}`,
    // Hand-authored copy: there is no model and no prompt. The decision file IS
    // the recipe, and its content hash is what identifies this cohort.
    recipe: {
      model: 'human',
      template: readFileSync(join(process.cwd(), FILE), 'utf8'),
      ingredients: {},
      decoding: {},
    },
  }

  // NOTHING TO DO OPENS NO RUN, and restoring this cost one line because the
  // rows are already in hand. Provenance records what produced a value, and a
  // pass with no applicable decision produced none; `beginRun` would otherwise
  // file a completed, zero-row invocation whose own note reads "vacuous, not
  // evidence of work". The first cut of this migration dropped the property and
  // filed exactly that record.
  //
  // `classify` is the same function `apply` uses, not a second opinion about
  // what counts as applicable — which is the only way this pre-pass can be
  // guaranteed to agree with the write that follows it.
  const applicable = intents.filter((intent) => {
    const row = byId.get(intent.id)!
    const outcome = classify(
      intent,
      { id: row.id, is_curated: row.is_curated, values: { ...row } },
      'retire'
    )
    return (
      outcome.disposition === 'written' || outcome.disposition === 'stamped'
    )
  })

  const report =
    DRY_RUN || applicable.length === 0
      ? await writer.apply(intents)
      : await withRunRecord(runOptions, (run) =>
          writer.apply(intents, { wrote: (id) => run.wrote(id) })
        )

  for (const outcome of report.outcomes) {
    if (outcome.disposition !== 'written') continue
    const fix = fixes.find((f) => f.id === outcome.intent.id)!
    console.log(`${fix.common_name} (${fix.scientific_name})`)
    console.log(`  before: ${fix.expect}`)
    console.log(`  after:  ${fix.description}`)
    console.log(`  why:    ${fix.why}`)
    console.log('')
  }

  console.log('─────────────────────────────────────────')
  console.log(
    formatReport(report, {
      dryRun: DRY_RUN,
      reJudgeWith: 'curate-editorial --ids <the ids above>',
    })
  )
  for (const u of unknown) console.log(`  MISSING ${u}`)

  // A stale decision and an unknown id are both defects in the decision file,
  // not skips: the first means somebody rewrote the sentence this decision was
  // made about, the second that the row it names is gone.
  const stale = report.skipped_drift
  if (stale || report.missing || unknown.length) process.exit(1)
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}\n`)
  process.exit(1)
})
