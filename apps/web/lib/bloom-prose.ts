/**
 * Seasons a piece of prose ASSERTS the plant is flowering in.
 *
 * Used by scripts/check-bloom-prose.ts to find prose that contradicts
 * `bloom_months`. Tuning and the false positives it exists to avoid:
 * docs/curation.md#bloom-prose.
 */

export type BloomSeason = 'winter' | 'spring' | 'summer' | 'autumn'

/** Month number to the coarse season this detector reasons in. */
export function seasonOfMonth(month: number): BloomSeason {
  if (month === 12 || month <= 2) return 'winter'
  if (month <= 5) return 'spring'
  if (month <= 8) return 'summer'
  return 'autumn'
}

const SEASON_WORDS: Record<string, BloomSeason> = {
  winter: 'winter',
  spring: 'spring',
  summer: 'summer',
  autumn: 'autumn',
  fall: 'autumn',
}

const MONTH_WORDS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

// An assertion that the plant IS flowering. A bare flower word is not one:
// "the blooms are followed by seedheads" is about the aftermath, and matching
// it flags most of the catalog.
const ASSERTS_FLOWERING =
  /\b(?:flowers?|blooms?|blossoms?|flowering|blooming)\b\s*(?:\S+\s+){0,3}?(?:appear|appears|open|opens|emerge|emerges|arrive|arrives|begin|begins|start|starts|continue|continues|persist|persists|last|lasts|carry|carries|bloom|blooms|borne|produced)\b|\b(?:produces|bears|carries|opens)\s+(?:\S+\s+){0,3}?(?:flowers?|blooms?|blossoms?)\b|\bin\s+(?:full\s+)?(?:bloom|flower)\b|\b(?:flowering|blooming)\s+(?:begins|continues|persists|starts|peaks)\b/i

// Aftermath, anticipation and hedging: the flowers are over, not yet, or only
// conditional. Either way the season named nearby is not a flowering season.
// Every alternative here was added because it flagged real catalog prose.
const NOT_FLOWERING =
  /(?:\b(?:after|during|before|until|since|post)\s+flowering\b)|\b(?:followed by|fade|fades|faded|fading|over|finished|spent|seed ?heads?|seedpods?|hips|berries|fruit|fruits|foliage turns|buds?|stalks?|flower heads?|dies? back|dormant|cut back|deadhead|may|might|can|could|occasional|occasionally|milder|sheltered|some areas|marks the start|signal|signals|signalling|signaling|heralding|heralds|upcoming)\b/i

const SENTENCE = /[^.;!?]+[.;!?]?/g

/**
 * Seasons this prose asserts flowering in.
 *
 * Deliberately under-reports: a sentence has to assert flowering AND name a
 * season, with no aftermath marker, before it counts. `skipWords` are dropped
 * from consideration so a plant whose own name carries a season ("Winter
 * savory", "Autumn sage") is not read as a claim about when it flowers.
 */
export function assertedBloomSeasons(
  text: string,
  skipWords: string[] = []
): BloomSeason[] {
  const skip = new Set(skipWords.map((w) => w.toLowerCase()))
  const found = new Set<BloomSeason>()

  for (const sentence of text.match(SENTENCE) ?? []) {
    if (!ASSERTS_FLOWERING.test(sentence)) continue
    if (NOT_FLOWERING.test(sentence)) continue

    for (const [word, season] of Object.entries(SEASON_WORDS)) {
      if (skip.has(word)) continue
      if (new RegExp(`\\b${word}\\b`, 'i').test(sentence)) found.add(season)
    }
    for (const [word, month] of Object.entries(MONTH_WORDS)) {
      if (skip.has(word)) continue
      // "May" is also a verb, so it only counts beside another month or a day.
      if (
        word === 'may' &&
        !/\b(?:through|to|until|into|and)\s+may\b|\bmay\s+(?:to|through|into|and)\b/i.test(
          sentence
        )
      )
        continue
      if (new RegExp(`\\b${word}\\b`, 'i').test(sentence))
        found.add(seasonOfMonth(month))
    }
  }

  return [...found]
}

/** Seasons the stored bloom_months cover. */
export function seasonsOfMonths(months: number[]): BloomSeason[] {
  return [...new Set(months.map(seasonOfMonth))]
}

/**
 * Seasons the prose asserts that the scalar does not cover.
 *
 * Empty means they agree, or that the prose asserts nothing checkable.
 */
export function contradictions(
  text: string,
  bloomMonths: number[],
  skipWords: string[] = []
): BloomSeason[] {
  if (!bloomMonths.length) return []
  const covered = new Set(seasonsOfMonths(bloomMonths))
  return assertedBloomSeasons(text, skipWords).filter((s) => !covered.has(s))
}
