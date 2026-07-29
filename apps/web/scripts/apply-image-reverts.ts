/**
 * Apply the "keep the before" verdicts from an image-pick review.
 *
 * When a reviewer preferred a plant's previous (Trefle) photo over the AI pick,
 * the fix is free — that photo still lives in `image_url`, untouched by the
 * pass. This reverts by pointing `image_url_curated` back at `image_url`, so
 * `heroImageUrl()` serves the previous photo again. It records the reversion in
 * the reason field and leaves `image_checked_at` stamped, so the pass treats
 * the plant as reviewed-and-settled rather than re-processing it.
 *
 * Input is `reports/image-reverts.txt` — paste the review page's export there.
 * Every non-comment line's leading plant id (UUID) is a plant to revert; lines
 * starting with `#` are ignored, so the export's "needs a new photo" and
 * "confirmed good" sections ride along harmlessly.
 *
 * DRY RUN BY DEFAULT (same discipline as restore-catalog.ts / the guards):
 * prints what it would do and changes nothing. Pass --apply to write.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-image-reverts.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-image-reverts.ts --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-image-reverts.ts --file path/to/list.txt
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { parseRevertList } from '../lib/image-reverts'

const DEFAULT_FILE = join(process.cwd(), 'reports', 'image-reverts.txt')
const REVERT_REASON = 'Reviewer preferred the previous photo over the AI pick.'

function parseFlag(name: string): string | null {
  const args = process.argv.slice(2)
  const i = args.indexOf(name)
  if (i < 0) return null
  const v = args[i + 1]
  if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`)
  return v
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const file = parseFlag('--file') ?? DEFAULT_FILE

  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    console.error(
      `Couldn't read ${file}.\n` +
        'Export your verdicts from the review page (scripts/review-image-picks.ts),' +
        ' paste them into that file, then re-run.'
    )
    process.exit(1)
  }

  const ids = parseRevertList(text)
  if (ids.length === 0) {
    console.log(
      'No plant ids to revert — the file has no un-commented id lines.'
    )
    return
  }

  const supabase = getSupabaseAdmin()

  // Load current state so the log shows what actually changes, and so a plant
  // that has no previous photo (nothing to revert to) is caught rather than
  // blanked. image_url_curated already equal to image_url means a prior run
  // (or a "kept" pick) — a no-op, reported as such.
  const { data, error } = await supabase
    .from('plants')
    .select('id, common_name, image_url, image_url_curated')
    .in('id', ids)
  if (error) throw new Error(`Load failed: ${error.message}`)

  const found = new Map((data ?? []).map((p) => [p.id, p]))
  const missing = ids.filter((id) => !found.has(id))

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN —'} ${ids.length} revert(s) from ${file}.\n`
  )

  let reverted = 0
  let noop = 0
  let noPrevious = 0

  for (const id of ids) {
    const p = found.get(id)
    if (!p) continue

    if (!p.image_url) {
      console.log(`  ${p.common_name} — SKIP: no previous photo to revert to`)
      noPrevious++
      continue
    }
    if (p.image_url_curated === p.image_url) {
      console.log(
        `  ${p.common_name} — already on the previous photo, nothing to do`
      )
      noop++
      continue
    }

    if (apply) {
      const { error: upErr } = await supabase
        .from('plants')
        .update({
          image_url_curated: p.image_url,
          // The previous photo is the Trefle/PlantNet default, which we don't
          // credit — clear any attribution left over from a beaten Wikimedia pick.
          image_attribution: null,
          image_pick_confidence: 'high', // human confirmation is the strongest signal we have
          image_pick_reason: REVERT_REASON,
          // A reviewer choosing this photo is a verification, and the
          // strongest one available — stamp it so --verify does not re-ask.
          image_verified_at: new Date().toISOString(),
          // The inverse obligation from migration 20260728220852. This changes
          // BOTH the hero image and the confidence, and the editorial verdict
          // rests on each of them, so leaving the stamp would keep an approval
          // that was made about a different photograph. Predates that column,
          // which is why it was missing rather than decided against.
          editorial_checked_at: null,
        })
        .eq('id', id)
      if (upErr) {
        console.log(`  ${p.common_name} — write failed: ${upErr.message}`)
        continue
      }
    }
    console.log(
      `  ${p.common_name} — ${apply ? 'reverted' : 'would revert'} to previous photo`
    )
    reverted++
  }

  console.log(
    `\n${apply ? 'Done' : 'Dry run'}: ${reverted} ${apply ? 'reverted' : 'to revert'}, ` +
      `${noop} already reverted, ${noPrevious} with no previous photo` +
      (missing.length
        ? `, ${missing.length} id(s) not found in the catalog`
        : '') +
      '.'
  )
  if (!apply && reverted > 0) {
    console.log('\nRe-run with --apply to write these changes.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
