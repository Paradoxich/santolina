/**
 * Apply the "I can confirm the species" verdicts from an image-pick review.
 *
 * THE GAP THIS FILLS. `pick-plant-images.ts --verify` leaves a row `medium`
 * when it cannot confirm the species from the photograph — a Camassia it can
 * only place to genus, a fern whose diagnostic scales are out of frame. That
 * is an honest answer and no further model call improves it: the doubt is
 * about what is visible, not about how hard anyone looked.
 *
 * A person looking at the photo IS the thing that resolves it. Until this
 * script existed the review page could record that verdict and do nothing with
 * it — a reviewer could study twelve photographs, decide four were fine, and
 * every one stayed blocked from sign-off. The review was read-only for exactly
 * the rows it mattered most for.
 *
 * WHY A HUMAN "yes" OUTRANKS THE MODEL'S "unsure". It is not that people are
 * better at plant identification in general. It is that the reviewer has
 * context the model was deliberately denied: the catalog row it belongs to,
 * what the plant is for, and the ability to go and look something up. The
 * model was shown one photograph and asked to be strict, which is right for an
 * automated pass and is not the last word.
 *
 * Input is `reports/image-confirmations.txt` — the review page's "Export
 * confirmations" button. Same format as the revert list and the same parser:
 * a leading UUID per line, `#` lines ignored. The two lists are exported to
 * SEPARATE files on purpose. They ride in one textarea only as comments, and
 * an id that is live in one file must be inert in the other — pasting the
 * wrong block should do nothing, not do the other thing.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-image-confirmations.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-image-confirmations.ts --apply
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { parseRevertList } from '../lib/image-reverts'
import { writePlant } from '../lib/plants-write'

const DEFAULT_FILE = join(process.cwd(), 'reports', 'image-confirmations.txt')
const CONFIRM_REASON =
  'Reviewer confirmed the species from this photo, resolving the vision pass uncertainty.'

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
        ' paste the CONFIRMATIONS block into that file, then re-run.'
    )
    process.exit(1)
  }

  const ids = parseRevertList(text)
  if (ids.length === 0) {
    console.log(
      'No plant ids to confirm — the file has no un-commented id lines.'
    )
    return
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('plants')
    .select(
      'id, common_name, scientific_name, image_url_curated, image_pick_confidence'
    )
    .in('id', ids)
  if (error) throw new Error(`Load failed: ${error.message}`)

  const found = new Map((data ?? []).map((p) => [p.id, p]))
  const missing = ids.filter((id) => !found.has(id))

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN —'} ${ids.length} confirmation(s) from ${file}.\n`
  )

  let confirmed = 0
  let noop = 0
  let noHero = 0

  for (const id of ids) {
    const p = found.get(id)
    if (!p) continue

    // Confirming the species of a photograph that isn't the hero would write a
    // judgment about an image nobody is looking at.
    if (!p.image_url_curated) {
      console.log(`  ${p.common_name} — SKIP: no hero image to confirm`)
      noHero++
      continue
    }
    if (p.image_pick_confidence === 'high') {
      console.log(`  ${p.common_name} — already high, nothing to do`)
      noop++
      continue
    }

    if (apply) {
      // `claim: ['image']` because confirming the species IS criterion 1 of the
      // editorial bar being cleared, by the strongest evidence available
      // (migration 20260729140000). The stamp has to land in the same statement
      // as the confidence change or the change withdraws the approval it was
      // recording — punishing the row for getting BETTER, which is what
      // happened to round 7's 18 confirmed heroes. `plants-write.ts` owns that
      // rule now.
      //
      // It also settles `is_curated`, which this script never did. A row held
      // on its image alone clears the bar the moment this runs, and used to sit
      // unapproved until someone paid for an editorial pass to notice.
      try {
        await writePlant(
          supabase,
          id,
          {
            image_pick_confidence: 'high',
            image_pick_reason: CONFIRM_REASON,
            // A human look is a verification, and the strongest one available.
            image_verified_at: new Date().toISOString(),
          },
          { claim: ['image'] }
        )
      } catch (err) {
        console.log(
          `  ${p.common_name} — ${err instanceof Error ? err.message : String(err)}`
        )
        continue
      }
    }
    console.log(
      `  ${p.common_name} — ${apply ? 'confirmed' : 'would confirm'} (${p.image_pick_confidence ?? 'no'} → high)`
    )
    confirmed++
  }

  console.log(
    `\n${apply ? 'Done' : 'Dry run'}: ${confirmed} ${apply ? 'confirmed' : 'to confirm'}, ` +
      `${noop} already high, ${noHero} with no hero` +
      (missing.length
        ? `, ${missing.length} id(s) not found in the catalog`
        : '') +
      '.'
  )
  if (apply && confirmed > 0) {
    console.log(
      '\nCriterion 1 is now cleared on these rows. If their description and ' +
        'tags are not yet cleared, the editorial pass will judge just those:\n' +
        '  ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-editorial.ts --round <label> --new-only'
    )
  }
  if (!apply && confirmed > 0) {
    console.log('\nRe-run with --apply to write these changes.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
