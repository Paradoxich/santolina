/**
 * Point a plant's hero at a SPECIFIC candidate photograph.
 *
 * THE GAP THIS FILLS. Two human-verdict paths already exist and neither can
 * express this one. `apply-image-reverts.ts` points `image_url_curated` back at
 * `image_url`, so it can only ever choose the photo Trefle listed first.
 * `apply-image-confirmations.ts` records that a person trusts the photo already
 * in place. Between them there is no way to say **"the pick chose the wrong
 * photograph, use this other candidate"** — which is what a wrong-species hero
 * needs, and re-running the pass cannot fix it: the pass already compared these
 * candidates and preferred the one that is wrong.
 *
 * The case it was written for: `Seaside petunia` (`Calibrachoa parviflora`) was
 * live in Explore showing a double YELLOW garden hybrid. The species is small
 * and violet, and a labelled Commons photograph of the true species was sitting
 * in the row's own `image_candidates`, having lost the comparison. See the
 * 2026-07-30 entry in docs/database-log.md.
 *
 * WHY THIS IS NOT A RE-ROLL OF A JUDGMENT WE DISLIKE. The pick answers "which
 * of these is the nicest photograph?" and it answered honestly. This answers a
 * question it was never asked: "is this the right SPECIES?" A person who has
 * looked at both files and read the name has evidence the model was denied,
 * which is the same reasoning `apply-image-confirmations.ts` rests on.
 *
 * THE URL MUST ALREADY BE ONE OF THE ROW'S CANDIDATES. That is the whole safety
 * property. It means the photo has been probed, measured, licence-checked and
 * (for Wikimedia) attributed by the feeder, so this script cannot introduce an
 * unvetted URL, a non-commercial licence, or a host that next/image will refuse
 * to serve. Its attribution travels with it, so the credit line stays correct.
 *
 * DRY RUN BY DEFAULT (house discipline). Pass --apply to write.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/set-plant-hero.ts \
 *     --id <uuid> --url <candidate url> --why "correct species; the pick took a hybrid"
 *   # then the same command with --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { writePlant } from '../lib/plants-write'
import { withRunRecord, type Witness } from './run-provenance'
import type { ImageCandidate } from '../lib/image-shortlist'

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
  const id = parseFlag('--id')
  const url = parseFlag('--url')
  const why = parseFlag('--why')

  if (!id || !url || !why) {
    console.error(
      'set-plant-hero needs --id <uuid>, --url <candidate url> and --why "<reason>".\n\n' +
        '--why is mandatory and is stored in image_pick_reason: this write overrides\n' +
        'an automated judgment, so the record has to say on whose authority and why.'
    )
    process.exit(1)
  }

  const supabase = getSupabaseAdmin()
  const { data: plant, error } = await supabase
    .from('plants')
    .select(
      'id, common_name, scientific_name, image_url, image_url_curated, image_pick_confidence, image_candidates'
    )
    .eq('id', id)
    .single()
  if (error) throw new Error(`Load failed: ${error.message}`)

  const candidates = (plant.image_candidates ?? []) as ImageCandidate[]
  const chosen = candidates.find((c) => c.url === url)

  // Refusing an unknown URL is the point, not a formality — see the header.
  if (!chosen) {
    console.error(
      `That URL is not one of ${plant.common_name}'s ${candidates.length} candidate(s), so it has\n` +
        'never been probed, measured or licence-checked. Feed it in first\n' +
        '(scripts/feed-wikimedia-candidates.ts) and let the pass see it.'
    )
    process.exit(1)
  }
  if (plant.image_url_curated === url) {
    console.log(`${plant.common_name} — already the hero, nothing to do.`)
    return
  }

  const attribution = chosen.attribution ?? null
  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN —'} hero override for ${plant.common_name} (${plant.scientific_name}).\n`
  )
  console.log(`  from: ${plant.image_url_curated ?? '(none)'}`)
  console.log(`    to: ${url}`)
  console.log(
    `source: ${chosen.source ?? 'trefle'} / category "${chosen.category}"`
  )
  console.log(
    ` credit: ${attribution ? `${attribution.artist ?? 'unknown'} — ${attribution.license ?? 'unknown licence'}` : '(none: a Trefle photo needs no credit)'}`
  )
  console.log(`   why: ${why}`)

  if (!apply) {
    console.log('\nDry run: nothing written. Re-run with --apply.')
    return
  }

  // `claim: ['image']` for the same reason apply-image-confirmations claims it:
  // deciding the hero shows the right species IS criterion 1 of the editorial
  // bar being cleared, by the strongest evidence there is. The stamp has to
  // land in the same statement as the change, or the change withdraws the
  // approval it is recording. plants-write.ts owns that rule and also settles
  // is_curated, so a row held on its image alone clears the moment this runs.
  //
  // Attribution is written even when null: a Trefle photo winning must CLEAR a
  // credit left behind by a previous Wikimedia hero, or the page credits a
  // photographer whose photo is no longer on it.
  await withRunRecord(
    {
      step: 'set-plant-hero',
      writeSet: [
        'image_url_curated',
        'image_attribution',
        'image_pick_confidence',
        'image_pick_reason',
        'image_verified_at',
        'is_curated',
      ],
      // image_verified_at is SET, so it witnesses itself. The rest are value
      // columns; image_attribution may be written as NULL, and a nulled column
      // matches no window, so it could not witness itself even as a stamp.
      evidence: [
        {
          kind: 'stamp',
          covers: 'image_verified_at',
          column: 'image_verified_at',
        },
        ...(
          [
            'image_url_curated',
            'image_attribution',
            'image_pick_confidence',
            'image_pick_reason',
            'is_curated',
          ] as const
        ).map((covers) => ({
          kind: 'row-touched' as const,
          covers,
          table: 'plants' as const,
          column: 'updated_at',
        })),
      ] as Witness[],
      scope: `${plant.scientific_name} (${id})`,
      // A person overrode an automated judgment. `--why` is mandatory and is
      // the entire recipe: there is no model and no prompt, and the reason is
      // what makes this write reviewable at all.
      recipe: { model: 'human', template: why, ingredients: {}, decoding: {} },
    },
    async (run) => {
      await writePlant(
        supabase,
        id,
        {
          image_url_curated: url,
          image_attribution: attribution,
          image_pick_confidence: 'high',
          image_pick_reason: `manual hero override: ${why}`,
          image_verified_at: new Date().toISOString(),
        },
        { claim: ['image'] }
      )
      run.wrote(id)
    }
  )

  console.log('\nDone. Hero replaced and the image criterion claimed.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
