// Foliage color → bucket mapping for the Explore color filter. Client-safe.
//
// Companion to lib/bloom-colors.ts, covering the second colour axis (Ana,
// July 24 2026: "Colour" means plant colour, not just bloom colour). Curation
// writes free descriptive values into plants.foliage_color ("silvery-grey",
// "marbled silver-green") ONLY when the foliage is notably distinctive —
// null is the deliberate encoding for "typical green" (see the foliage_color
// spec in scripts/curate-plants.ts).
//
// The one principle this file encodes: FOLIAGE MAPS ONLY WHEN DISTINCTIVE.
// Plain green foliage never maps to a bucket — every plant in the catalog has
// green foliage, so mapping it would make the Green filter match everything.
// Green-bucket membership is instead green blooms OR the curated is_greenery
// flag (see lib/plant-colors.ts). Seasonal turns ("crimson in autumn", "bronze
// when young") describe an event, not the plant's standing colour, and are
// ignored for the same reason.
//
// Blue-green / glaucous foliage folds into silver (Ana, July 24 2026): in a
// bed the eye groups blue fescue, rue and eucalyptus with the true silvers —
// one cool metallic family against the greens.
//
// scripts/check-bloom-colors.ts walks the catalog and fails on any value
// missing from this map — run it after every seed, same cadence as the
// cross-check.

/**
 * Raw foliage_color value → bucket. Bucket values are the shared vocabulary
 * from lib/bloom-colors' BLOOM_COLOR_BUCKETS — the two axes present as one
 * colour surface. Every catalog value must appear here or in
 * IGNORED_FOLIAGE_COLORS — the check script enforces it.
 */
export const FOLIAGE_RAW_TO_BUCKET: Record<string, string> = {
  // silver — the flagship foliage bucket, incl. the glaucous blue-greens
  silver: 'silver',
  'silver-grey': 'silver',
  'silvery-grey': 'silver',
  'silvery-white': 'silver',
  'grey-green': 'silver',
  'gray-green': 'silver',
  'blue-grey': 'silver',
  'blue-green': 'silver',
  'silver-green': 'silver',
  'silvery-green': 'silver',
  'silvery green': 'silver',
  'marbled silver-green': 'silver',
  'silver-marbled green': 'silver',
  'silver-marked green': 'silver',
  'silver-spotted green': 'silver',
  'grey-green with silver undersides': 'silver',
  'silvery grey-green with burgundy': 'silver',
  // burgundy — dark/moody standing foliage
  'near-black': 'burgundy',
  'bronze-purple': 'burgundy',
  'mottled bronze-maroon': 'burgundy',
  // orange — coppery standing foliage (e.g. the bronze sedges)
  'copper-orange': 'orange',
  'bronze-green': 'orange',
}

/**
 * Raw values that intentionally map to no bucket, in three groups:
 * plain greens (the default every plant has — see the header principle),
 * underside-only colour (not the plant's standing read), and seasonal turns
 * or cultivar-dependent values (events, not standing colour).
 */
export const IGNORED_FOLIAGE_COLORS = new Set([
  // plain green — the default, never a bucket
  'green',
  'dark green',
  'bright green',
  'glossy dark green',
  'soft green',
  'golden-green',
  'yellow-green',
  // underside-only
  'dark green with grey undersides',
  'silvery-white underside',
  // seasonal turns / indeterminate
  'bright green turning golden-yellow',
  'bronze when young',
  'bronze-green in winter',
  'bronze-tinted',
  'coppery-red new growth',
  'crimson in autumn',
  'golden yellow in autumn',
  'green tipped with red-purple',
  'green turning orange-red-purple',
  'red in winter',
  'red new growth',
  'red-bronze in autumn',
  'seasonal multi-color',
  'varies by cultivar - green, red, or purple',
  'purple-red or green',
  'glossy green, bronze-purple in winter',
  'mottled brown-green',
])

/** The buckets a plant's foliage_color falls into ([] for typical green). */
export function foliageBucketsForPlant(foliageColor: string | null): string[] {
  if (!foliageColor) return []
  const bucket = FOLIAGE_RAW_TO_BUCKET[foliageColor.trim().toLowerCase()]
  return bucket ? [bucket] : []
}
