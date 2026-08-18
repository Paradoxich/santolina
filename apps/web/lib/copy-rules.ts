/**
 * The copy rules the catalog's prose is held to.
 *
 * Rationale, measurements and the per-field reasoning:
 * docs/curation.md#copy-rules.
 */

/** What a piece of prose is for, which decides which rules bind it. */
export type ProseKind = 'prescriptive' | 'descriptive'

/** Every reader-facing prose field on `plants`, and what it is. */
export const PROSE_FIELDS: Record<string, ProseKind> = {
  description: 'descriptive',
  seasonal_rhythm: 'descriptive',
  environment_benefits: 'descriptive',
  common_issues: 'descriptive',
  best_placement: 'descriptive',
  maintenance_notes: 'prescriptive',
  seasonal_care: 'prescriptive',
}

/** The prose columns, for a query projection. */
export const PROSE_COLUMNS = Object.keys(PROSE_FIELDS)

/**
 * Flatten a plant row into (field label, prose) pairs, one per jsonb stage.
 * Stage values are labelled `seasonal_rhythm.autumn`, not `seasonal_rhythm`.
 */
export function proseOf(
  row: Record<string, unknown>
): Array<{ field: string; kind: ProseKind; text: string }> {
  const out: Array<{ field: string; kind: ProseKind; text: string }> = []
  for (const column of PROSE_COLUMNS) {
    const kind = PROSE_FIELDS[column]!
    const value = row[column]
    if (typeof value === 'string') {
      if (value.trim()) out.push({ field: column, kind, text: value })
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, stage] of Object.entries(value)) {
        if (typeof stage === 'string' && stage.trim())
          out.push({ field: `${column}.${key}`, kind, text: stage })
      }
    }
  }
  return out
}

/** The rules as stated for a drafting prompt. */
export const COPY_RULES_PROMPT = `Copy rules for every prose field you write:
- Never use an em dash or en dash. Use a comma, a semicolon, or a second sentence.
- The season is "autumn", never the US "fall". ("as leaves fall" is the verb and is fine.)
- In instructions, the verb is "fertilize", never "feed". Foliage dying back nourishes a bulb or root: that is "replenish". ("berries feed birds" is descriptive and is fine.)`

export interface CopyViolation {
  rule: string
  /** The offending text in context, for the report. */
  match: string
  reason: string
}

// A season "fall" is identified by its company: a preposition or season
// adjective in front, or a season noun behind. The verb ("as leaves fall")
// takes neither.
const FALL_LEADS = new Set([
  'in',
  'into',
  'through',
  'throughout',
  'until',
  'till',
  'by',
  'during',
  'for',
  'from',
  'and',
  'or',
  'late',
  'early',
  'mid',
  'this',
  'next',
  'since',
  'cool',
  'cooler',
  'first',
])
const FALL_NOUNS = new Set([
  'color',
  'colour',
  'colors',
  'colours',
  'foliage',
  'weather',
  'display',
  'displays',
  'interest',
  'planting',
  'bloom',
  'blooms',
  'flowering',
  'frost',
  'frosts',
  'rains',
])

/** True when this occurrence of "fall" is the season, not the verb. */
export function isSeasonFall(text: string, index: number): boolean {
  const before = text
    .slice(0, index)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
  const after = text
    .slice(index + 4)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)

  let lead = before[before.length - 1]
  if (lead === 'the') lead = before[before.length - 2]

  return (
    (lead !== undefined && FALL_LEADS.has(lead)) ||
    (after[0] !== undefined && FALL_NOUNS.has(after[0]))
  )
}

/**
 * Rewrite the season "fall" to "autumn", leaving the verb alone. Rewrites
 * exactly the occurrences `isSeasonFall` flags.
 */
export function fixSeasonFall(text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(/\bfall\b/gi)) {
    const i = m.index ?? 0
    if (!isSeasonFall(text, i)) continue
    const replacement = m[0][0] === 'F' ? 'Autumn' : 'autumn'
    out += text.slice(last, i) + replacement
    last = i + m[0].length
  }
  return out + text.slice(last)
}

/** Every violation in one piece of prose, for the rules binding its kind. */
export function checkCopy(text: string, kind: ProseKind): CopyViolation[] {
  const found: CopyViolation[] = []

  for (const m of text.matchAll(/[—–]/g)) {
    const i = m.index ?? 0
    found.push({
      rule: 'no-dash',
      match: text.slice(Math.max(0, i - 30), i + 30),
      reason: 'em/en dash in reader-facing copy',
    })
  }

  for (const m of text.matchAll(/\bfall\b/gi)) {
    const i = m.index ?? 0
    if (!isSeasonFall(text, i)) continue
    found.push({
      rule: 'autumn-not-fall',
      match: text.slice(Math.max(0, i - 30), i + 30),
      reason: 'uses "fall" for the season (must be "autumn")',
    })
  }

  // Prescriptive only: in descriptive prose "feed" is what wildlife does.
  if (kind === 'prescriptive') {
    for (const m of text.matchAll(/\bfeed(s|ing)?\b/gi)) {
      const i = m.index ?? 0
      found.push({
        rule: 'fertilize-not-feed',
        match: text.slice(Math.max(0, i - 30), i + 30),
        reason: `uses "${m[0]}" (must be "fertilize")`,
      })
    }

    for (const m of text.matchAll(
      /\bfertiliz(e|es|ing)\b[^.]*\b(bulb|bulbs|corm|corms|rhizome|rhizomes|tuber|tubers|root|roots)\b/gi
    )) {
      found.push({
        rule: 'replenish-not-fertilize',
        match: m[0],
        reason: 'foliage "fertilize" a bulb/root — use "replenish"',
      })
    }
  }

  return found
}
