/**
 * Apply hand-authored `common_name` corrections from a committed decision file.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none, deliberately. Like
 * `apply-description-fixes.ts` this is a standing manual-override tool — it
 * runs when a person has decided a plant is called the wrong thing, which is
 * not something a round can schedule. WHAT ENDS IT: nothing.
 *
 * THE GAP THIS FILLS, found by hitting it on 2026-08-17. Three scripts fix
 * names (`fix-round8-names`, `fix-round11-names`, `fix-round12-names`) and
 * every one of them is scoped to the batch its round seeded. There was no path
 * at all to correct a name outside a round — so a one-row fix meant either
 * editing a closed round's decision table, which is a lie about what that round
 * did, or writing a throwaway script. Same shape as the gap
 * `apply-description-fixes` was built for, one column over.
 *
 * IT IS A THIN CALLER ON PURPOSE. `scripts/name-fixes.ts` owns the collision
 * pre-check, the drift guard, the frozen-row policy, the id resolution and the
 * run record; this file is argv, a JSON file and its validation. The three
 * round scripts are the same shape with their decisions inline.
 *
 * Usage (from apps/web) — dry run is the default:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-name-fixes.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-name-fixes.ts --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-name-fixes.ts --file reference/<name>.json
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { runNameFixes, type NameFix } from './name-fixes'

const DEFAULT_FILE = 'reference/name-fixes-2026-08-17.json'

const args = process.argv.slice(2)
const fileIdx = args.indexOf('--file')
const FILE = fileIdx >= 0 ? (args[fileIdx + 1] ?? DEFAULT_FILE) : DEFAULT_FILE

/**
 * The decision file is committed, so its defects are permanent until someone
 * edits it. Validating here means a bad entry fails before it reaches a row,
 * rather than being applied and then reasoned about afterwards.
 */
function loadFixes(file: string): NameFix[] {
  const parsed = JSON.parse(
    readFileSync(join(process.cwd(), file), 'utf8')
  ) as NameFix[]
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Error(`${file} holds no decisions`)

  for (const fix of parsed) {
    for (const field of ['scientific_name', 'from', 'to', 'why'] as const) {
      if (!fix[field]?.trim())
        throw new Error(
          `${fix.scientific_name ?? '(unnamed entry)'}: ${field} is required. ` +
            `A rename with no ${field === 'why' ? 'reasoning' : field} is not reviewable, ` +
            `and this file is the only place the reasoning will ever live.`
        )
    }
    if (fix.from.trim() === fix.to.trim())
      throw new Error(
        `${fix.scientific_name}: \`from\` equals \`to\`, so this entry does nothing.`
      )
  }
  return parsed
}

async function main() {
  const fixes = loadFixes(FILE)
  await runNameFixes({
    step: 'apply-name-fixes',
    fixes,
    summary: `${fixes.length} hand-authored, from ${FILE}`,
  })
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}\n`)
  process.exit(1)
})
