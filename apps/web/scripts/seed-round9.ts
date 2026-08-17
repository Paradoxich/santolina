/**
 * Round-9 catalog expansion (July 2026) — the small-space & late-season round:
 * plants that fit a balcony, a terrace or a few pots, plus the October-November
 * shoulder the catalog drops. Takes the catalog from 595 to ~645.
 *
 * WHY this round exists, and why it is NOT the round it started as. The first
 * candidate list for round 9 was winter interest, picked off this histogram:
 *
 *   bloom_months  Jun 341 Jul 311 Aug 274 May 257 Sep 176 Apr 156
 *                 Mar  96 Oct  70 Feb  47 Jan  23 Nov  13 Dec  11
 *
 * A dry run killed it: 44 of 58 winter candidates were ALREADY IN THE CATALOG.
 * 49 plants already flower in Dec/Jan/Feb. December reads as 11 because eleven
 * is roughly how many things flower in December, not because we missed them.
 * A low count is not a gap until you have checked it is not the data. Both
 * blocks below were checked the same way before a single plant was seeded:
 *
 *   1. SMALL SPACES. 111 of 595 plants are tagged terrace_balcony (19%). That
 *      is a species gap, not a tagging gap: 13 of 15 obvious balcony plants
 *      already carry the tag correctly, so the count is low because the
 *      catalog is mostly full of things too big for a pot. This matters more
 *      than any other number here — the product is aimed at "a small home
 *      garden I want to be beautiful", and four fifths of the catalog cannot
 *      be grown by someone whose garden is a balcony. Alpines, troughs, dwarf
 *      shrubs, small bulbs, compact sedges.
 *   2. LATE SEASON. Oct 70 and Nov 13, against Sep 176. Checked the same way:
 *      14 of 25 autumn-flowering species are simply absent. Unlike December
 *      this is not a limit of the season — October is a plantable month and
 *      the catalog just does not stock it. Asters, chrysanthemums, autumn
 *      bulbs, late salvias, berrying and late-flowering shrubs.
 *
 * The two blocks overlap on purpose: a potted chrysanthemum, an autumn crocus
 * in a trough and a dwarf aster serve both aims at once, which is the same
 * test round 8 used for its shade/structure overlap.
 *
 * Under-populated plant_types are corrected in passing where the same species
 * serve both aims: succulent 11, biennial 14, annual 36, grass 31, against
 * perennial 266 / shrub 121. Nearly every alpine and houseleek here is also a
 * succulent or a small grass.
 *
 * SCOPE — ornamental. Round 7's held "full small-garden edibles" batch stays
 * held; nothing here touches it. Saffron crocus is in for its October flower,
 * not as an edibles entry.
 *
 * TEN SPECIES WERE CUT after they resolved cleanly, to land the round at 50.
 * Recorded because "it resolved" is not the same as "it belongs", and the next
 * round should not re-propose them without answering these:
 *
 *   · Chamaecyparis obtusa, Picea glauca — the SPECIES are forest trees. Only
 *     named dwarf cultivars are pot plants, and this catalog stores species, so
 *     the row would promise a patio conifer and describe a 20m tree.
 *   · Saxifraga oppositifolia, Gentiana sino-ornata — real plants, wrong
 *     audience. High-alpine and lime-hating respectively; on limestone, in a
 *     Croatian summer, a beginner kills both. Same test that keeps the catalog
 *     honest about shade.
 *   · Vernonia noveboracensis — 2m. It is late, but it is the opposite of the
 *     small-space block; Helianthus salicifolius already carries tall-and-late.
 *   · Salvia involucrata — third Salvia after leucantha and greggii.
 *   · Symphyotrichum ericoides, Boltonia asteroides — a fourth and fifth white
 *     autumn daisy. lateriflorum and novi-belgii cover the look.
 *   · Narcissus triandrus — third small narcissus and the fussiest.
 *   · Acaena microphylla — runs, and sets burrs that stick to a dog. Poor
 *     citizen for the one raised bed somebody has.
 *
 * Hardiness note: the alpines are hardy well past anything a Croatian winter
 * does, and are far more likely to die of winter WET in a pot than of cold —
 * that belongs in the care copy, which is curate-plants' job. The tender end
 * is Salvia leucantha, Salvia elegans and Lycoris; draft-hardiness.ts rates
 * them (docs/curation.md#hardiness, parked).
 *
 * WHY a dedicated script rather than appending to seed-plants.ts: identical to
 * rounds 6-8 — seed-plants.ts takes the top Trefle search hit, which drifts to
 * sibling species. This resolves every name to a Trefle id by EXACT
 * scientific-name match (genus + species, synonym-aware) and logs any skipped
 * top hit. The synonym table earns its keep in both blocks: the Michaelmas
 * daisies have left Aster for Symphyotrichum, the autumn snowflake has left
 * Leucojum for Acis, kaffir lily has left Schizostylis for Hesperantha, the
 * mat-forming sedums are split across Petrosedum and Phedimus, and the
 * houseleeks across Jovibarba.
 *
 * It does NOT touch native_region — that is regenerated for the whole catalog
 * by regenerate-native-region.ts AFTER this seed + curate-plants, per the
 * region-data-model cadence (docs/curation.md#native-region).
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round9.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round9.ts
 *
 * --dry-run resolves + dedupes and prints the plan without any DB writes or
 * Trefle detail calls. The default (apply) seeds each resolved species via the
 * same fetchAndMapSpecies/upsertPlant path as seed-plants.ts, then writes
 * rounds/9/manifest.json. Species already in the catalog (by resolved Trefle id
 * or scientific name, synonyms included) are skipped. native_to and every AI
 * field are left null on seed — curate-plants.ts fills them next.
 */

import { seedRound } from './seed-runner'

const ROUND_LABEL = '9'

// ---------------------------------------------------------------------------
// The list. Grouped by the block each entry belongs to (comments not stored).
// ---------------------------------------------------------------------------
const CANDIDATES: Array<number | string> = [
  // === BLOCK 1: SMALL SPACES (111/595 tagged terrace_balcony) ==============

  // --- alpines & trough plants: the whole point is that a pot is enough ---
  'Saxifraga paniculata', // encrusted rosettes, lime crust
  'Armeria maritima', // thrift — sea pink, tolerates neglect
  'Aubrieta deltoidea', // the wall cascade
  'Aurinia saxatilis', // gold dust — dry stone and pot rims
  'Phlox subulata', // moss phlox mat
  'Dianthus deltoides', // maiden pink
  'Dianthus gratianopolitanus', // Cheddar pink — grey mat, scent
  'Campanula portenschlagiana', // the reliable wall bellflower
  'Campanula carpatica', // tufted, long-flowering, pot-scale
  'Campanula cochleariifolia', // fairy thimbles — tiny
  'Erinus alpinus', // fairy foxglove, self-sows in cracks
  'Gypsophila repens', // creeping baby's breath
  'Silene acaulis', // moss campion cushion
  'Lewisia cotyledon', // the trough showpiece, needs sharp drainage
  'Helianthemum nummularium', // rock rose — long flower, sun
  'Iberis sempervirens', // evergreen candytuft
  'Arabis caucasica', // rock cress, early white
  'Veronica prostrata', // prostrate speedwell, blue sheet
  'Globularia cordifolia', // matted, blue drumsticks

  // --- houseleeks & mat sedums (succulent = 11 in catalog) ---
  'Sempervivum arachnoideum', // cobweb houseleek
  'Sempervivum montanum', // mountain houseleek
  'Sedum acre', // biting stonecrop — roof and pot
  'Sedum album', // white stonecrop mat
  'Thymus serpyllum', // creeping thyme — walkable
  'Thymus praecox', // mother of thyme

  // --- dwarf shrubs & small evergreens: pot structure ---
  'Daphne cneorum', // garland flower — scent, small
  'Lavandula stoechas', // French lavender — pot classic
  'Convolvulus cneorum', // silver bush, silky leaf
  'Teucrium chamaedrys', // wall germander, clippable
  'Salvia greggii', // autumn sage — long season in a pot
  'Pinus mugo', // dwarf mountain pine — real pot structure
  'Juniperus communis', // the small-garden juniper

  // --- compact grasses & sedges (grass = 31) ---
  'Carex comans', // hair sedge — container spiller
  'Carex testacea', // orange sedge
  'Carex buchananii', // leatherleaf, upright bronze
  'Festuca amethystina', // finer, taller-flowering fescue
  'Briza media', // quaking grass — trembling seed heads
  'Koeleria glauca', // blue hair grass, tight and small

  // --- small bulbs: a pot of these IS the spring display ---
  'Muscari armeniacum', // grape hyacinth
  'Muscari botryoides', // the smaller, older grape hyacinth
  'Fritillaria meleagris', // snakeshead — chequered
  'Narcissus bulbocodium', // hoop petticoat — tiny
  'Narcissus jonquilla', // jonquil — scent, several per stem
  'Tulipa clusiana', // lady tulip — slim, returns
  'Tulipa tarda', // low star tulip, naturalises
  'Tulipa sylvestris', // scented wild tulip
  'Iris danfordiae', // yellow reticulata-type, Feb pot
  'Allium moly', // golden garlic — small, shade-tolerant
  'Chionodoxa forbesii', // glory of the snow

  // === BLOCK 2: LATE SEASON (Oct 70, Nov 13, against Sep 176) =============

  // --- autumn perennials ---
  'Chrysanthemum indicum', // the parent of the potted autumn chrysanth
  'Chrysanthemum zawadskii', // hardy border chrysanth species
  'Salvia leucantha', // Mexican bush sage — velvet, very late
  'Salvia elegans', // pineapple sage — red, October
  'Helianthus salicifolius', // willow-leaved sunflower — October yellow
  'Kniphofia rooperi', // the latest red hot poker
  'Helenium autumnale', // sneezeweed proper
  'Rudbeckia triloba', // brown-eyed susan, long into autumn
  'Solidago rugosa', // rough goldenrod — airy, not the thug
  'Persicaria amplexicaulis', // bistort — flowers to first frost
  'Actaea simplex', // autumn bugbane — scented white spires
  'Symphyotrichum lateriflorum', // calico aster, dark stems
  'Symphyotrichum novi-belgii', // Michaelmas daisy proper
  'Anemone tomentosa', // grape-leaved anemone, earliest of the Japanese

  // --- autumn bulbs (many are also trough/pot scale) ---
  'Crocus speciosus', // autumn crocus — blue, October
  'Crocus banaticus', // iris-flowered autumn crocus
  'Crocus sativus', // saffron crocus — October flower
  'Cyclamen hederifolium', // autumn cyclamen — then marbled winter leaf
  'Acis autumnalis', // autumn snowflake (ex-Leucojum)
  'Amaryllis belladonna', // naked ladies — bare-stemmed September
  'Lycoris radiata', // red spider lily
  'Zephyranthes candida', // rain lily — white, autumn, pot

  // --- late-flowering & berrying shrubs ---
  'Caryopteris incana', // bluebeard — blue, September on
  'Clerodendrum trichotomum', // scent then turquoise berry in red calyx
  'Osmanthus heterophyllus', // autumn scent, holly-like evergreen
  'Elaeagnus pungens', // October scent, tough evergreen
  'Heptacodium miconioides', // seven-son flower — Sep flower, red bracts
  'Abelia chinensis', // long late season, scented
  'Callicarpa bodinieri', // beautyberry — violet fruit on bare wood
  'Symphoricarpos albus', // snowberry — white fruit, tough shade
  'Pyracantha coccinea', // firethorn — berries into winter
  'Rubus cockburnianus', // ghost bramble — white winter canes
  'Hamamelis japonica', // witch hazel — the far end of the season
  'Daphne odora', // winter daphne, Feb scent
  'Prunus subhirtella', // winter cherry — flowers in mild spells
  'Erysimum cheiri', // wallflower — biennial, scent from late winter
]

// ---------------------------------------------------------------------------
// Name matching, resolution and the dedupe read all live in
// ./species-resolver.ts. This file used to carry its own copy of the synonym
// table, which is how twelve synonym groups were lost between rounds — see that
// file's header.
// ---------------------------------------------------------------------------

seedRound({ label: '9', candidates: CANDIDATES })
