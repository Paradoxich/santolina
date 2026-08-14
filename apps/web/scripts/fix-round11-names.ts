/**
 * Round-11 common-name editorial pass — the same corrective step rounds 7 and
 * 8 needed, for the same reason (trap 6, `docs/database-log.md`).
 *
 * WHY. `common_name` comes straight from Trefle, which is a botanical source,
 * not a horticultural one, so a seed batch reliably lands names that are
 * defensible in a flora and wrong in a garden catalog. Round 11 was 25 rows
 * and landed all four of the documented defects:
 *
 *   1. NO NAME — Trefle has no English name and the mapper falls back to the
 *      scientific name, so the Explore card reads "Cenolophium denudatum"
 *      where every other card reads like something you could ask a nursery
 *      for. 6 of 25 rows this round.
 *   2. WRONG OR MISLEADING NAME — "Indian-gum" for Silphium perfoliatum (an
 *      obscure resin name; the plant is universally sold as cup plant), and
 *      "Needle grass" for Achnatherum calamagrostis, which is the name of a
 *      DIFFERENT group of grasses this catalog already stocks (Stipa,
 *      Nassella — "Argentine needlegrass" is already a row).
 *   3. A REAL COLLISION — Trefle returned "Woodbine" for Parthenocissus
 *      quinquefolia. Woodbine is Lonicera periclymenum, which is ALREADY IN
 *      THE CATALOG under exactly that name. Left alone, two unrelated
 *      climbers share one name and the search box cannot separate them.
 *      `verify-round` FAILs on duplicate common_name, by design.
 *   4. TYPO AND CASING — "Miss willmot's-ghost" (the plantswoman was Ellen
 *      Willmott, two Ts) and "New york ironweed".
 *
 * WHAT THIS IS NOT. Following round 8's stated policy exactly, it does NOT
 * touch hyphenation or dialect preference. "Cup-and-saucer-vine",
 * "Chinese trumpet-creeper", "Clustered mountain-mint", "Asian-jasmine" and
 * "Heavenly-blue morning-glory" are USDA-style compounds that read a little
 * stiffly and are not wrong, so they stay. Changing them would be taste, and
 * taste is Ana's voice pass, not a mechanical name fix. It does not flip
 * `is_curated` for the same reason.
 *
 * ONE PLANNED FIX WAS DROPPED BY THE PRE-CHECK, and it is the reason this
 * script had a pre-check at all. The plan was to rename Hydrangea petiolaris
 * "Japanese climbing hydrangea" → "Climbing hydrangea", the standard garden
 * name. Checking every target string against the live catalog first showed
 * "Climbing hydrangea" is ALREADY HELD by Hydrangea anomala (seeded July 8).
 * The rename would have manufactured the exact collision this pass exists to
 * remove — trap 6's corollary, "a name pass can create the collision it
 * exists to remove", firing on its first outing here. Trefle's own name is
 * both accurate and distinguishing, so it stays.
 *
 * SEPARATELY, FOR ANA, NOT DECIDED HERE: that pre-check surfaced a catalog
 * composition question. Hydrangea anomala (Himalayan) and Hydrangea
 * petiolaris (Japanese/Korean) are both `status: accepted, rank: species` in
 * Trefle and are kept as two rows on that basis — but H. petiolaris lists
 * "Hydrangea anomala subsp. petiolaris" among its synonyms, and the plant
 * sold in Europe as "climbing hydrangea" is that subspecies. So the catalog
 * now offers a beginner two very similar climbing hydrangeas. Whether it
 * should is a species-list judgment, which is Ana's, so nothing was deleted:
 * overriding the source's taxonomy on our own read is not a mechanical fix.
 *
 * SAFETY — the same discipline as fix-round8-names.ts:
 *   - Every entry carries the value it EXPECTS to find. A row whose live
 *     `common_name` has drifted is skipped and reported, never overwritten.
 *   - Only `is_curated = false` rows are touched.
 *   - Idempotent: a row already holding the target value is skipped.
 *   - Matched by `scientific_name`, which is stable, not by common_name.
 *   - Every target is re-checked against the whole catalog for a collision
 *     before it is written, and a colliding write is refused, not applied.
 *
 * Usage (from apps/web) — dry run is the default, nothing writes without
 * --apply:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round11-names.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round11-names.ts --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'

interface Fix {
  scientific_name: string
  from: string // expected current value — drift guard
  to: string
  why: string
}

// --- Trefle had no English name; the mapper fell back to the scientific name.
const MISSING: Fix[] = [
  {
    scientific_name: 'Eutrochium purpureum',
    from: 'Eutrochium purpureum',
    to: 'Sweet Joe-Pye weed',
    why: 'no English name from Trefle; the name it is sold under',
  },
  {
    scientific_name: 'Ligusticopsis wallichiana',
    from: 'Ligusticopsis wallichiana',
    to: 'Wallich milk parsley',
    why: 'no English name; still sold as Selinum wallichianum',
  },
  {
    scientific_name: 'Cenolophium denudatum',
    from: 'Cenolophium denudatum',
    to: 'Baltic parsley',
    why: 'no English name from Trefle',
  },
  {
    scientific_name: 'Hydrangea hydrangeoides',
    from: 'Hydrangea hydrangeoides',
    to: 'Japanese hydrangea vine',
    why: 'no English name; the name it is sold under as Schizophragma',
  },
  {
    scientific_name: 'Eccremocarpus scaber',
    from: 'Eccremocarpus scaber',
    to: 'Chilean glory flower',
    why: 'no English name from Trefle',
  },
  {
    scientific_name: 'Rhodochiton atrosanguineum',
    from: 'Rhodochiton atrosanguineum',
    to: 'Purple bell vine',
    why: 'no English name from Trefle',
  },
]

// --- names that are obscure, or belong to a different plant.
const WRONG: Fix[] = [
  {
    scientific_name: 'Silphium perfoliatum',
    from: 'Indian-gum',
    to: 'Cup plant',
    why: 'resin name; "cup plant" describes the leaves that hold rain',
  },
  {
    scientific_name: 'Muhlenbergia capillaris',
    from: 'Purple grass',
    to: 'Pink muhly grass',
    why: '"Purple grass" names no particular plant; this is the trade name',
  },
  {
    scientific_name: 'Achnatherum calamagrostis',
    from: 'Needle grass',
    to: 'Silver spear grass',
    why: 'needle grass means Stipa/Nassella, both already in the catalog',
  },
  {
    scientific_name: 'Echinacea pallida',
    from: 'Pale echinacea',
    to: 'Pale purple coneflower',
    why: 'half-latin hybrid; coneflower is what the genus is sold as',
  },
]

// --- typo and casing (proper nouns).
const TYPOS: Fix[] = [
  {
    scientific_name: 'Eryngium giganteum',
    from: "Miss willmot's-ghost",
    to: "Miss Willmott's ghost",
    why: 'Ellen Willmott, two Ts, and a proper noun',
  },
  {
    scientific_name: 'Vernonia noveboracensis',
    from: 'New york ironweed',
    to: 'New York ironweed',
    why: 'proper noun',
  },
]

// --- a name already held by a different species in the catalog.
const COLLISIONS: Fix[] = [
  {
    scientific_name: 'Parthenocissus quinquefolia',
    from: 'Woodbine',
    to: 'Virginia creeper',
    why: 'Woodbine is Lonicera periclymenum, already held under that name',
  },
]

const FIXES: Fix[] = [...MISSING, ...WRONG, ...TYPOS, ...COLLISIONS]

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const db = getSupabaseAdmin()

  console.log(
    `\n${FIXES.length} name fixes (${MISSING.length} missing, ${WRONG.length} wrong, ${TYPOS.length} typo/casing, ${COLLISIONS.length} collision).` +
      (apply ? '\n' : ' DRY RUN — pass --apply to write.\n')
  )

  // Collision pre-check: every target string, against the whole catalog.
  // A name pass can create the collision it exists to remove (trap 6), so a
  // colliding target is refused rather than written.
  const { data: allNames, error: nameErr } = await db
    .from('plants')
    .select('scientific_name, common_name')
  if (nameErr) throw new Error(`collision pre-check: ${nameErr.message}`)

  const heldBy = new Map<string, string[]>()
  for (const row of allNames ?? []) {
    if (!row.common_name) continue
    const key = row.common_name.toLowerCase()
    heldBy.set(key, [...(heldBy.get(key) ?? []), row.scientific_name])
  }

  const blocked = new Set<string>()
  for (const fix of FIXES) {
    const holders = (heldBy.get(fix.to.toLowerCase()) ?? []).filter(
      (s) => s !== fix.scientific_name // a row already holding its own target is fine
    )
    if (holders.length) {
      blocked.add(fix.scientific_name)
      console.log(
        `  ✗   REFUSED "${fix.to}" for ${fix.scientific_name} — already held by ${holders.join(', ')}`
      )
    }
  }
  if (blocked.size) console.log('')

  let changed = 0
  const already: string[] = []
  const drifted: string[] = []
  const missingRow: string[] = []
  const curated: string[] = []

  for (const fix of FIXES) {
    if (blocked.has(fix.scientific_name)) continue

    const { data, error } = await db
      .from('plants')
      .select('id, common_name, is_curated')
      .eq('scientific_name', fix.scientific_name)
      .maybeSingle()

    if (error) throw new Error(`${fix.scientific_name}: ${error.message}`)
    if (!data) {
      missingRow.push(fix.scientific_name)
      console.log(`  ??  ${fix.scientific_name} — no such row`)
      continue
    }
    if (data.common_name === fix.to) {
      already.push(fix.scientific_name)
      continue
    }
    if (data.is_curated) {
      curated.push(fix.scientific_name)
      console.log(`  --  ${fix.scientific_name} — is_curated, frozen`)
      continue
    }
    if (data.common_name !== fix.from) {
      drifted.push(fix.scientific_name)
      console.log(
        `  !!  ${fix.scientific_name} — expected "${fix.from}", found "${data.common_name}" — skipped`
      )
      continue
    }

    if (apply) {
      const { error: upErr } = await db
        .from('plants')
        .update({ common_name: fix.to })
        .eq('id', data.id)
      if (upErr) throw new Error(`${fix.scientific_name}: ${upErr.message}`)
    }
    changed++
    console.log(
      `  ${apply ? '✓' : '·'}   "${fix.from}" → "${fix.to}"  (${fix.scientific_name}) — ${fix.why}`
    )
  }

  console.log('\n─────────────────────────────────────────')
  console.log(
    `${apply ? 'Updated' : 'Would update'}: ${changed}  ·  already correct: ${already.length}  ·  drifted (skipped): ${drifted.length}  ·  frozen: ${curated.length}  ·  no row: ${missingRow.length}  ·  refused (collision): ${blocked.size}`
  )
  if (!apply && changed) console.log('\nRe-run with --apply to write.')
  if (blocked.size) process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
