/**
 * Apply reviewed `native_to` rewrites from the cross-check queue.
 *
 * `native_to` is hand-owned, voice-passed copy and is only ever CHECKED against
 * `native_region`, never generated from it (docs/curation.md#native-to). So the
 * guard writes a queue and this writes the decisions a person made about it —
 * the same generate-then-apply split as apply-seasonal-care-fixes.ts and
 * scripts/archive/regenerate-native-to.ts.
 *
 * The decision file is COMMITTED to reference/ rather than left in reports/.
 * Trap 8: reports/ is gitignored and dies with its worktree, and the reasoning
 * behind a copy edit is the only record of why a phrase says what it says. The
 * queue it resolves is docs/native-to-review-<date>.md.
 *
 * Guarded, same discipline as the botanical corrections:
 * - `expect` must still match the stored phrase, or the row is STALE and is
 *   skipped rather than clobbered.
 * - Refuses any replacement phrase containing an em dash, en dash or semicolon
 *   (the UI copy rules), so a bad decision file fails before it reaches a page.
 * - Logs every before → after. Never flips `is_curated`: correcting a range is
 *   not an editorial re-verification of the whole row.
 *
 * IT NULLS native_checked_at ON EVERY ROW IT WRITES. This is the cascade rule
 * in the direction the region guard already applies it: cross-check-native-region
 * nulls this stamp when it corrects a region, because the prose describing the
 * same origin is then suspect. A rewritten PHRASE is suspect for the same
 * reason and must be re-read by the prose guard, not left carrying a stamp that
 * says the text on the page was checked when a different text was.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-native-to-fixes.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-native-to-fixes.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-native-to-fixes.ts --file reference/<name>.json
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'

const DEFAULT_FILE = 'reference/native-to-fixes-2026-07-30.json'

/** Dashes and semicolons are barred from UI copy; catch them before a write. */
const BANNED_PUNCTUATION = /[—–;]/

interface Decision {
  id: string
  scientific_name: string
  common_name: string
  /** The phrase the decision was made against. A mismatch means stale. */
  expect: string
  /** The replacement. */
  phrase: string
  why: string
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const fileIdx = argv.indexOf('--file')
  const file = fileIdx >= 0 ? argv[fileIdx + 1] : DEFAULT_FILE
  if (!file) throw new Error('--file needs a path')
  return { dryRun: argv.includes('--dry-run'), file }
}

function loadDecisions(file: string): Decision[] {
  const decisions = JSON.parse(
    readFileSync(join(process.cwd(), file), 'utf8')
  ) as Decision[]
  const seen = new Set<string>()
  for (const d of decisions) {
    if (!d.id || !d.phrase || !d.expect)
      throw new Error(`Incomplete decision for ${d.scientific_name}`)
    if (BANNED_PUNCTUATION.test(d.phrase))
      throw new Error(
        `${d.scientific_name}: replacement phrase contains a dash or semicolon`
      )
    if (d.phrase === d.expect)
      throw new Error(`${d.scientific_name}: replacement is the stored phrase`)
    if (seen.has(d.id)) throw new Error(`Duplicate decision for ${d.id}`)
    seen.add(d.id)
  }
  return decisions
}

async function main() {
  const { dryRun, file } = parseArgs()
  const decisions = loadDecisions(file)
  console.log(
    `${decisions.length} decision(s) from ${file}${dryRun ? ' (dry run)' : ''}\n`
  )

  const db = getSupabaseAdmin()
  let applied = 0
  let stale = 0

  for (const d of decisions) {
    const { data, error } = await db
      .from('plants')
      .select('native_to')
      .eq('id', d.id)
      .single()
    if (error)
      throw new Error(`Re-read failed for ${d.common_name}: ${error.message}`)

    const current = (data?.native_to ?? '') as string
    if (current !== d.expect) {
      console.log(`  ⚠ ${d.common_name} — changed since review, skipped`)
      console.log(`      expected: ${d.expect}`)
      console.log(`      found   : ${current}`)
      stale++
      continue
    }

    if (!dryRun) {
      const { error: writeError } = await db
        .from('plants')
        .update({ native_to: d.phrase, native_checked_at: null })
        .eq('id', d.id)
      if (writeError)
        throw new Error(
          `Write failed for ${d.common_name}: ${writeError.message}`
        )
    }

    console.log(
      `  ${dryRun ? '·' : '✓'} ${d.common_name} (${d.scientific_name})`
    )
    console.log(`      ${d.expect}`)
    console.log(`   -> ${d.phrase}`)
    console.log(`      ${d.why}`)
    applied++
  }

  console.log(
    `\n${applied} ${dryRun ? 'would be applied' : 'applied'}, ${stale} skipped as stale.`
  )
  if (!dryRun && applied)
    console.log(
      'native_checked_at nulled on each; cross-check-native-to --new-only will re-read them.'
    )
}

main()
