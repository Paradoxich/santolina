/**
 * Fold the retired `provence` style tag into `mediterranean`.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none, and none ever will. WHAT ENDS IT: this
 * commit. It is a ONE-OFF (CLAUDE.md), so it ships already archived, with its
 * README row in the same change — run once, on the 2026-08-17 catalog, and kept
 * only as the record of how 37 rows changed.
 *
 * THE RULING. Ana, 2026-08-17, reading the re-tag's calibration report:
 * "provence is mediterranean isn't it". The evidence was in the report's own
 * confusable-pair table — `mediterranean` + `provence` co-occurred on 33 of the
 * 132 rows carrying either, the highest bleed of any pair by a wide margin, and
 * the two definitions differed only by degree ("reserve provence for the plants
 * a Provence planting is BUILT around"). A tag whose whole content is "the same
 * as that other tag, but more so" is a tag the model cannot apply consistently
 * and a reader cannot tell apart.
 *
 * IT COSTS NO EDITORIAL VERDICTS, and that is measured rather than hoped:
 * of the 37 rows carrying `provence`, **0 are `is_curated`** (counted against
 * the live catalog 2026-08-17, immediately before this ran). 33 of the 37
 * already carry `mediterranean`, so for them this only drops a tag; the other 4
 * gain `mediterranean` as they lose `provence`. Per CLAUDE.md, that count is
 * pasted here because it is the premise the safety of this write rests on.
 *
 * IT IS MECHANICAL, NOT EDITORIAL. Nothing is re-judged: a row the pass called
 * `provence` was called that under a definition that said "a Provence planting
 * is built around this", which is a subset of `mediterranean` by construction.
 * So this is a rename, and a rename does not need a model.
 *
 * Written through `reviewed-mutation.ts` rather than by hand — a guarded write
 * to rows carrying an editorial verdict is exactly what that module is for, and
 * this is its first caller besides `curate-styles`.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/archive/merge-provence-into-mediterranean.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/archive/merge-provence-into-mediterranean.ts
 */

import { getSupabaseAdmin } from '../../lib/supabase-admin'
import { fetchAllRows } from '../../lib/paginate'
import { withRunRecord, type Witness } from '../run-provenance'
import {
  openReviewedMutation,
  asMutationDb,
  formatReport,
  type MutationIntent,
} from '../reviewed-mutation'

const DRY_RUN = process.argv.slice(2).includes('--dry-run')

interface PlantRow {
  id: string
  scientific_name: string | null
  common_name: string
  style_tags: string[] | null
}

async function main() {
  const db = getSupabaseAdmin()

  const rows = await fetchAllRows<PlantRow>((from, to) =>
    db
      .from('plants')
      .select('id, scientific_name, common_name, style_tags')
      .contains('style_tags', ['provence'])
      .order('id')
      .range(from, to)
  )

  console.log(
    `\n${rows.length} row(s) carry \`provence\`${DRY_RUN ? ' — DRY RUN, no writes' : ''}\n`
  )
  if (rows.length === 0) {
    console.log('Nothing to merge.\n')
    return
  }

  const intents: MutationIntent[] = rows.map((row) => {
    const before = row.style_tags ?? []
    // Order is preserved except for the removal, and `mediterranean` is only
    // appended when it is genuinely absent — writing it twice would produce a
    // duplicate tag, which every consumer would then have to dedupe.
    const after = before.filter((t) => t !== 'provence')
    if (!after.includes('mediterranean')) after.push('mediterranean')
    return {
      id: row.id,
      label: row.scientific_name ?? row.common_name,
      from: { style_tags: before },
      to: { style_tags: after },
      why: 'provence retired into mediterranean (Ana, 2026-08-17)',
    }
  })

  const writer = openReviewedMutation({
    db: asMutationDb(db),
    table: 'plants',
    // `retire` rather than `skip`: if a curated row DID turn up, its verdict
    // about the tags should fall and be reported, not be silently skipped. The
    // header's count says there are none; the policy does not depend on that
    // count being right.
    onCurated: 'retire',
    dryRun: DRY_RUN,
  })

  const runOptions = {
    step: 'merge-provence-into-mediterranean',
    writeSet: ['style_tags'],
    // No stamp: this is a mechanical rename, not a judgment, so
    // `style_checked_at` deliberately does NOT move — the row's last real
    // judgment is still the one the re-tag made, and claiming otherwise would
    // make a rename look like a pass (trap 24's shape).
    evidence: [
      {
        kind: 'row-touched',
        covers: 'style_tags',
        table: 'plants',
        column: 'updated_at',
      },
    ] as Witness[],
    scope: `${rows.length} row(s) carrying provence`,
    recipe: {
      model: 'human',
      template: 'provence -> mediterranean, set-preserving, no re-judgment',
      ingredients: {},
      decoding: {},
    },
  }

  const report = DRY_RUN
    ? await writer.apply(intents)
    : await withRunRecord(runOptions, async (run) => writer.apply(intents, run))

  for (const o of report.outcomes) {
    const to = o.intent.to['style_tags'] as string[]
    console.log(
      `  ${o.disposition === 'written' ? (DRY_RUN ? '·' : '✓') : '--'} ${o.intent.label}: ` +
        `${JSON.stringify(o.intent.from['style_tags'])} → ${JSON.stringify(to)}`
    )
  }

  console.log('\n' + formatReport(report, { dryRun: DRY_RUN }))
  if (report.skipped_drift || report.missing) process.exit(1)
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}\n`)
  process.exit(1)
})
