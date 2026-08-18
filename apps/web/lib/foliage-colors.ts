// Foliage color → bucket mapping for the Explore color filter. Client-safe.
//
// Companion to lib/bloom-colors.ts, covering the second colour axis. Curation
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
// Blue-green / glaucous foliage folds into silver: in a
// bed the eye groups blue fescue, rue and eucalyptus with the true silvers —
// one cool metallic family against the greens.
//
// MIXED VALUES BUCKET BY GROUND COLOUR, NOT MARKING (round 8 ruling, written
// down 2026-08-13). "Burgundy and silver markings" is a burgundy leaf marked
// silver → burgundy; "silvery grey-green with burgundy" is a silver-grey leaf
// with burgundy in it → silver. The bucket answers "what colour is the leaf
// you'd see across the bed", and that is the ground, never the accent.
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
  // ground colour, not marking: a silver-grey leaf WITH burgundy stays silver
  // (Athyrium niponicum) — see the header rule
  'silvery grey-green with burgundy': 'silver',
  'dark green with silver veining': 'silver',
  // burgundy — dark/moody standing foliage
  'near-black': 'burgundy',
  'bronze-purple': 'burgundy',
  'mottled bronze-maroon': 'burgundy',
  // ground colour, not marking: a burgundy leaf MARKED silver stays burgundy
  // (Heuchera americana) — the mirror of the Athyrium row above
  'burgundy and silver markings': 'burgundy',
  // pink — variegation that is the species' own standing colour, not a
  // cultivar selection (Actinidia kolomikta colours its own leaf tips)
  'variegated pink and white': 'pink',
  // orange — coppery standing foliage (e.g. the bronze sedges)
  'copper-orange': 'orange',
  'bronze-green': 'orange',
  // Round 9 brought the bronze sedges themselves. For Carex buchananii and
  // C. comans the bronze IS the standing colour all year — not a seasonal
  // turn, which is the distinction this file exists to keep.
  'coppery-bronze': 'orange',
  'bronze-brown': 'orange',
  // Glaucous blue-green folds into silver — the purple
  // cast does not move it out of the cool metallic family.
  'blue-green with purple tones': 'silver',
  // Round 10 — pot succulents. Grey/blue-green base with an accent tip or
  // edge stays in the same family as the other "X with Y" silver rows above
  // (e.g. 'grey-green with silver undersides'); the accent doesn't move the
  // standing read out of the cool metallic family.
  'grey-green with purple-red tips': 'silver', // Sempervivum calcareum
  'powdery blue-grey': 'silver', // Echeveria elegans
  'blue-green with red edges': 'silver', // Aeonium haworthii
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
  'bronze-tinted green',
  'dark green with golden scales',
  'spotted green',
  // underside-only
  'dark green with grey undersides',
  'silvery-white underside',
  'variegated green with burgundy undersides',
  // seasonal turns / indeterminate
  'bright green turning golden-yellow',
  // round 13, Cryptomeria japonica. The winter bronzing is real and is half of
  // why the tree is planted, but the value is BOTH halves of the ignore rule at
  // once: a plain green standing colour, plus a seasonal turn. It is cultivar
  // dependent too, since some selections hold their green and the golden forms
  // do something else again. If winter colour ever becomes a filter it belongs
  // on a seasonal axis, not in the standing-colour bucket.
  'bright green, turning bronze in winter',
  'bronze when young',
  'bronze-green in winter',
  'bronze-tinted',
  'coppery-red new growth',
  'crimson in autumn',
  'golden yellow in autumn',
  'green tipped with red-purple',
  // round 9, Sempervivum montanum — same case as the line above: a green
  // rosette with coloured tips reads green in a bed
  'green tinged red-purple',
  'green turning orange-red-purple',
  'red in winter',
  'red new growth',
  'red-bronze in autumn',
  'seasonal multi-color',
  'varies by cultivar - green, red, or purple',
  'purple-red or green',
  'glossy green, bronze-purple in winter',
  'mottled brown-green',
  'bronze-purple in winter',
  'bronze-red in winter',
  'bronze-red new growth',
  // the gold splashing is a cultivar selection (Aucuba japonica 'Variegata');
  // the species this row keys on is plain green
  'variegated green and gold',
])

/** The buckets a plant's foliage_color falls into ([] for typical green). */
export function foliageBucketsForPlant(foliageColor: string | null): string[] {
  if (!foliageColor) return []
  const bucket = FOLIAGE_RAW_TO_BUCKET[foliageColor.trim().toLowerCase()]
  return bucket ? [bucket] : []
}
