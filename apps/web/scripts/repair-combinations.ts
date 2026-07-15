/**
 * One-off repair for the damage curate-combinations.ts caused while it read
 * existing pairs unpaginated (a bare Supabase select caps at 1000 rows;
 * plant_combinations passed that in round 6). Working off a truncated set, it
 * re-inserted pairs it couldn't see and overshot the 5-companion cap. The
 * script itself is fixed (scripts/paginate.ts); this cleans up what already
 * landed. verify-round.ts flags both classes.
 *
 * Two passes, in order:
 *   1. Duplicate pairs — same unordered {a,b} present more than once. Keep the
 *      oldest row (created_at, then id), delete the rest.
 *   2. Over-cap plants — after dedup, anyone with >5 companions is trimmed back
 *      to 5. Greedy: repeatedly take the most-over-cap plant and drop one of
 *      its edges, preferring an edge whose OTHER end is also over cap (fixes
 *      two at once), then the weakest strength, then the newest.
 *
 * Deletes rows by id; never inserts or edits. Dry-run by default; --apply
 * writes. Run backup-catalog.ts first.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/repair-combinations.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/repair-combinations.ts --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from './paginate'

const COMPANION_CAP = 5
const STRENGTH_RANK: Record<string, number> = {
  weak: 0,
  moderate: 1,
  strong: 2,
}

interface Combo {
  id: string
  created_at: string
  plant_id_a: string
  plant_id_b: string
  strength: string | null
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

// Delete-preference order for a single row: weakest strength first, then
// newest (latest created_at, then id) — so trimming keeps the strongest,
// oldest-established pairings.
function lessDeletable(a: Combo, b: Combo): number {
  const sa = STRENGTH_RANK[a.strength ?? 'moderate'] ?? 1
  const sb = STRENGTH_RANK[b.strength ?? 'moderate'] ?? 1
  if (sa !== sb) return sa - sb // weaker (lower rank) sorts first = deleted first
  if (a.created_at !== b.created_at) return b.created_at < a.created_at ? -1 : 1
  return a.id < b.id ? 1 : -1 // newer id first
}

function dedupe(
  combos: Combo[],
  name: (id: string) => string
): { keep: Combo[]; drop: Combo[] } {
  const groups = new Map<string, Combo[]>()
  for (const c of combos) {
    const key = pairKey(c.plant_id_a, c.plant_id_b)
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const keep: Combo[] = []
  const drop: Combo[] = []
  for (const rows of groups.values()) {
    if (rows.length === 1) {
      keep.push(rows[0]!)
      continue
    }
    // Keep the oldest (created_at, then id); drop the rest.
    const sorted = [...rows].sort((a, b) =>
      a.created_at !== b.created_at
        ? a.created_at < b.created_at
          ? -1
          : 1
        : a.id < b.id
          ? -1
          : 1
    )
    keep.push(sorted[0]!)
    for (const r of sorted.slice(1)) {
      drop.push(r)
      console.log(
        `  dup: ${name(r.plant_id_a)} ↔ ${name(r.plant_id_b)} ` +
          `(keeping ${sorted[0]!.id.slice(0, 8)}, dropping ${r.id.slice(0, 8)})`
      )
    }
  }
  return { keep, drop }
}

function trimOverCap(
  combos: Combo[],
  name: (id: string) => string
): { survivors: Combo[]; drop: Combo[] } {
  const edges = new Map<string, Combo>(combos.map((c) => [c.id, c]))
  const degree = new Map<string, number>()
  for (const c of combos) {
    degree.set(c.plant_id_a, (degree.get(c.plant_id_a) ?? 0) + 1)
    degree.set(c.plant_id_b, (degree.get(c.plant_id_b) ?? 0) + 1)
  }
  const drop: Combo[] = []

  const overCap = () =>
    [...degree.entries()]
      .filter(([, d]) => d > COMPANION_CAP)
      .sort((a, b) => b[1] - a[1])

  for (let over = overCap(); over.length; over = overCap()) {
    const [plant] = over[0]!
    const incident = [...edges.values()].filter(
      (c) => c.plant_id_a === plant || c.plant_id_b === plant
    )
    // Choose the edge to delete: never orphan a neighbor that has only this
    // one companion left (those edges sort last); then prefer the other
    // endpoint also over cap (fixes two at once); then weakest/newest.
    incident.sort((a, b) => {
      const otherA = a.plant_id_a === plant ? a.plant_id_b : a.plant_id_a
      const otherB = b.plant_id_a === plant ? b.plant_id_b : b.plant_id_a
      const aOrphan = (degree.get(otherA) ?? 0) <= 1 ? 1 : 0
      const bOrphan = (degree.get(otherB) ?? 0) <= 1 ? 1 : 0
      if (aOrphan !== bOrphan) return aOrphan - bOrphan // orphaning edge last
      const aBoth = (degree.get(otherA) ?? 0) > COMPANION_CAP ? 1 : 0
      const bBoth = (degree.get(otherB) ?? 0) > COMPANION_CAP ? 1 : 0
      if (aBoth !== bBoth) return bBoth - aBoth // both-over-cap first
      return lessDeletable(a, b)
    })
    const victim = incident[0]!
    edges.delete(victim.id)
    drop.push(victim)
    degree.set(victim.plant_id_a, (degree.get(victim.plant_id_a) ?? 0) - 1)
    degree.set(victim.plant_id_b, (degree.get(victim.plant_id_b) ?? 0) - 1)
    console.log(
      `  trim: ${name(plant)} over cap — dropping ` +
        `${name(victim.plant_id_a)} ↔ ${name(victim.plant_id_b)} ` +
        `(${victim.strength ?? '?'})`
    )
  }

  return { survivors: [...edges.values()], drop }
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const db = getSupabaseAdmin()

  console.log(
    apply ? 'REPAIR — writing to the live DB.' : 'Dry run — no writes.'
  )

  const plants = await fetchAllRows<{ id: string; common_name: string }>(
    (from, to) =>
      db.from('plants').select('id, common_name').order('id').range(from, to)
  )
  const nameById = new Map(plants.map((p) => [p.id, p.common_name]))
  const name = (id: string) => nameById.get(id) ?? id.slice(0, 8)

  const combos = await fetchAllRows<Combo>((from, to) =>
    db
      .from('plant_combinations')
      .select('id, created_at, plant_id_a, plant_id_b, strength')
      .order('id')
      .range(from, to)
  )
  console.log(`\nLoaded ${combos.length} combination row(s).\n`)

  console.log('Pass 1 — duplicate pairs:')
  const { keep, drop: dupDrops } = dedupe(combos, name)
  if (!dupDrops.length) console.log('  none')

  console.log('\nPass 2 — over-cap trim (after dedup):')
  const { drop: capDrops } = trimOverCap(keep, name)
  if (!capDrops.length) console.log('  none')

  const allDrops = [...dupDrops, ...capDrops]
  console.log(
    `\nPlan: delete ${dupDrops.length} duplicate + ${capDrops.length} ` +
      `over-cap = ${allDrops.length} row(s); ${combos.length - allDrops.length} remain.`
  )

  if (!apply) {
    console.log('\nRe-run with --apply to delete these rows.')
    return
  }
  if (!allDrops.length) return

  const ids = allDrops.map((c) => c.id)
  const batchSize = 100
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const { error } = await db
      .from('plant_combinations')
      .delete()
      .in('id', batch)
    if (error) throw new Error(`Delete failed: ${error.message}`)
  }
  console.log(`\n✓ Deleted ${ids.length} row(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
