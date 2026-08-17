/**
 * The copy rules the catalog's prose is held to, and their single home.
 *
 * WHY THIS FILE EXISTS. The rulings are old and were enforced in exactly one
 * place: `curate-seasonal-care.ts`'s own line validator. Every other prose
 * field the reader sees — description, seasonal_rhythm, maintenance_notes,
 * environment_benefits, common_issues, best_placement — is written by
 * `curate-plants`, which validates none of it. Measured 2026-08-18 across 780
 * rows: 16 em dashes and 36 uses of "fall" in fields nothing watches. Same
 * shape as trap 36 — the rule exists, the enforcement covers one field, and
 * nobody checked whether the others were guarded.
 *
 * A RULE IS NOT AUTOMATICALLY PORTABLE, which is the part worth reading before
 * adding one. The seasonal-care validator bans "feed" (the ruling is
 * fertilize, never feed), and lifting that rule wholesale onto descriptive
 * prose flags 50 correct sentences: "berries feed birds in autumn", "Japanese
 * beetles may feed on foliage", "slugs feeding on ripe fruit". The ruling is
 * about the gardener's ACTION, so it belongs to prose that instructs, and
 * `ProseKind` below is that distinction made explicit rather than assumed.
 *
 * Rules here must be free, deterministic and field-agnostic within their kind.
 * Anything needing a model or a plant's biology is not a copy rule; it belongs
 * to the pass that has the plant in hand.
 */

/**
 * What a piece of prose is FOR, which decides which rules bind it.
 *
 *   `prescriptive` — tells the gardener to do something (maintenance_notes,
 *     seasonal_care). Vocabulary rulings about garden actions bind here.
 *   `descriptive` — says what the plant or the garden does (description,
 *     seasonal_rhythm, environment_benefits, common_issues, best_placement).
 *     Only the rules about how we WRITE bind here, never the ones about which
 *     verb a gardener uses.
 */
export type ProseKind = 'prescriptive' | 'descriptive'

/**
 * Every reader-facing prose field on `plants`, and what it is.
 *
 * The jsonb pair are listed by their column names; a caller flattens their
 * stage values and checks each as one piece of prose.
 *
 * A field missing from this map is a field nothing checks, which is the exact
 * hole this module was written to close — so `check-copy-rules.ts` asserts the
 * map against the columns it fetches rather than trusting them to agree.
 */
export const PROSE_FIELDS: Record<string, ProseKind> = {
  description: 'descriptive',
  seasonal_rhythm: 'descriptive',
  environment_benefits: 'descriptive',
  common_issues: 'descriptive',
  best_placement: 'descriptive',
  maintenance_notes: 'prescriptive',
  seasonal_care: 'prescriptive',
}

/**
 * The rules stated for a drafting prompt, so the pass that WRITES the prose
 * asks for it correctly instead of being corrected afterwards.
 *
 * IT IS PREVENTION, NOT ENFORCEMENT, and the distinction is the point: a
 * prompt line lowers the rate, `checkCopy` is what actually fails. Round 13
 * shows why both are wanted — it was drafted with no copy rule in the prompt
 * at all and introduced 6 violations in 33 plants, five of them the same
 * "Minimal pruning required — ..." sentence shape.
 *
 * It lives here so the wording cannot drift from the rules that judge it.
 */
export const COPY_RULES_PROMPT = `Copy rules for every prose field you write:
- Never use an em dash or en dash. Use a comma, a semicolon, or a second sentence.
- The season is "autumn", never the US "fall". ("as leaves fall" is the verb and is fine.)
- In instructions, the verb is "fertilize", never "feed". Foliage dying back nourishes a bulb or root: that is "replenish". ("berries feed birds" is descriptive and is fine.)`

export interface CopyViolation {
  /** Stable id, so a report can be grouped and a waiver can name one. */
  rule: string
  /** The offending text, quoted back so a reader can see it without the row. */
  match: string
  reason: string
}

/**
 * "fall" is a season AND a verb, and the catalog uses both.
 *
 * A bare /\bfall\b/ flags "as leaves fall", "as temperatures fall" and "as
 * leaves fall, revealing the branch structure" — correct English in all three,
 * and 4 of the 40 raw hits when this was measured. So the season is identified
 * by its company rather than by the word:
 *
 *   · a preposition or a season-adjective in front ("in fall", "into fall",
 *     "spring or fall", "late fall", "through the fall"), or
 *   · a season noun behind it ("fall color", "fall weather").
 *
 * The verb takes neither, because its subject is a noun ("leaves fall").
 *
 * DELIBERATELY UNDER-REPORTING: an unaccompanied "fall" is left alone rather
 * than guessed at. A guard that flags correct prose teaches people to ignore
 * it, and the missed case is one a reader can still catch — the reverse is
 * not true.
 */
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

  // "through THE fall" — the article carries no information, so look past it.
  let lead = before[before.length - 1]
  if (lead === 'the') lead = before[before.length - 2]

  return (
    (lead !== undefined && FALL_LEADS.has(lead)) ||
    (after[0] !== undefined && FALL_NOUNS.has(after[0]))
  )
}

/**
 * Check one piece of prose against every rule that binds its kind.
 *
 * Pure, and the seam the tests call. Returns every violation rather than the
 * first: a report that stops at one makes a field look one fix away when it is
 * three.
 */
export function checkCopy(text: string, kind: ProseKind): CopyViolation[] {
  const found: CopyViolation[] = []

  // COPY RULE: no em or en dashes, anywhere a reader can see. Ana's standing
  // UI-copy rule, and the one rule with no exceptions in either kind.
  for (const m of text.matchAll(/[—–]/g)) {
    const i = m.index ?? 0
    found.push({
      rule: 'no-dash',
      match: text.slice(Math.max(0, i - 30), i + 30),
      reason: 'em/en dash in reader-facing copy',
    })
  }

  // VOCABULARY RULING: autumn, never the US "fall". Binds both kinds — it is
  // about the word we print, not about who is acting.
  for (const m of text.matchAll(/\bfall\b/gi)) {
    const i = m.index ?? 0
    if (!isSeasonFall(text, i)) continue
    found.push({
      rule: 'autumn-not-fall',
      match: text.slice(Math.max(0, i - 30), i + 30),
      reason: 'uses "fall" for the season (must be "autumn")',
    })
  }

  // VOCABULARY RULING: fertilize, never feed — PRESCRIPTIVE ONLY. In
  // descriptive prose "feed" is the correct verb for what wildlife does, and
  // applying this rule there flags ~50 correct sentences. See the header.
  if (kind === 'prescriptive') {
    for (const m of text.matchAll(/\bfeed(s|ing)?\b/gi)) {
      const i = m.index ?? 0
      found.push({
        rule: 'fertilize-not-feed',
        match: text.slice(Math.max(0, i - 30), i + 30),
        reason: `uses "${m[0]}" (must be "fertilize")`,
      })
    }

    // The "feed the bulb" metaphor misfire: foliage nourishing a bulb or root
    // is "replenish", not "fertilize". This is the fertilize-not-feed rule
    // over-applied, and it has its own name because the fix differs.
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
