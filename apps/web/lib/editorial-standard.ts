/**
 * The editorial bar — what `is_curated = true` actually asserts, defined once.
 *
 * docs/architecture.md#curation-layer redefined human review in July 2026: the reviewer
 * is not a botanist, so this flag is an EDITORIAL judgment, not botanical
 * verification. Botanical facts are the cross-checks' job (docs/architecture.md#botanical-cross-check). Three things
 * and no more:
 *
 *   1. the image shows the right plant
 *   2. the description reads well and on-brand
 *   3. the style and space tags make product sense
 *
 * This module is the single home for that definition (the one-home-per-fact
 * rule from the July 28 audit). `curate-editorial.ts` imports it; anything
 * else that needs to state the bar imports it rather than restating it.
 *
 * THE THREE ARE JUDGED AND RECORDED SEPARATELY (migration 20260729112046).
 * Each has its own stamp, and `is_curated` is true only when all three are
 * set. That is not bookkeeping neatness: under a single flag, changing any one
 * of these re-opened all three, and re-opening the description means this pass
 * may REWRITE the copy. Removing one style tag from Rowan on 2026-07-29 came
 * back with its description rewritten, which nobody had asked for. Criterion 1
 * is also free to re-decide — it reads a persisted confidence — so the common
 * case of a hero image changing now costs nothing instead of two model calls
 * and a side effect on the text.
 *
 * Criterion 1 is deliberately NOT re-judged with vision here. The image pass
 * (PR #88) already made that call per row and persisted it as
 * `image_pick_confidence`, so re-asking is paying twice for the same
 * judgment. This module only encodes what the persisted signal has to say
 * for the row to clear the bar.
 */

/** Confidence values the image pass writes to `image_pick_confidence`. */
export type ImageConfidence = 'high' | 'medium' | 'low'

/**
 * The image confidence that clears criterion 1.
 *
 * Only `high`. `medium` means the vision pass thought the hero was plausible
 * but would not commit, and "plausible" is exactly the doubt the strict bar
 * exists to catch — a plant page showing the wrong species is the most
 * visible error the catalog can make, because a reader can see it without
 * knowing anything about plants.
 */
export const IMAGE_CONFIDENCE_REQUIRED: ImageConfidence = 'high'

/** Em and en dashes: banned in anything a user reads. Ana's standing rule. */
export const BANNED_PUNCTUATION = /[—–]/

/**
 * Description length bounds, in characters.
 *
 * Round 8's drafted descriptions run 176 to 395 characters (median 283), so
 * these bounds are drawn from what the catalog already looks like rather than
 * invented. They are a shape check, not a quality judgment — quality is the
 * model's call below.
 */
export const DESCRIPTION_MIN_CHARS = 120
export const DESCRIPTION_MAX_CHARS = 600

/**
 * The voice, stated for the model that judges and the model that rewrites.
 *
 * Written from the descriptions the catalog already carries, not from an
 * abstract brand deck: plain, concrete, warm without being twee, and useful
 * to somebody deciding whether to plant the thing.
 */
export const VOICE_PROMPT = `Santolina's voice for plant descriptions:

- Plain and concrete. Say what the plant looks like, when it does it, and what
  it needs from the reader. A beginner gardener should finish the description
  knowing whether they want this plant.
- Warm but not twee. No "beloved", no "beauty of nature", no exclamation
  marks, no second-person cheerleading ("you'll love...").
- Specific over general. "Hanging chains of golden-yellow flowers in late
  spring" beats "stunning seasonal blooms".
- Lead with what the reader sees. Habit, flower, foliage, season. Practical
  cautions (toxicity, spread, short life) belong at the end, stated calmly and
  without alarm.
- Three sentences is typical. Two is fine. Five is too many.
- NEVER use em dashes or en dashes. Commas, full stops or a semicolon instead.
  This is a hard rule across the whole product, not a preference.
- No marketing register: nothing is "must-have", "showstopping", "perfect for
  any garden", or "a favourite among gardeners".`

/** The tag-sense criterion, stated for the judging model. */
export const TAGS_PROMPT = `Tags make product sense when a reader browsing that
tile would expect to find this plant behind it, and would not feel misled.

- style_tags: the plant is a SIGNATURE of that style, not merely compatible
  with it. An empty list is a valid, deliberate answer (style-neutral) and is
  NOT a defect: the July 2026 re-tag pass made 33 plants style-neutral on
  purpose. Only flag style_tags when a tag that IS present looks wrong.
- space_types: where this plant can actually be grown. A tree tagged for
  balconies is a defect; a compact shrub tagged for both borders and large
  containers is fine.

Judge only what is there. A missing tag you would have liked is not a defect.`
