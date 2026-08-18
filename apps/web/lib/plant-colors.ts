// The one colour surface for Explore. Client-safe.
//
// "Colour" in the filter means plant colour, not bloom colour. A plant matches a bucket when it BRINGS that colour — through blooms
// (lib/bloom-colors.ts) or through distinctive standing foliage
// (lib/foliage-colors.ts). Multi-membership is a feature: santolina matches
// Silver (foliage, most of the year) AND Yellow (blooms, briefly), and both
// answers are honest.
//
// Green is the one exception, because "brings green" is degenerate — every
// plant has green foliage. For Green the question flips from "brings" to
// "is considered greenery": green blooms (rare, real) OR the curated
// plants.is_greenery flag (boxwood, laurel, ferns — grown for green mass and
// form, blooms an afterthought). Plain green foliage values never map (see
// lib/foliage-colors.ts), so foliage cannot flood the Green bucket.

import { bucketsForPlant } from './bloom-colors'
import { foliageBucketsForPlant } from './foliage-colors'

/** The unique colour buckets a plant matches, across both axes. */
export function colorBucketsForPlant(plant: {
  bloomColor: string[]
  foliageColor: string | null
  greenery: boolean
}): string[] {
  const buckets = new Set<string>([
    ...bucketsForPlant(plant.bloomColor),
    ...foliageBucketsForPlant(plant.foliageColor),
  ])
  if (plant.greenery) buckets.add('green')
  return [...buckets]
}
