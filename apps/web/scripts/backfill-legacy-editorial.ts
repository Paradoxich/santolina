/**
 * Record a verdict behind the approvals that never had one.
 *
 * THE SITUATION. 76 plants — round 7, the herb and edible batch — carried
 * `is_curated = true` with no `editorial_checked_at` at all. They were approved
 * before that column existed, so the flag claimed a sign-off with nothing
 * recorded behind it. The per-criterion split (migration 20260729140000) made
 * that visible rather than merely true: three stamps, all empty, on a row
 * calling itself finished.
 *
 * That could not be resolved by a migration. Whether a legacy approval counts
 * as three cleared criteria is a judgment about work someone already did, and
 * guessing it either way would be inventing evidence — the same reason the
 * pre-July-16 guard stamps were left NULL rather than backdated (trap 2).
 *
 * WHAT ACTUALLY SETTLED IT. Ana read `scripts/review-editorial.ts --legacy`,
 * which puts each plant's photo, copy and tags side by side, and confirmed the
 * set. This records that review. The 18 rows whose hero was only
 * medium-confidence went through `apply-image-confirmations.ts` first, so
 * criterion 1 rests on a stated human confirmation rather than on this script
 * waving it through — a reviewer's yes outranks the vision pass's "unsure",
 * and it should be written down in the place that already means that.
 *
 * THE STAMPS ARE DATED NOW, NOT BACKDATED. The review happened today. Writing
 * an older date would make the record say the criteria were checked at a time
 * when nothing checked them, which is the exact failure being corrected.
 *
 * Idempotent: a row that already carries all three stamps is left alone, so a
 * second run reports zero and changes nothing.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-legacy-editorial.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-legacy-editorial.ts --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const supabase = getSupabaseAdmin()

  const rows = await fetchAllRows<{
    id: string
    common_name: string
    image_pick_confidence: string | null
  }>((from, to) =>
    supabase
      .from('plants')
      .select('id, common_name, image_pick_confidence')
      .eq('is_curated', true)
      .is('editorial_checked_at', null)
      .order('common_name')
      .range(from, to)
  )

  if (rows.length === 0) {
    console.log('Nothing to backfill — every curated row carries a verdict.')
    return
  }

  // Criterion 1 is decided from image_pick_confidence, and this script must
  // not paper over a row that would fail it. Anything still short of `high`
  // has not been confirmed by anyone, so it stops the run rather than being
  // quietly stamped.
  const unconfirmed = rows.filter((r) => r.image_pick_confidence !== 'high')
  if (unconfirmed.length) {
    console.error(
      `\n${unconfirmed.length} of these ${rows.length} rows still have a hero image ` +
        `below high confidence:\n` +
        unconfirmed
          .map(
            (r) =>
              `  - ${r.common_name} (${r.image_pick_confidence ?? 'never judged'})`
          )
          .join('\n') +
        `\n\nStamping them would record a criterion nobody cleared. Confirm the ` +
        `images first (review-editorial.ts --legacy, then ` +
        `apply-image-confirmations.ts), or re-pick them.\n`
    )
    process.exit(1)
  }

  const now = new Date().toISOString()
  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN —'} recording a verdict on ${rows.length} legacy approval(s).\n`
  )

  let done = 0
  for (const r of rows) {
    if (apply) {
      const { error } = await supabase
        .from('plants')
        .update({
          editorial_checked_at: now,
          editorial_image_at: now,
          editorial_description_at: now,
          editorial_tags_at: now,
          is_curated: true,
        })
        .eq('id', r.id)
      if (error) {
        console.log(`  ${r.common_name} — write failed: ${error.message}`)
        continue
      }
    }
    done++
  }

  console.log(
    `${apply ? 'Done' : 'Dry run'}: ${done} row(s) ${apply ? 'now carry' : 'would carry'} a recorded verdict.`
  )
  if (!apply) console.log('\nRe-run with --apply to write.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
