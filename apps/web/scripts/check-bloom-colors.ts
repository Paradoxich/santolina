/**
 * Colour mapping guard — walks every plants.bloom_color AND
 * plants.foliage_color value in the catalog and fails (exit 1) if any value
 * is missing from its mapping (lib/bloom-colors' RAW_TO_BUCKET /
 * lib/foliage-colors' FOLIAGE_RAW_TO_BUCKET) and not explicitly in the
 * matching ignore set.
 *
 * New seed rounds invent new shades ("apricot", "plum", "pewter-green"); an
 * unmapped value silently falls out of the Explore colour filter. This turns
 * that silent gap into a loud one-line fix. NEVER writes to the DB.
 *
 * (Filename kept as check-bloom-colors for runbook stability; it has guarded
 * both colour axes since the plant-colour revision, July 2026.)
 *
 * Run after every seed round, same cadence as cross-check-plants:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-bloom-colors.ts
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { IGNORED_BLOOM_COLORS, RAW_TO_BUCKET } from '../lib/bloom-colors'
import {
  FOLIAGE_RAW_TO_BUCKET,
  IGNORED_FOLIAGE_COLORS,
} from '../lib/foliage-colors'

async function main() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('plants')
    .select('common_name, bloom_color, foliage_color')

  if (error) throw new Error(`Failed to load plants: ${error.message}`)

  // axis label → unmapped value → carrier plant names
  const unmapped = new Map<string, Map<string, string[]>>([
    ['bloom_color', new Map()],
    ['foliage_color', new Map()],
  ])
  const counts = { bloom_color: 0, foliage_color: 0 }

  const flag = (axis: string, value: string, carrier: string) => {
    const axisMap = unmapped.get(axis)!
    const carriers = axisMap.get(value) ?? []
    carriers.push(carrier)
    axisMap.set(value, carriers)
  }

  for (const plant of data ?? []) {
    for (const raw of plant.bloom_color ?? []) {
      counts.bloom_color++
      const value = raw.toLowerCase()
      if (RAW_TO_BUCKET[value] || IGNORED_BLOOM_COLORS.has(value)) continue
      flag('bloom_color', value, plant.common_name)
    }
    if (plant.foliage_color) {
      counts.foliage_color++
      const value = plant.foliage_color.trim().toLowerCase()
      if (!FOLIAGE_RAW_TO_BUCKET[value] && !IGNORED_FOLIAGE_COLORS.has(value))
        flag('foliage_color', value, plant.common_name)
    }
  }

  console.log(
    `Checked ${counts.bloom_color} bloom_color and ${counts.foliage_color} foliage_color values across ${data?.length ?? 0} plants.`
  )

  const totalUnmapped = [...unmapped.values()].reduce((n, m) => n + m.size, 0)
  if (totalUnmapped === 0) {
    console.log('All values mapped. The colour filter covers the catalog.')
    return
  }

  for (const [axis, axisMap] of unmapped) {
    if (axisMap.size === 0) continue
    console.error(`\n${axisMap.size} unmapped ${axis} value(s):`)
    for (const [value, carriers] of [...axisMap.entries()].sort()) {
      console.error(
        `  "${value}" — ${carriers.length} plant(s): ${carriers.slice(0, 5).join(', ')}${carriers.length > 5 ? ', …' : ''}`
      )
    }
  }
  console.error(
    '\nAdd each value to its map (lib/bloom-colors.ts RAW_TO_BUCKET / lib/foliage-colors.ts FOLIAGE_RAW_TO_BUCKET) or the matching ignore set.'
  )
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
