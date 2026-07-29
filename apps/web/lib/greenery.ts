/**
 * What `is_greenery` means, stated once.
 *
 * This flag is the ONLY way a plant reaches the Explore Green colour bucket
 * (`lib/plant-colors.ts` — plain green foliage deliberately never maps from
 * `foliage_color`), so an unjudged plant is silently missing from a live
 * filter rather than visibly wrong.
 *
 * It lives here because two passes ask the question and they must not drift:
 * `curate-plants.ts` answers it for new seeds as part of the drafting call it
 * is already paying for, and `curate-greenery.ts` re-judges older rows that
 * were seeded before the field existed. That is the same arrangement as
 * `lib/style-tags.ts`, and for the same reason — the July 2026 cottage
 * problem was two entry points slowly disagreeing about one definition.
 */

export const GREENERY_PROMPT = `greenery (boolean): Is this plant's garden identity GREENERY — grown primarily for green mass, leaves or form, with flowers absent or incidental? True for the likes of boxwood, laurel, ferns, ivy, most conifers, and hedging or structural evergreens. False for anything grown mainly for its flowers, even if it holds handsome green leaves. Also false for foliage plants whose leaves read as a distinctive NON-green colour (silver, blue-grey, burgundy, gold) — their identity is that colour, not green.`
