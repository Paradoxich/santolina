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
 *   silently overwritten by a decision made about older text.
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

  const stale: string[] = []
  const missing: string[] = []
  const uncurated: string[] = []
  const applicable: Array<{ fix: DescriptionFix; row: PlantRow }> = []

  for (const fix of fixes) {
    const row = byId.get(fix.id)
    if (!row) {
      missing.push(`${fix.scientific_name} — no row with id ${fix.id}`)
      continue
    }
    // STALENESS, the whole safety property: a decision made about older text
    // must not overwrite a rewrite somebody else has landed since.
    if ((row.description ?? '').trim() !== fix.expect.trim()) {
      stale.push(
        `${fix.scientific_name} — stored description no longer matches \`expect\`; re-read the row and re-author the decision`
      )
      continue
    }
    applicable.push({ fix, row })
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
    scope: `${applicable.length} hand-authored decision(s) from ${FILE}`,
    // Hand-authored copy: there is no model and no prompt. The decision file IS
    // the recipe, and its content hash is what identifies this cohort.
    recipe: {
      model: 'human',
      template: readFileSync(join(process.cwd(), FILE), 'utf8'),
      ingredients: {},
      decoding: {},
    },
  }

  const apply = async (wrote: (id: string) => void) => {
    for (const { fix, row } of applicable) {
      console.log(`${fix.common_name} (${fix.scientific_name})`)
      console.log(`  before: ${fix.expect}`)
      console.log(`  after:  ${fix.description}`)
      console.log(`  why:    ${fix.why}`)

      if (!DRY_RUN) {
        const { error } = await db
          .from('plants')
          .update({ description: fix.description })
          .eq('id', fix.id)
        if (error)
          throw new Error(
            `${fix.scientific_name}: write failed — ${error.message}`
          )
        wrote(fix.id)
      }
      if (row.is_curated) uncurated.push(fix.scientific_name)
      console.log('')
    }
  }

  if (DRY_RUN) {
    await apply(() => {})
  } else {
    await withRunRecord(runOptions, async (run) => {
      await apply((id) => run.wrote(id))
    })
  }

  console.log('─────────────────────────────────────────')
  console.log(
    `${DRY_RUN ? 'Would apply' : 'Applied'} ${applicable.length}, ${stale.length} stale, ${missing.length} missing.`
  )
  for (const s of stale) console.log(`  STALE   ${s}`)
  for (const m of missing) console.log(`  MISSING ${m}`)

  if (uncurated.length) {
    console.log(
      `\n${uncurated.length} row(s) lost an editorial verdict, which is the trigger working:` +
        `\n  ${uncurated.join('\n  ')}` +
        `\nThe sign-off was partly a judgment that the OLD description read well.` +
        `\nRe-run: curate-editorial --ids <those ids>`
    )
  }

  if (stale.length || missing.length) process.exit(1)
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}\n`)
  process.exit(1)
})
