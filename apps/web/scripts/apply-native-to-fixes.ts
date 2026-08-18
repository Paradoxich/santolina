/**
 * Apply the decisions of a `native_to` review: the rewrites, and the keeps.
 *
 * A review of the cross-check queue produces two kinds of decision and both are
 * decisions. A REWRITE changes the phrase (the default mode below). A KEEP says
 * the phrase was read against the evidence and left standing — recorded by
 * `native_to_reviewed_at`, which `cross-check-native-to.ts` reads as the row
 * being settled. Before `--review-keep` existed, only migration 20260813110500
 * had ever written that column, so a NEWLY kept row could not be recorded at
 * all and kept failing round close until someone rewrote a phrase that was
 * right. The two halves live in one script because they are one review.
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
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-native-to-fixes.ts --review-keep --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-native-to-fixes.ts --review-keep
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-native-to-fixes.ts --review-keep --file reference/<review>.json
 *
 * `--review-keep` reads a committed review file (`reference/native-to-review-<date>.json`,
 * the narrative record migration 20260813110500 backfilled from) and stamps
 * `native_to_reviewed_at` on every row whose verdict was `keep` AND whose phrase
 * still reads exactly as the reviewer read it. It writes no catalog data. The
 * stamp is dated to the review, not to the run — see reviewTimestampFor.
 * `--dry-run` applies to both modes; `--file` defaults per mode.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { withRunRecord, type Witness } from './run-provenance'

const DEFAULT_FILE = 'reference/native-to-fixes-2026-07-30.json'
const DEFAULT_REVIEW_FILE = 'reference/native-to-review-2026-07-30.json'

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
  const reviewKeep = argv.includes('--review-keep')
  const fileIdx = argv.indexOf('--file')
  const fallback = reviewKeep ? DEFAULT_REVIEW_FILE : DEFAULT_FILE
  const file = fileIdx >= 0 ? argv[fileIdx + 1] : fallback
  if (!file) throw new Error('--file needs a path')
  return { dryRun: argv.includes('--dry-run'), file, reviewKeep }
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
  const { dryRun, file, reviewKeep } = parseArgs()
  if (reviewKeep) return stampKeeps(file, dryRun)
  const decisions = loadDecisions(file)
  console.log(
    `${decisions.length} decision(s) from ${file}${dryRun ? ' (dry run)' : ''}\n`
  )

  const db = getSupabaseAdmin()
  let applied = 0
  let stale = 0

  const runOptions = {
    step: 'apply-native-to-fixes',
    // native_checked_at is NULLED in the same statement as the new phrase, so
    // the guard re-reads words it has never judged. Declared, because a
    // clearing write is still a write and this one deliberately destroys a
    // certification.
    writeSet: ['native_to', 'native_checked_at'],
    // SHAPE 12. native_checked_at cannot witness itself here: this run sets it
    // to NULL, a nulled row matches no window, and the run would observe 0
    // against its own claim and file itself CONTRADICTED. Worse, the loss is
    // permanent — nothing queried later can distinguish "this run nulled it"
    // from "it was never set", which is exactly what the module header means by
    // the stamp being current certification state and not an audit trail.
    evidence: (['native_to', 'native_checked_at'] as const).map((covers) => ({
      kind: 'row-touched' as const,
      covers,
      table: 'plants' as const,
      column: 'updated_at',
    })) as Witness[],
    scope: `${decisions.length} hand-authored decision(s) from ${file}`,
    // Hand-authored prose: the decision file is the recipe, and its content
    // hash identifies the batch of phrasings this run applied.
    recipe: {
      model: 'human',
      template: readFileSync(join(process.cwd(), file), 'utf8'),
      ingredients: {},
      decoding: {},
    },
  }

  const applyAll = async (wrote: (id: string) => void) => {
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
        wrote(d.id)
      }

      console.log(
        `  ${dryRun ? '·' : '✓'} ${d.common_name} (${d.scientific_name})`
      )
      console.log(`      ${d.expect}`)
      console.log(`   -> ${d.phrase}`)
      console.log(`      ${d.why}`)
      applied++
    }
  }

  // A dry run opens NO run: it re-reads and writes nothing.
  if (dryRun) {
    await applyAll(() => {})
  } else {
    await withRunRecord(runOptions, (run) => applyAll((id) => run.wrote(id)))
  }

  console.log(
    `\n${applied} ${dryRun ? 'would be applied' : 'applied'}, ${stale} skipped as stale.`
  )
  if (!dryRun && applied)
    console.log(
      'native_checked_at nulled on each; cross-check-native-to --new-only will re-read them.'
    )
}

// ---------------------------------------------------------------------------
// --review-keep: the other half of the same review
// ---------------------------------------------------------------------------

/** One row of a committed review file. A `keep` is a decision, not a silence. */
interface ReviewRow {
  verdict: string
  scientific_name: string
  common_name: string
  /** The phrase the reviewer actually read. A mismatch means stale. */
  phrase_at_review: string
  reason: string
}

interface ReviewFile {
  /** The day the review happened. The stamp is dated to it, not to this run. */
  reviewed: string
  rows: ReviewRow[]
}

/** What the catalog says today about a row named in the review file. */
export interface StoredPhrase {
  id: string
  scientific_name: string | null
  native_to: string | null
  native_to_reviewed_at: string | null
}

export type KeepDisposition =
  /** Phrase still matches and the stamp is missing or older. Write it. */
  | { kind: 'stamp'; id: string; row: ReviewRow; stored: string }
  /** The phrase changed since review. The verdict was about other words. */
  | { kind: 'stale'; row: ReviewRow; stored: string }
  /** Named in the review, absent from the catalog (removed, renamed). */
  | { kind: 'missing'; row: ReviewRow }
  /** Already carries this exact stamp. Re-writing it would be churn. */
  | { kind: 'already'; id: string; row: ReviewRow }

/**
 * Which kept rows have earned the stamp, and which have drifted out from under
 * their own verdict.
 *
 * THE MATCH IS ON THE PHRASE, NOT ON THE ID, and that is the whole guard. The
 * verdict says "these exact words are right", so a row whose words changed
 * since 2026-07-30 never read them. Migration `20260813110500` matched the same
 * two columns for the same reason and left drifted rows unstamped on purpose;
 * this keeps that rule where a later reviewer can call it.
 *
 * ALREADY-STAMPED ROWS ARE NOT REWRITTEN. The trigger `invalidate_native_to_review`
 * returns early whenever the stamp value moves, so a no-op re-assert is not
 * dangerous — it is just a write that teaches nothing, and it would make every
 * run of this path claim rows it did not settle.
 */
export function keepsToStamp(
  review: ReviewRow[],
  stored: StoredPhrase[],
  reviewTimestamp: string
): KeepDisposition[] {
  const bySci = new Map<string, StoredPhrase>()
  for (const row of stored) {
    if (row.scientific_name) bySci.set(row.scientific_name, row)
  }

  return review
    .filter((row) => row.verdict === 'keep')
    .map((row): KeepDisposition => {
      const match = bySci.get(row.scientific_name)
      if (!match) return { kind: 'missing', row }
      const current = match.native_to ?? ''
      if (current !== row.phrase_at_review)
        return { kind: 'stale', row, stored: current }
      if (match.native_to_reviewed_at === reviewTimestamp)
        return { kind: 'already', id: match.id, row }
      return { kind: 'stamp', id: match.id, row, stored: current }
    })
}

/** The stamp literal for a review: the day it happened, midday UTC. */
export function reviewTimestampFor(reviewed: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewed))
    throw new Error(`Review file has no usable "reviewed" date: ${reviewed}`)
  return `${reviewed}T12:00:00+00:00`
}

function loadReview(file: string): ReviewFile {
  const parsed = JSON.parse(
    readFileSync(join(process.cwd(), file), 'utf8')
  ) as ReviewFile
  if (!Array.isArray(parsed.rows) || !parsed.rows.length)
    throw new Error(`${file} holds no review rows`)
  const seen = new Set<string>()
  for (const row of parsed.rows) {
    if (!row.scientific_name || !row.phrase_at_review)
      throw new Error(`Incomplete review row for ${row.common_name}`)
    if (seen.has(row.scientific_name))
      throw new Error(`Duplicate review row for ${row.scientific_name}`)
    seen.add(row.scientific_name)
  }
  return parsed
}

async function stampKeeps(file: string, dryRun: boolean): Promise<void> {
  const review = loadReview(file)
  const reviewTimestamp = reviewTimestampFor(review.reviewed)
  const keeps = review.rows.filter((r) => r.verdict === 'keep')
  console.log(
    `${keeps.length} kept phrase(s) from ${file}, reviewed ${review.reviewed}${
      dryRun ? ' (dry run)' : ''
    }\n`
  )

  const db = getSupabaseAdmin()
  const names = keeps.map((r) => r.scientific_name)
  // One bounded read, not a full-table select: the filter is the review's own
  // name list, so the result can never exceed it and never approaches the
  // 1000-row PostgREST cap.
  const { data, error } = await db
    .from('plants')
    .select('id, scientific_name, native_to, native_to_reviewed_at')
    .in('scientific_name', names)
  if (error) throw new Error(`Catalog read failed: ${error.message}`)

  const dispositions = keepsToStamp(
    review.rows,
    (data ?? []) as StoredPhrase[],
    reviewTimestamp
  )
  const toStamp = dispositions.filter((d) => d.kind === 'stamp')

  const runOptions = {
    step: 'apply-native-to-keeps',
    writeSet: ['native_to_reviewed_at'],
    // native_to_reviewed_at CANNOT witness itself here, and not for the reason
    // the rewrite path above cannot. There the stamp is nulled; here it is set
    // to the DAY OF THE REVIEW, which is deliberately not now — so it lands
    // outside the run window, the count comes back 0, and the run would file
    // itself CONTRADICTED for doing exactly what it promised (trap 28's shape,
    // arrived at from the other direction). updated_at bounds it instead.
    evidence: [
      {
        kind: 'row-touched' as const,
        covers: 'native_to_reviewed_at',
        table: 'plants' as const,
        column: 'updated_at',
      },
    ] as Witness[],
    scope: `${toStamp.length} kept phrase(s) from ${file}`,
    recipe: {
      model: 'human',
      template: readFileSync(join(process.cwd(), file), 'utf8'),
      ingredients: {},
      decoding: {},
    },
  }

  const stampAll = async (wrote: (id: string) => void) => {
    for (const d of toStamp) {
      if (d.kind !== 'stamp') continue
      if (!dryRun) {
        const { error: writeError } = await db
          .from('plants')
          .update({ native_to_reviewed_at: reviewTimestamp })
          .eq('id', d.id)
        if (writeError)
          throw new Error(
            `Stamp failed for ${d.row.common_name}: ${writeError.message}`
          )
        wrote(d.id)
      }
      console.log(
        `  ${dryRun ? '·' : '✓'} ${d.row.common_name} (${d.row.scientific_name})`
      )
      console.log(`      ${d.stored}`)
    }
  }

  if (dryRun || !toStamp.length) {
    await stampAll(() => {})
  } else {
    await withRunRecord(runOptions, (run) => stampAll((id) => run.wrote(id)))
  }

  const count = (kind: KeepDisposition['kind']) =>
    dispositions.filter((d) => d.kind === kind).length
  for (const d of dispositions) {
    if (d.kind === 'stale') {
      console.log(`  ⚠ ${d.row.common_name} — phrase changed since review`)
      console.log(`      reviewed: ${d.row.phrase_at_review}`)
      console.log(`      found   : ${d.stored}`)
    }
    if (d.kind === 'missing')
      console.log(`  ⚠ ${d.row.common_name} — not in the catalog`)
  }

  console.log(
    `\n${toStamp.length} ${dryRun ? 'would be stamped' : 'stamped'}, ` +
      `${count('already')} already carried it, ${count('stale')} stale, ` +
      `${count('missing')} missing.`
  )
  if (!dryRun && toStamp.length)
    console.log(
      'These rows now settle in cross-check-native-to without a rewrite.'
    )
}

// Guarded so the test file can import keepsToStamp without running the apply —
// same pattern as cross-check-native-to.ts and pick-plant-images.ts.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
