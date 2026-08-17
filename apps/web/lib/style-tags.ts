/**
 * The style vocabulary — the garden styles a plant can be tagged with
 * (plants.style_tags), their display names, and the shared prompt block that
 * defines them for AI curation.
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
 * VOCABULARY IS NOT AVAILABILITY. This file carries every style the catalog
 * judges against, including ones almost no plant holds yet — a slug is the
 * durable record of intent, so future rounds are judged against it
 * automatically where a note saying "add chinese later" evaporates. Which
 * styles the Explore filter OFFERS is a separate, generated question:
 * lib/style-availability.generated.ts holds the live per-style counts and
 * STYLE_OPTIONS is derived from it, so a style appears in the filter the
 * round its population clears the floor, with no manual step. There is
 * therefore no sync obligation between this file and lib/explore-filters.ts;
 * that clause used to live here and was true only as long as someone
 * remembered it.
 *
 * The prompt below is sent on every curate-styles call, once per plant. Keep
 * each definition to one or two sentences plus a plant list — across a
 * catalog-sized pass, an essay per style is paid for 748 times.
 */

export const STYLE_TAGS = [
  // aesthetic
  'cottage',
  'mediterranean',
  'wildflower',
  'modern',
  'lush',
  'classic',
  // place-inspired
  'japanese',
  'chinese',
  'provence',
  'tropical',
  'desert',
  // purpose
  'herb',
  'pollinator',
  'cutting',
  'sensory',
  'woodland',
  // mood
  'moon',
  'gothic',
  'prairie',
  'winter',
] as const

export type StyleTag = (typeof STYLE_TAGS)[number]

/**
 * Slug to display name, for every surface that shows a style to a reader:
 * the Explore browse tiles, the "Fits your ... garden style" bullet in
 * lib/good-for-your-garden.ts, and the styles.name column when the curated
 * editorial lists land.
 *
 * Defined here rather than at each consumer because a slug rendered raw reads
 * wrong in two ways the tiles made obvious: lowercase "chinese" is a proper
 * noun mis-set, and "cottage" alone loses the tradition the definition
 * actually describes. Names carry no em or en dashes, per the UI copy rule.
 */
export const STYLE_DISPLAY_NAMES: Record<StyleTag, string> = {
  cottage: 'English cottage',
  mediterranean: 'Mediterranean',
  wildflower: 'Wildflower',
  modern: 'Modern',
  lush: 'Lush',
  classic: 'Classic',
  japanese: 'Japanese',
  chinese: 'Chinese',
  provence: 'Provence',
  tropical: 'Tropical',
  desert: 'Desert',
  herb: 'Herb',
  pollinator: 'Pollinator',
  cutting: 'Cutting',
  sensory: 'Sensory',
  woodland: 'Woodland',
  moon: 'Moon',
  gothic: 'Gothic',
  prairie: 'Prairie',
  winter: 'Winter',
}

/**
 * The style pairs the prompt's negative guidance exists to keep apart, as
 * data rather than as a comment, so the pilot can measure co-occurrence
 * instead of someone eyeballing it. Two definitions bleeding into each other
 * is not visible by reading them.
 *
 * Used by the --limit pilot before any catalog-wide run: a pair co-occurring
 * often means the bar between those two has not landed, whatever the
 * definitions say.
 */
export const CONFUSABLE_STYLE_PAIRS: [StyleTag, StyleTag][] = [
  ['wildflower', 'prairie'], // annual meadow vs designed perennial
  ['mediterranean', 'provence'], // broad tradition vs signature of Provence
  ['mediterranean', 'desert'], // aromatic soft vs sculptural sparse
  ['lush', 'tropical'], // temperate foliage vs true exotics
  ['japanese', 'chinese'], // tradition, not botany; avoid double-tagging
  ['cottage', 'cutting'], // border romance vs grown for the vase
  ['pollinator', 'wildflower'], // ecological intent vs meadow aesthetic
  ['woodland', 'lush'], // shade ephemerals and ferns vs big-leaf drama
  ['winter', 'classic'], // headline winter season vs evergreen structure
  ['sensory', 'herb'], // scent-first ornamental vs grown for use
]

/**
 * The four axes the vocabulary is built from, and the reason a flat tag count
 * is the wrong instrument for it.
 *
 * The original six styles all describe a LOOK, so they partition: a plant that
 * is more cottage is less modern, and a rising tag count meant a slipping bar.
 * Eleven of the fourteen added styles do not partition that way — purpose and
 * mood cut ACROSS aesthetics. A culinary sage is honestly `mediterranean` and
 * `herb`; under six styles it had one place to go. So a mean that rises after
 * the expansion is ambiguous between a working vocabulary and a slipped bar,
 * and tuning to hit the old number could fail a good run.
 *
 * What still discriminates is DOUBLING UP WITHIN an axis. Two aesthetic tags
 * means the plant was judged to be the signature of two different looks, which
 * is the thing the signature bar exists to prevent; two purpose tags is
 * ordinary (plenty of plants are grown to cut and for pollinators both).
 *
 * Measured per axis, the pilot's suspicious rows separate cleanly: Absinthe's
 * four tags sit on four different axes and are each defensible, while Amethyst
 * eryngo carrying both `mediterranean` and `modern` is a real miss.
 */
export const STYLE_AXES = {
  aesthetic: [
    'cottage',
    'mediterranean',
    'wildflower',
    'modern',
    'lush',
    'classic',
  ],
  place: ['japanese', 'chinese', 'provence', 'tropical', 'desert'],
  purpose: ['herb', 'pollinator', 'cutting', 'sensory', 'woodland'],
  mood: ['moon', 'gothic', 'prairie', 'winter'],
} satisfies Record<string, StyleTag[]>

export type StyleAxis = keyof typeof STYLE_AXES

/**
 * Axes where holding two tags at once is a judgment error rather than a
 * legitimate combination — see STYLE_AXES. This is the growth-invariant bar
 * that replaced the flat mean for the expanded vocabulary.
 */
export const EXCLUSIVE_STYLE_AXES: StyleAxis[] = ['aesthetic', 'place']

/**
 * Mean tags per plant, measured on the round-12 archive: 748 plants, 1043
 * tag-instances, distribution 0:50 / 1:362 / 2:327 / 3:9.
 *
 * This is the bar's instrument because it is a property of the JUDGMENT, not
 * of catalog size — a per-tag share moves when you seed 100 grasses and
 * nobody re-judged anything, which is how `modern` reading low was mistaken
 * for a species gap. Going 6 styles to 20 this should stay flat or fall,
 * since each style narrows. A climb toward 2.5 means the bar slipped, at any
 * catalog size.
 */
export const MEAN_TAGS_PER_PLANT_BASELINE = 1.39

export const STYLE_TAG_PROMPT = `- style_tags: Subset of exactly ${JSON.stringify(
  [...STYLE_TAGS]
)}. A tag means this plant is a SIGNATURE of that style — a gardener deliberately building that style would put it on their shortlist, and seeing it planted evokes that style. "Wouldn't look out of place" is NOT enough. Definitions:
  - "cottage": the romantic English cottage-garden tradition — informal, billowing, flowery abundance in a mixed border. Hollyhocks, foxgloves, delphiniums, lupins, sweet peas, old roses, aquilegias. The bar is PRIMARY identity, not membership: many plants can live in a cottage garden; tag only those the style is built around. NOT for woodland or shade plants, groundcovers, grasses, ferns, or shrubs grown for structure, however charming. If the plant would sit equally well in a meadow, gravel, or woodland planting, tag that style instead — and when torn, leave cottage off.
  - "mediterranean": sun-baked, dry, gravel-and-terracotta. Aromatic, silvery, drought-adapted. Lavender, rosemary, cistus, santolina, olive, spurges. Shares plants with "provence" — tag both only when the plant is central to both traditions.
  - "wildflower": meadow and naturalistic ANNUAL/native planting — simple open flowers, native or native-looking, drifts that read as wild rather than composed. Ox-eye daisies, cornflowers, field poppies, knautia, yarrow. NOT for the designed perennial-and-grass look — that is "prairie".
  - "modern": architectural and sculptural — strong form, clean lines, restrained palette, mass planting. Ornamental grasses, alliums, agapanthus, phormium, bamboo.
  - "lush": green, leafy, layered abundance — the foliage-first, jungly look in temperate shade. Large leaves, ferns, hostas, hydrangeas, fatsia, rodgersia. NOT for true tropicals or bold-flowered exotics — that is "tropical".
  - "classic": formal, traditional structure — symmetry, clipped evergreens, refined borders. Box, yew, roses, peonies, wisteria.
  - "japanese": the Japanese garden tradition — restraint, form over flower, green on green with brief seasonal moments. Japanese maples, cloud-pruned pines, clipped azaleas, hakonechloa, mondo grass, moss, camellia, flowering cherry. NOT for any plant merely native to Japan; the bar is the garden tradition, not botany.
  - "chinese": the classical Chinese scholar's garden — plants grown for cultural meaning and display as specimens. Tree peony, plum blossom (Prunus mume), bamboo, lotus, wisteria, chrysanthemum, magnolia, osmanthus, wintersweet. NOT a synonym for "japanese"; when unsure which tradition a plant defines, pick one, not both.
  - "provence": the south-of-France look — lavender in rows, olives, cypress, perfumed herbs around warm stone. Lavandin, olive, Italian cypress, rosemary, santolina, bearded iris, fig, grape vine. Overlaps "mediterranean"; reserve "provence" for the plants a Provence planting is BUILT around.
  - "tropical": bold exotics — oversized leaves and saturated flowers, resort-garden drama. Bananas, cannas, gingers, hibiscus, palms, tetrapanax, colocasia. NOT for temperate shade foliage — that is "lush".
  - "desert": sparse, sculptural dry planting — solitary architectural plants in gravel. Agaves, yuccas, cacti, dasylirion, hesperaloe, hardy ice plant. NOT for soft aromatic dry-garden plants — that is "mediterranean".
  - "herb": the herb/physic garden — culinary and traditional medicinal plants grown for use. Sage, thyme, rosemary, mint, chamomile, fennel, lemon balm, calendula. The bar is being grown FOR use; ornamental plants with herbal history don't qualify on history alone.
  - "pollinator": planted first for bees, butterflies and wildlife — single open nectar-rich flowers, season-spanning food. Echinacea, buddleja, single-flowered salvias, sedum, knautia, ivy (autumn nectar). NOT for double-flowered or sterile cultivars, whatever their looks.
  - "cutting": grown in rows to be harvested for the vase — productivity, long stems, long vase life. Dahlias, cosmos, zinnias, sweet peas, ranunculus, snapdragons, ammi. The bar is cut-flower staple, not merely "can be cut".
  - "sensory": grown for scent or touch first — perfume near paths and seats, aromatic or tactile foliage. Jasmine, daphne, night-scented stock, philadelphus, scented-leaf pelargoniums, lamb's ears. Flower beauty alone does not qualify; the scent/touch must be the reason it's planted. NOT for culinary or medicinal plants, however aromatic — a plant grown to be picked and used is "herb", and aromatic foliage is what herbs ARE, so it is not separate evidence. Sage, mint, thyme, fennel and lemon verbena are herbs, not sensory.
  - "woodland": shade and dappled light under a canopy — spring ephemerals, ferns, quiet layers. Hellebores, epimediums, snowdrops, wood anemones, brunnera, shield ferns, bluebells. NOT for sun-border plants that tolerate part shade.
  - "moon": the white/evening garden — white or silver plants and dusk scent, designed to glow at nightfall. Moonflower, Nicotiana sylvestris, white 'Iceberg' roses, 'Annabelle' hydrangea, lamb's ears, silver artemisias, evening primrose. The bar is white/silver/night-scented; pastel is not enough.
  - "gothic": the dark garden — near-black flowers and deep purple/maroon foliage as the point of the planting. 'Queen of Night' tulip, black hollyhock, black mondo, 'Black Lace' elder, 'Diabolo' physocarpus, dark dahlias and heucheras. The bar is genuinely dark colouring, not merely "moody".
  - "prairie": the naturalistic PERENNIAL movement (Oudolf) — grasses and late-season perennials in drifts, seedheads left standing through winter. Echinacea, calamagrostis, molinia, sanguisorba, helenium, rudbeckia, eupatorium, panicum. Designed and structural — NOT annual meadow ("wildflower").
  - "winter": planted for the winter months — coloured stems, winter flowers and scent, berries, bark. Dogwood stems, hellebores, witch hazel, snowdrops, sarcococca, mahonia, winter-flowering viburnum and cherry, white-barked birch. The bar is winter as the plant's HEADLINE season, not mere evergreen persistence.
  Be selective. Start from zero tags and add one only when this plant is a SIGNATURE of that style, in the shortlist sense above. One tag is the normal answer; a good number of plants earn none, and an empty array is a valid answer. Two tags is uncommon and means the plant is genuinely central to both traditions independently. Three should be rare enough that you hesitate before writing it, and four is almost always a mistake — reread each tag and drop the ones resting on a single shared trait. Membership in one style is never evidence for membership in a neighbouring one: an aromatic dry-garden plant is not thereby sensory, a meadow plant is not thereby a pollinator plant, a shade plant is not thereby woodland. Decide each tag independently against its own bar, and when torn, leave it off.`
