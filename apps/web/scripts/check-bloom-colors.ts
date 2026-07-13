/**
 * Bloom color mapping guard — walks every plants.bloom_color value in the
 * catalog and fails (exit 1) if any value is missing from lib/bloom-colors'
 * RAW_TO_BUCKET map (and not explicitly in IGNORED_BLOOM_COLORS).
 *
 * New seed rounds invent new shades ("apricot", "plum"); an unmapped value
 * silently falls out of the Explore color filter. This turns that silent gap
 * into a loud one-line fix. NEVER writes to the DB.
 *
 * Run after every seed round, same cadence as cross-check-plants:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-bloom-colors.ts
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { IGNORED_BLOOM_COLORS, RAW_TO_BUCKET } from '../lib/bloom-colors'

async function main() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('plants')
    .select('common_name, bloom_color')
    .not('bloom_color', 'is', null)

  if (error) throw new Error(`Failed to load plants: ${error.message}`)

  const unmapped = new Map<string, string[]>()
  let checked = 0

  for (const plant of data ?? []) {
    for (const raw of plant.bloom_color ?? []) {
      checked++
      const value = raw.toLowerCase()
      if (RAW_TO_BUCKET[value] || IGNORED_BLOOM_COLORS.has(value)) continue
      const carriers = unmapped.get(value) ?? []
      carriers.push(plant.common_name)
      unmapped.set(value, carriers)
    }
  }

  console.log(
    `Checked ${checked} bloom_color values across ${data?.length ?? 0} plants.`
  )

  if (unmapped.size === 0) {
    console.log('All values mapped. The color filter covers the catalog.')
    return
  }

  console.error(`\n${unmapped.size} unmapped value(s):`)
  for (const [value, carriers] of [...unmapped.entries()].sort()) {
    console.error(
      `  "${value}" — ${carriers.length} plant(s): ${carriers.slice(0, 5).join(', ')}${carriers.length > 5 ? ', …' : ''}`
    )
  }
  console.error(
    '\nAdd each value to RAW_TO_BUCKET (or IGNORED_BLOOM_COLORS) in lib/bloom-colors.ts.'
  )
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
