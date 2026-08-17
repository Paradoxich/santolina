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
 * preserved. Since migration 20260729101133 that has to be DONE rather than
 * assumed: a trigger clears the image criterion on any write to
 * `image_url_curated`, so this script resizes and then re-asserts the verdict
 * in a second statement. See the comment at that write for why one statement
 * cannot work. Since 20260729112046 the criterion cleared is
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
import { writePlant } from '../lib/plants-write'
import { withRunRecord, type Witness } from './run-provenance'

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const supabase = getSupabaseAdmin()

  const rows = await fetchAllRows<{
    id: string
    common_name: string
    image_url_curated: string | null
    // The verdict columns are deliberately NOT selected here. `writePlant`
    // reads them itself at write time, which is also the only moment they are
    // true — a verdict read at the top of a long run is a stale verdict.
  }>((from, to) =>
    supabase
      .from('plants')
      .select('id, common_name, image_url_curated')
      .like('image_url_curated', '%upload.wikimedia.org%')
      .order('id')
      .range(from, to)
  )

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN —'} checking ${rows.length} Wikimedia hero(es).\n`
  )

  let changed = 0
  const unmeasured: string[] = []

  const runOptions = {
    step: 'fix-oversized-heroes',
    // One column. The verdict columns are NOT declared: `preserveVerdict` asks
    // plants-write to keep what is already there, so this run does not author
    // them — and declaring a value you deliberately did not change would be
    // claiming a write that never happened.
    writeSet: ['image_url_curated'],
    // A value column, and this pass writes no stamp at all, so `updated_at`
    // bounds the claim and cannot corroborate it.
    evidence: [
      {
        kind: 'row-touched',
        covers: 'image_url_curated',
        table: 'plants',
        column: 'updated_at',
      },
    ] as Witness[],
    scope: `${rows.length} Wikimedia hero(es) measured`,
    // No model and no prompt: the rule is mechanical — swap an oversized
    // rendition for the 1920px one at the same URL. The recipe is that rule.
    recipe: {
      model: 'human',
      template: 'Wikimedia hero → 1920px rendition of the same file',
      ingredients: {},
      decoding: {},
    },
  }

  const applyAll = async (wrote: (id: string) => void) => {
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
        // `preserveVerdict` because this is a smaller rendition of the SAME
        // photograph — not something a reviewer would judge differently, and
        // losing sign-offs to a resize would be the guard working against the
        // thing it protects. That exception is the only judgment this script
        // makes about the verdict; how to keep one across a change now lives in
        // `plants-write.ts` rather than being re-derived here.
        //
        // It was re-derived here, and wrongly: this script predates the
        // per-criterion split and restored `is_curated` and
        // `editorial_checked_at` without `editorial_image_at`, leaving the row
        // approved with criterion 1 outstanding.
        try {
          await writePlant(
            supabase,
            p.id,
            { image_url_curated: result.url },
            { preserveVerdict: true }
          )
          wrote(p.id)
        } catch (err) {
          console.log(
            `  ${p.common_name} — ${err instanceof Error ? err.message : String(err)}`
          )
          continue
        }
      }
      console.log(
        `  ${p.common_name} — ${apply ? 'now' : 'would use'} a 1920px rendition`
      )
      changed++
    }
  }

  // A dry run opens NO run: it measures and writes nothing.
  if (apply) {
    await withRunRecord(runOptions, (run) => applyAll((id) => run.wrote(id)))
  } else {
    await applyAll(() => {})
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
