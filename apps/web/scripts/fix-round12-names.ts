/**
 * Round-12 common-name editorial pass — the same corrective step rounds 7, 8
 * and 11 needed, for the same reason (trap 6, `docs/database-log.md`).
 *
 * WHICH STEP RUNS THIS, AND WHAT ENDS IT. It runs once, immediately after the
 * round-12 seed and before `run-round`, because `verify-round` FAILs on a
 * duplicate `common_name` and this batch seeded one. What ends it is round 12
 * closing; it is scoped to this round's rows by scientific name and is a no-op
 * afterwards.
 *
 * WHY. `common_name` comes straight from Trefle, which is a botanical source,
 * not a horticultural one. 28 rows landed all three documented defects:
 *
 *   1. NO NAME — 6 of 28 (21%, against round 8's 18%). Trefle has no English
 *      name and the mapper falls back to the scientific name, so an Explore
 *      card reads "Rodgersia pinnata" where every other card reads like
 *      something you could ask a nursery for.
 *   2. A NAME NOBODY USES — a flora name that is defensible and useless:
 *      "Cowflock" for the marsh marigold, "Premorse" for devil's-bit
 *      scabious, "Adder-wort" for common bistort, "Meadow cress" for the
 *      cuckooflower.
 *   3. A REAL COLLISION, and this round's is INTRA-round, which rounds 8 and
 *      11 did not hit: Trefle returned "Japanese iris" for BOTH Iris ensata
 *      and Iris laevigata, so the batch collided with itself. Iris ensata
 *      keeps it — hanashobu is the plant that name means. Iris laevigata
 *      becomes "Rabbitear iris" rather than "Japanese water iris", because a
 *      name differing from another by one adjective is a search problem, and
 *      because "water iris" would collide the day anyone seeds
 *      Iris pseudacorus (cut from this round, see seed-round12.ts).
 *
 * ONE MISLEADING NAME, trap 6's second defect: Myosotis scorpioides came back
 * as the bare "Forget-me-not". Unqualified that is the genus, and in a garden
 * catalog it is M. sylvatica, which this catalog already holds. It is the
 * WATER forget-me-not and is named so.
 *
 * WHAT THIS IS NOT. Following rounds 8 and 11's stated policy exactly, it does
 * NOT touch hyphenation or dialect preference. "Creeping-jenny",
 * "Hemp-agrimony", "Grassleaf sweet flag", "Aconite-leaf buttercup" and
 * "Przewalski's leopardplant" are USDA-style compounds that read stiffly and
 * are not wrong, so they stay. Changing them is taste, and taste is Ana's
 * voice pass. It does not flip `is_curated`, for the same reason.
 *
 * SAFETY — the same discipline as fix-round8-names.ts and fix-round11-names.ts:
 *   - Every entry carries the value it EXPECTS to find. A row whose live
 *     `common_name` has drifted is skipped and reported, never overwritten.
 *   - Only `is_curated = false` rows are touched.
 *   - Idempotent: a row already holding the target value is skipped.
 *   - Matched by `scientific_name`, which is stable, not by common_name.
 *   - Every target is re-checked against the whole catalog for a collision
 *     before it is written, and a colliding write is refused, not applied —
 *     "a name pass can create the collision it exists to remove".
 *
 * Usage (from apps/web) — dry run is the default, nothing writes without
 * --apply:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round12-names.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round12-names.ts --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'

interface Fix {
  scientific_name: string
  from: string // expected current value — drift guard
  to: string
  why: string
}

// --- Trefle had no English name; the mapper fell back to the scientific name.
const MISSING: Fix[] = [
  {
    scientific_name: 'Astilbe simplicifolia',
    from: 'Astilbe simplicifolia',
    to: 'Star astilbe',
    why: 'no English name from Trefle; the name it is sold under',
  },
  {
    scientific_name: 'Filipendula purpurea',
    from: 'Filipendula purpurea',
    to: 'Japanese meadowsweet',
    why: 'no English name from Trefle',
  },
  {
    scientific_name: 'Rodgersia pinnata',
    from: 'Rodgersia pinnata',
    to: 'Featherleaf rodgersia',
    why: 'no English name from Trefle',
  },
  {
    scientific_name: 'Sanguisorba obtusa',
    from: 'Sanguisorba obtusa',
    to: 'Japanese burnet',
    why: 'no English name from Trefle',
  },
  {
    scientific_name: 'Primula bulleyana',
    from: 'Primula bulleyana',
    to: "Bulley's primrose",
    why: 'no English name from Trefle',
  },
  {
    scientific_name: 'Erythranthe guttata',
    from: 'Erythranthe guttata',
    to: 'Common monkey flower',
    why: 'no English name; still widely sold as Mimulus guttatus',
  },
]

// --- flora names nobody uses in a garden.
const OBSCURE: Fix[] = [
  {
    scientific_name: 'Caltha palustris',
    from: 'Cowflock',
    to: 'Marsh marigold',
    why: 'a dialect name; marsh marigold is universal',
  },
  {
    scientific_name: 'Persicaria bistorta',
    from: 'Adder-wort',
    to: 'Common bistort',
    why: 'adder-wort is a herbal name; bistort is what it is sold as',
  },
  {
    scientific_name: 'Succisa pratensis',
    from: 'Premorse',
    to: "Devil's-bit scabious",
    why: '"premorse" describes the root, and names no plant to a gardener',
  },
  {
    scientific_name: 'Cardamine pratensis',
    from: 'Meadow cress',
    to: 'Cuckooflower',
    why: 'sold as cuckooflower or lady’s smock; "meadow cress" is a salad',
  },
]

// --- a name that belongs to a different species.
const MISLEADING: Fix[] = [
  {
    scientific_name: 'Myosotis scorpioides',
    from: 'Forget-me-not',
    to: 'Water forget-me-not',
    why: 'unqualified, the name means M. sylvatica, already in the catalog',
  },
]

// --- a name already held by another row (here: by this round's own sibling).
const COLLISIONS: Fix[] = [
  {
    scientific_name: 'Iris laevigata',
    from: 'Japanese iris',
    to: 'Rabbitear iris',
    why: 'Iris ensata is the Japanese iris; this batch collided with itself',
  },
]

const FIXES: Fix[] = [...MISSING, ...OBSCURE, ...MISLEADING, ...COLLISIONS]

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const db = getSupabaseAdmin()

  console.log(
    `\n${FIXES.length} name fixes (${MISSING.length} missing, ${OBSCURE.length} obscure, ${MISLEADING.length} misleading, ${COLLISIONS.length} collision).` +
      (apply ? '\n' : ' DRY RUN — pass --apply to write.\n')
  )

  // Collision pre-check: every target string, against the whole catalog.
  // A name pass can create the collision it exists to remove (trap 6), so a
  // colliding target is refused rather than written.
  // Paginated, not a bare .select(): the pre-check must see the WHOLE catalog
  // or the refusal it exists to raise stops firing exactly when the catalog is
  // big enough to make a collision likely (standing rule 5, 1000-row cap).
  const allNames = await fetchAllRows<{
    scientific_name: string
    common_name: string
  }>((from, to) =>
    db
      .from('plants')
      .select('scientific_name, common_name')
      .order('id')
      .range(from, to)
  )

  const heldBy = new Map<string, string[]>()
  for (const row of allNames) {
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
