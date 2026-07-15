// RHS hardiness ratings (H1a-H7) are the canonical hardiness field for the
// catalog. This module is the single place that knows the scale and derives a
// USDA zone from it AT RENDER TIME — USDA zones are never stored (one source of
// truth). Client-safe: no server imports.
//
// The catalog is Euro/Med-skewed, so the RHS scale (a UK/European standard) is
// the natural fit. Values are drafted by scripts/draft-hardiness.ts and gated
// for display by plants.hardiness_verified — callers must not present a rating
// confidently unless it is verified.

export type HardinessRating =
  | 'H1a'
  | 'H1b'
  | 'H1c'
  | 'H2'
  | 'H3'
  | 'H4'
  | 'H5'
  | 'H6'
  | 'H7'

export const HARDINESS_RATINGS: HardinessRating[] = [
  'H1a',
  'H1b',
  'H1c',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'H7',
]

export interface HardinessInfo {
  rating: HardinessRating
  /** Min-temperature band in °C per the RHS scale; null = open-ended. */
  minTempC: [number | null, number | null]
  /** Short gardener-facing descriptor (no em/en dashes, per copy rules). */
  label: string
  /** Approximate USDA minimum zone the plant is hardy to (derived display). */
  usdaZone: number
}

// RHS scale definitions (temperature bands) with the commonly published
// approximate USDA-zone correspondence. The USDA value is a rough display aid,
// not a second stored source of truth.
export const HARDINESS_INFO: Record<HardinessRating, HardinessInfo> = {
  H1a: { rating: 'H1a', minTempC: [15, null], label: 'Tropical, under glass', usdaZone: 13 },
  H1b: { rating: 'H1b', minTempC: [10, 15], label: 'Subtropical, under glass', usdaZone: 12 },
  H1c: { rating: 'H1c', minTempC: [5, 10], label: 'Warm temperate, under glass', usdaZone: 11 },
  H2: { rating: 'H2', minTempC: [1, 5], label: 'Tender', usdaZone: 10 },
  H3: { rating: 'H3', minTempC: [-5, 1], label: 'Half-hardy', usdaZone: 9 },
  H4: { rating: 'H4', minTempC: [-10, -5], label: 'Hardy in an average winter', usdaZone: 8 },
  H5: { rating: 'H5', minTempC: [-15, -10], label: 'Hardy in a cold winter', usdaZone: 7 },
  H6: { rating: 'H6', minTempC: [-20, -15], label: 'Hardy in a very cold winter', usdaZone: 6 },
  H7: { rating: 'H7', minTempC: [null, -20], label: 'Very hardy', usdaZone: 5 },
}

/** Narrow an arbitrary string to a valid HardinessRating. */
export function isHardinessRating(v: string): v is HardinessRating {
  return (HARDINESS_RATINGS as string[]).includes(v)
}

/** Approximate USDA minimum zone for a rating — derived, never stored. */
export function usdaZoneForRating(rating: HardinessRating): number {
  return HARDINESS_INFO[rating].usdaZone
}

/**
 * Render string, e.g. "H5 (approx. USDA 7)". Display is the CALLER's
 * responsibility to gate on hardiness_verified — this helper only formats.
 */
export function formatHardiness(rating: HardinessRating): string {
  return `${rating} (approx. USDA ${usdaZoneForRating(rating)})`
}
