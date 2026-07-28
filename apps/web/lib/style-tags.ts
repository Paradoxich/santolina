/**
 * The style vocabulary — six garden styles a plant can be tagged with
 * (plants.style_tags), and the shared prompt block that defines them for
 * AI curation.
 *
 * One module on purpose: the July 2026 audit found "cottage" on 90% of the
 * catalog because the original curation prompt listed the tag names with no
 * definitions and no selectivity bar, so any charming flowering plant got
 * tagged cottage (classic and wildflower drifted the same way, at 63% and
 * 55%). A tag most plants carry can't discriminate, and the style filter is
 * the Explore browse tiles' most prominent axis. Both curation entry points
 * (scripts/curate-plants.ts for new seeds, scripts/curate-styles.ts for the
 * re-tag pass) import the same definitions so they cannot drift apart again.
 *
 * The bar is SIGNATURE, not compatibility: a plant earns a tag only when a
 * gardener deliberately building that style would shortlist it, not when it
 * merely wouldn't look out of place. An empty list is a valid judgment
 * (style-neutral), which is why curate-plants treats [] as answered and only
 * NULL as missing.
 *
 * Values must stay in sync with STYLE_OPTIONS in lib/explore-filters.ts and
 * the garden profile's style field.
 */

export const STYLE_TAGS = [
  'cottage',
  'mediterranean',
  'wildflower',
  'modern',
  'lush',
  'classic',
] as const

export type StyleTag = (typeof STYLE_TAGS)[number]

export const STYLE_TAG_PROMPT = `- style_tags: Subset of exactly ${JSON.stringify(
  [...STYLE_TAGS]
)}. A tag means this plant is a SIGNATURE of that style — a gardener deliberately building that style would put it on their shortlist, and seeing it planted evokes that style. "Wouldn't look out of place" is NOT enough. Definitions:
  - "cottage": the romantic English cottage-garden tradition — informal, billowing, flowery abundance in a mixed border. Hollyhocks, foxgloves, delphiniums, lupins, sweet peas, old roses, aquilegias. The bar is PRIMARY identity, not membership: many plants can live in a cottage garden; tag only those the style is built around. NOT for woodland or shade plants, groundcovers, grasses, ferns, or shrubs grown for structure, however charming. If the plant would sit equally well in a meadow, gravel, or woodland planting, tag that style instead — and when torn, leave cottage off.
  - "mediterranean": sun-baked, dry, gravel-and-terracotta. Aromatic, silvery, drought-adapted. Lavender, rosemary, cistus, santolina, olive, spurges.
  - "wildflower": meadow and naturalistic planting — simple open flowers, native or native-looking, drifts that read as wild rather than composed. Ox-eye daisies, cornflowers, field poppies, knautia, yarrow.
  - "modern": architectural and sculptural — strong form, clean lines, restrained palette, mass planting. Ornamental grasses, alliums, agapanthus, phormium, bamboo.
  - "lush": green, leafy, layered abundance — the foliage-first, jungly look. Large leaves, ferns, hostas, hydrangeas, fatsia, rodgersia.
  - "classic": formal, traditional structure — symmetry, clipped evergreens, refined borders. Box, yew, roses, peonies, wisteria.
  Be selective: most plants earn exactly one tag, some two, very few three. A style-neutral plant earns none — an empty array is a valid answer. No single style fits more than about a quarter of a broad catalog.`
