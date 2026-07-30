/**
 * The 52 WGSRPD Level-2 regions — the vocabulary `plants.native_region` is
 * written in, and the one home for it.
 *
 * It used to be copied verbatim into regenerate-native-region.ts and
 * cross-check-native-region.ts, and cross-check-native-to.ts was about to make
 * a third copy. Three files holding one table is the shape every regression in
 * docs/database-log.md traces back to: the copies stay identical right up until
 * one of them is edited.
 *
 * Canonical and stable — WGSRPD Level 2 has not changed since publication, so
 * this is a lookup table, not a config. The numeric keys are the LEVEL2_COD
 * values in the WGSRPD geojson.
 */
export const L2_NAMES: Record<number, string> = {
  10: 'Northern Europe',
  11: 'Middle Europe',
  12: 'Southwestern Europe',
  13: 'Southeastern Europe',
  14: 'Eastern Europe',
  20: 'Northern Africa',
  21: 'Macaronesia',
  22: 'West Tropical Africa',
  23: 'West-Central Tropical Africa',
  24: 'Northeast Tropical Africa',
  25: 'East Tropical Africa',
  26: 'South Tropical Africa',
  27: 'Southern Africa',
  28: 'Middle Atlantic Ocean',
  29: 'Western Indian Ocean',
  30: 'Siberia',
  31: 'Russian Far East',
  32: 'Middle Asia',
  33: 'Caucasus',
  34: 'Western Asia',
  35: 'Arabian Peninsula',
  36: 'China',
  37: 'Mongolia',
  38: 'Eastern Asia',
  40: 'Indian Subcontinent',
  41: 'Indo-China',
  42: 'Malesia',
  43: 'Papuasia',
  50: 'Australia',
  51: 'New Zealand',
  60: 'Southwestern Pacific',
  61: 'South-Central Pacific',
  62: 'Northwestern Pacific',
  63: 'North-Central Pacific',
  70: 'Subarctic America',
  71: 'Western Canada',
  72: 'Eastern Canada',
  73: 'Northwestern U.S.A.',
  74: 'North-Central U.S.A.',
  75: 'Northeastern U.S.A.',
  76: 'Southwestern U.S.A.',
  77: 'South-Central U.S.A.',
  78: 'Southeastern U.S.A.',
  79: 'Mexico',
  80: 'Central America',
  81: 'Caribbean',
  82: 'Northern South America',
  83: 'Western South America',
  84: 'Brazil',
  85: 'Southern South America',
  90: 'Subantarctic Islands',
  91: 'Antarctic Continent',
}
/** Region names alone, for prompts and membership tests. */
export const L2_VOCAB: string[] = Object.values(L2_NAMES)
export const L2_SET: ReadonlySet<string> = new Set(L2_VOCAB)
