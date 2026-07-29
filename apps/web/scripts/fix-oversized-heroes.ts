/**
 * Point oversized Wikimedia heroes at a scaled rendition instead of the
 * camera original.
 *
 * Commons stores originals, and `feed-wikimedia-candidates.ts` has always
 * written the original's URL as the candidate — so a winning Commons photo
 * became a hero at whatever size the photographer uploaded. The Japanese
 * banana hero picked on 2026-07-29 is 13.7MB for a card that renders it a few
 * hundred pixels wide, and seven older heroes sit between 2MB and 6.7MB.
 *
 * `next/image` resizes and caches, so this is a cold-cache and optimizer cost
 * rather than something every visitor pays. It is still a cost paid for
 * nothing, and the fix is free: Commons serves a rendition of the SAME
 * photograph at a listed width, so the picture, the credit and the licence are
 * all unchanged. Only the bytes differ.
 *
 * `pick-plant-images.ts` now does this at write time (`displayUrlFor`), so
 * this script exists for the rows written before that. It is safe to re-run:
 * a URL that is already a rendition, or an original under the threshold, is
 * left exactly as it is.
 *
 * NOT an editorial change — the hero is the same photograph, so the verdict is
 * preserved. Since migration 20260729120000 that has to be stated rather than
 * assumed: a trigger clears `editorial_checked_at` on any write to
 * `image_url_curated`, and this script opts out by writing the existing stamp
 * back unchanged. Re-judging a row because the same picture got smaller would
 * be noise, but the opt-out belongs in the diff where it can be argued with.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-oversized-heroes.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-oversized-heroes.ts --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { displayUrlFor } from '../lib/image-probe'

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const supabase = getSupabaseAdmin()

  const rows = await fetchAllRows<{
    id: string
    common_name: string
    image_url_curated: string | null
    is_curated: boolean | null
    editorial_checked_at: string | null
  }>((from, to) =>
    supabase
      .from('plants')
      .select(
        'id, common_name, image_url_curated, is_curated, editorial_checked_at'
      )
      .like('image_url_curated', '%upload.wikimedia.org%')
      .order('id')
      .range(from, to)
  )

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN —'} checking ${rows.length} Wikimedia hero(es).\n`
  )

  let changed = 0
  const unmeasured: string[] = []

  for (const p of rows) {
    const url = p.image_url_curated!
    const result = await displayUrlFor(url)

    // A row we could not measure is NOT a row we checked and approved. Counting
    // it as clean is how a first run reported nine to fix, rewrote four, and
    // then reported zero remaining.
    if (result.kind === 'unmeasured') {
      unmeasured.push(`${p.common_name} (${result.reason})`)
      continue
    }
    if (result.kind === 'unchanged') continue

    if (apply) {
      const { error } = await supabase
        .from('plants')
        .update({
          image_url_curated: result.url,
          // Declaring the exception, per the invalidate_editorial_verdict
          // trigger (migration 20260729120000): an UPDATE that writes
          // editorial_checked_at keeps its verdict. This is a smaller
          // rendition of the SAME photograph, so no reviewer would judge it
          // differently, and losing nine sign-offs to a resize would be the
          // guard working against the thing it protects. Written back
          // unchanged rather than refreshed — the verdict was made when it
          // was made.
          is_curated: p.is_curated,
          editorial_checked_at: p.editorial_checked_at,
        })
        .eq('id', p.id)
      if (error) {
        console.log(`  ${p.common_name} — write failed: ${error.message}`)
        continue
      }
    }
    console.log(
      `  ${p.common_name} — ${apply ? 'now' : 'would use'} a 1920px rendition`
    )
    changed++
  }

  console.log(
    `\n${apply ? 'Done' : 'Dry run'}: ${changed} of ${rows.length} ${apply ? 'rewritten' : 'to rewrite'}` +
      (unmeasured.length ? `, ${unmeasured.length} UNMEASURED` : '') +
      '.'
  )
  if (unmeasured.length) {
    console.log(
      `\n${unmeasured.length} hero(es) could not be measured — re-run to settle them, ` +
        'they are neither fixed nor confirmed fine:'
    )
    for (const u of unmeasured) console.log(`  - ${u}`)
  }
  if (!apply && changed > 0) console.log('\nRe-run with --apply to write.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
