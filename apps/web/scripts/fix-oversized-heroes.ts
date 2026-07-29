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
 * preserved. Since migration 20260729120000 that has to be DONE rather than
 * assumed: a trigger clears the image criterion on any write to
 * `image_url_curated`, so this script resizes and then re-asserts the verdict
 * in a second statement. See the comment at that write for why one statement
 * cannot work. Since 20260729140000 the criterion cleared is
 * `editorial_image_at`, and the re-assert has to restore that stamp too —
 * `is_curated` alone would be an approval with a criterion outstanding. Re-judging a row because the same picture got smaller would be
 * noise, but the opt-out belongs in the diff where it can be argued with.
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
    editorial_image_at: string | null
  }>((from, to) =>
    supabase
      .from('plants')
      .select(
        'id, common_name, image_url_curated, is_curated, editorial_checked_at, editorial_image_at'
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
        .update({ image_url_curated: result.url })
        .eq('id', p.id)
      if (error) {
        console.log(`  ${p.common_name} — write failed: ${error.message}`)
        continue
      }

      // Re-assert the verdict in a SECOND statement, because the first one
      // cleared it. This is a smaller rendition of the SAME photograph, so no
      // reviewer would judge it differently, and losing sign-offs to a resize
      // would be the guard working against the thing it protects.
      //
      // It has to be a second write. The invalidate_editorial_verdict trigger
      // (migration 20260729120000) skips an update that CHANGES the stamp, and
      // Postgres cannot tell "wrote the same value deliberately" from "did not
      // write it" — PostgREST sends every column either way, so value equality
      // is the only signal available. Writing the old stamp back inside the
      // first update therefore looks like no write at all and gets cleared.
      // Against the now-null current value, the same write is a change, and
      // passes. The first draft of this script got that wrong and would have
      // quietly un-curated every row it resized.
      // The re-assert MUST include editorial_image_at. Since the verdict was
      // split per criterion (migration 20260729140000) the resize clears that
      // stamp, and restoring only is_curated and editorial_checked_at leaves
      // the row approved with criterion 1 outstanding — the one state the
      // trigger exists to make impossible. This script predates the split and
      // was not updated with it; the contract test's last case is what found
      // it, before the script had run again.
      if (p.editorial_checked_at || p.is_curated) {
        const { error: restoreErr } = await supabase
          .from('plants')
          .update({
            is_curated: p.is_curated,
            editorial_checked_at: p.editorial_checked_at,
            editorial_image_at: p.editorial_image_at,
          })
          .eq('id', p.id)
        if (restoreErr) {
          console.log(
            `  ${p.common_name} — RESIZED BUT THE VERDICT WAS NOT RESTORED (${restoreErr.message}); re-run curate-editorial for this row`
          )
          continue
        }
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
