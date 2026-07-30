/**
 * Reviewed native_region corrections, shared by the script that writes the
 * field and the script that checks it.
 *
 * These moved out of regenerate-native-region.ts because two scripts now have
 * an opinion about native_region: the generator (docs/curation.md#native-region) and
 * cross-check-native-region.ts, which validates the result against WCVP. Two
 * private copies would eventually disagree, and the check would spend its time
 * re-litigating decisions a human already made. Rosmarinus officinalis is the
 * worked example — WCVP calls Western Asia native, a review deliberately
 * removed it, and that ruling has to outrank the external authority.
 *
 * `tags` forces an exact Level-2 set; `noWildRange` forces empty. Every entry
 * carries the reason it exists.
 */

export interface NativeRegionOverride {
  tags?: string[]
  noWildRange?: true
  reason: string
}

export const MANUAL_OVERRIDES: Record<string, NativeRegionOverride> = {
  // Cultivated hybrid (C. medica × C. aurantium) with no wild population
  // anywhere, and no × in its accepted name to signal that. WCVP carries 94
  // distribution rows for it and marks every one INTRODUCED, so Trefle's list
  // is the cultivation footprint — which regenerated into a confident-looking
  // Asian native range. Established by cross-check-native-region.ts.
  'Citrus limon': {
    noWildRange: true,
    reason: 'cultigen — WCVP records no native range, only introduced',
  },
  // Circumboreal fern — the bare "Europe, Asia, and North America" prose
  // expanded to 25 regions incl. tropical/desert false positives. Tightened to
  // the cool-temperate Northern-Hemisphere core.
  'Matteuccia struthiopteris': {
    tags: [
      'Northern Europe',
      'Middle Europe',
      'Eastern Europe',
      'Southeastern Europe',
      'Southwestern Europe',
      'Siberia',
      'Russian Far East',
      'Caucasus',
      'China',
      'Eastern Asia',
      'Subarctic America',
      'Western Canada',
      'Eastern Canada',
      'Northwestern U.S.A.',
      'North-Central U.S.A.',
      'Northeastern U.S.A.',
    ],
    reason: 'tightened circumboreal; dropped tropical/desert over-reach',
  },
  // "the Mediterranean region" pulled in Western Asia; rosemary is not native
  // to the Levant. Keep the western/central-Mediterranean rim.
  'Rosmarinus officinalis': {
    tags: ['Northern Africa', 'Southeastern Europe', 'Southwestern Europe'],
    reason: 'dropped Western Asia — not native Levant range',
  },
  // Garden hybrid (Cistus × purpureus) stored without the × — no wild range.
  'Cistus purpureus': {
    noWildRange: true,
    reason: 'garden hybrid (Cistus × purpureus) — no wild native range',
  },
}
