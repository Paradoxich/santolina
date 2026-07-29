// Canonical bloom color buckets for the Explore color filter. Client-safe.
//
// Curation writes free descriptive values into plants.bloom_color ("lavender-
// blue", "rusty copper") — charming on a plant card, useless as filter chips.
// This maps every raw value to one of 12 canonical buckets (Ana, July 13
// 2026: magenta stays its own bucket). Raw values stay untouched in the DB;
// the bucketing is presentation-tier only.
//
// Colour model revision (Ana, July 24 2026): cream folds into white — the
// cream-bucket plants read as white to human eyes, and a filter where users
// can't predict which of two twin tiles a plant falls under isn't a taxonomy.
// Silver returns as a bucket, now carried almost entirely by foliage (72+
// silver-foliage plants incl. the app's namesake vs 8 silver-ish blooms — the
// original July fold into white was bloom-data-only). The silver-ish bloom
// raws migrate from white to the revived bucket. Foliage's own mapping lives
// in lib/foliage-colors.ts; the two axes combine in lib/plant-colors.ts.
//
// The swatch hexes are DATA (approximations of real flower colors shown as
// filter swatches), not UI styling — they deliberately live here and not in
// the token set. The chip chrome itself is the kit's SwatchChip.
//
// New seed rounds invent new shades. scripts/check-bloom-colors.ts walks the
// catalog and fails on any value missing from this map — run it after every
// seed, same cadence as the cross-check.

export interface BloomColorBucket {
  value: string
  label: string
  /** Approximate flower color, shown as the filter swatch fill. */
  swatch: string
}

export const BLOOM_COLOR_BUCKETS: BloomColorBucket[] = [
  { value: 'white', label: 'White', swatch: '#f7f5ee' },
  { value: 'silver', label: 'Silver', swatch: '#a7b2bd' },
  { value: 'yellow', label: 'Yellow', swatch: '#f0ca3c' },
  { value: 'orange', label: 'Orange', swatch: '#e88a3a' },
  { value: 'red', label: 'Red', swatch: '#c03a2b' },
  { value: 'burgundy', label: 'Burgundy', swatch: '#6b2737' },
  { value: 'pink', label: 'Pink', swatch: '#eda4bd' },
  { value: 'magenta', label: 'Magenta', swatch: '#c2367e' },
  { value: 'purple', label: 'Purple', swatch: '#7c4d9b' },
  { value: 'lavender', label: 'Lavender', swatch: '#b6a3d6' },
  { value: 'blue', label: 'Blue', swatch: '#4f74bd' },
  { value: 'green', label: 'Green', swatch: '#97b060' },
]

/**
 * Raw bloom_color value → bucket. Every value in the catalog must appear
 * here or in IGNORED_BLOOM_COLORS — the check script enforces it.
 */
export const RAW_TO_BUCKET: Record<string, string> = {
  // white (incl. cream, folded per Ana July 2026 — reads as white to the eye)
  white: 'white',
  'green-white': 'white',
  'greenish-white': 'white',
  cream: 'white',
  beige: 'white',
  tan: 'white',
  buff: 'white',
  // silver — revived July 2026; these bloom raws moved back out of white
  'silvery white': 'silver',
  silver: 'silver',
  'silver-blue': 'silver',
  // yellow
  yellow: 'yellow',
  'golden yellow': 'yellow',
  golden: 'yellow',
  gold: 'yellow',
  'pale yellow': 'yellow',
  'greenish-yellow': 'yellow',
  // orange
  orange: 'orange',
  'orange-yellow': 'orange',
  peach: 'orange',
  bronze: 'orange',
  'rusty copper': 'orange',
  apricot: 'orange', // round 9, Lewisia cotyledon — pale orange, not peach-pink
  // red
  red: 'red',
  crimson: 'red',
  'deep red': 'red',
  scarlet: 'red',
  'orange-red': 'red',
  'coral-red': 'red', // round 9, Kniphofia rooperi — see the compound rule below
  // burgundy — the dark/moody bloom bucket
  burgundy: 'burgundy',
  maroon: 'burgundy',
  brown: 'burgundy',
  black: 'burgundy',
  'black-purple': 'burgundy',
  'purple-brown': 'burgundy',
  'brownish-purple': 'burgundy',
  'purple-red': 'burgundy',
  'dark red-brown': 'burgundy',
  'reddish-brown': 'burgundy',
  'golden-brown': 'burgundy',
  'rusty brown': 'burgundy',
  // pink
  pink: 'pink',
  'pale pink': 'pink',
  rose: 'pink',
  coral: 'pink',
  'coral pink': 'pink',
  salmon: 'pink', // round 10, Pelargonium zonale / Diascia barberae
  'magenta-pink': 'pink',
  'pink-bronze': 'pink',
  // magenta
  magenta: 'magenta',
  'purple-pink': 'magenta',
  // purple
  //
  // THE COMPOUND RULE, made explicit in round 9 because the table already
  // followed it and nothing said so: in a hyphenated colour the LAST word is
  // the bucket and the first only modifies it. That is why 'purple-red' is
  // burgundy (a red, darkened toward purple) while 'reddish-purple' is purple
  // (a purple, warmed toward red) — they are not the same colour reversed, and
  // reading them as if they were is how a Sempervivum ends up filed with the
  // near-blacks. Same rule puts 'purple-blue' in blue and 'coral-red' in red.
  purple: 'purple',
  violet: 'purple',
  'dark purple': 'purple',
  'deep purple': 'purple',
  'pale purple': 'purple',
  'purple-tinged': 'purple',
  'reddish-purple': 'purple', // round 9, Sempervivum montanum
  // lavender
  lavender: 'lavender',
  'lavender-blue': 'lavender',
  'lavender blue': 'lavender',
  lilac: 'lavender',
  mauve: 'lavender',
  'pale lavender': 'lavender',
  // blue
  blue: 'blue',
  'violet-blue': 'blue',
  'purple-blue': 'blue', // round 9, Festuca amethystina — compound rule above
  'pale blue': 'blue',
  'steel blue': 'blue',
  'deep blue': 'blue',
  // green
  green: 'green',
  'yellow-green': 'green',
  'red-green': 'green',
  chartreuse: 'green',
  'pale green': 'green',
  'grey-green': 'green',
}

/**
 * Raw values that intentionally map to no bucket. "bicolour" describes a
 * pattern, not a color — its one catalog carrier (Sweet-william) also lists
 * pink/red/white, so nothing is lost.
 */
export const IGNORED_BLOOM_COLORS = new Set(['bicolour'])

/** The unique buckets a plant's raw bloom_color values fall into. */
export function bucketsForPlant(bloomColor: string[]): string[] {
  const buckets = new Set<string>()
  for (const raw of bloomColor) {
    const bucket = RAW_TO_BUCKET[raw.toLowerCase()]
    if (bucket) buckets.add(bucket)
  }
  return [...buckets]
}
