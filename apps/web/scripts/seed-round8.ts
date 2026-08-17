/**
 * Round-8 catalog expansion (July 2026) — the shade & structure round:
 * 101 candidates, all resolving to distinct new species, taking the catalog
 * from 494 to ~595.
 *
 * WHY this round exists — two holes measured against the round-7 catalog:
 *
 *   1. SHADE. Only 75 of 494 plants thrive in shade (15%). Every north-facing
 *      balcony, courtyard, side return and under-tree bed in the product's
 *      target audience is served by that thin slice. This round roughly
 *      doubles it: woodland perennials, ferns, shade shrubs, shade bulbs and
 *      shade sedges.
 *   2. STYLE SKEW. style_tags run cottage 455 / classic 307 / wildflower 287
 *      against modern 59 and lush 64. The catalog can dress a cottage border
 *      and struggles to dress a courtyard. The architectural block (agaves,
 *      yuccas, palms, bananas, tree ferns, big-leaf subtropicals) is the raw
 *      material the modern and lush palettes are missing.
 *
 * Under-populated plant_types are corrected in passing, since the same species
 * serve both aims: succulent 6, climber 24, tree 24, grass 28, bulb 33 — all
 * get a block here, against perennial 226 / shrub 103.
 *
 * SCOPE — ornamental structure, not a second edibles round. Round 7's held
 * "full small-garden edibles" batch (tomato, cucumber, lettuce, salad veg)
 * stays held; it is a separate product call and nothing here touches it.
 *
 * Hardiness note: the subtropical/architectural block (Musa, Colocasia,
 * Tetrapanax, Aeonium, Echeveria, Crassula) is tender in a Croatian winter and
 * is container/overwinter material, not border planting. draft-hardiness.ts
 * will rate them accordingly (docs/curation.md#hardiness); the care copy is curate-plants' job.
 *
 * WHY a dedicated script rather than appending to seed-plants.ts: identical to
 * rounds 6 and 7 — seed-plants.ts takes the top Trefle search hit, which
 * drifts to sibling species. This resolves every name to a Trefle id by EXACT
 * scientific-name match (genus + species, synonym-aware) and logs any skipped
 * top hit. This round leans hard on the synonym table because a lot of shade
 * woodlanders have been split out of their old genera (Anemone → Anemonoides,
 * Blechnum → Struthiopteris, Scilla → Othocallis, Ipheion → Tristagma).
 *
 * Four wanted species have no exact Trefle record and were dropped rather than
 * bound to a sibling: Tiarella wherryi (sunk into T. cordifolia, already held),
 * Astilbe chinensis, Dryopteris affinis and Schizophragma hydrangeoides. Welsh
 * poppy is listed under its accepted name Papaver cambricum, not Meconopsis.
 *
 * It does NOT touch native_region — that is regenerated for the whole catalog
 * by regenerate-native-region.ts AFTER this seed + curate-plants --new-only,
 * per the region-data-model cadence (docs/curation.md#native-region).
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round8.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round8.ts
 *
 * --dry-run resolves + dedupes and prints the plan without any DB writes or
 * Trefle detail calls. The default (apply) seeds each resolved species via the
 * same fetchAndMapSpecies/upsertPlant path as seed-plants.ts, then writes
 * rounds/8/manifest.json. Species already in the catalog (by resolved Trefle id
 * or scientific name, synonyms included) are skipped. native_to and every AI
 * field are left null on seed — curate-plants.ts --new-only fills them next.
 */

import { seedRound } from './seed-runner'

const ROUND_LABEL = '8'

// ---------------------------------------------------------------------------
// The list. Grouped by the block each entry belongs to (comments not stored).
// ---------------------------------------------------------------------------
const CANDIDATES: Array<number | string> = [
  // --- woodland & shade perennials (the core gap) ---
  'Hosta plantaginea', // fragrant white, late — only sieboldiana held
  'Hosta ventricosa', // glossy dark leaf, violet spikes
  'Heuchera villosa', // felted late-flowering species
  'Heuchera sanguinea', // coral bells proper
  'Heuchera americana', // marbled winter foliage
  'Epimedium pinnatum', // evergreen, yellow
  'Epimedium perralderianum', // glossy dry-shade groundcover
  'Pulmonaria saccharata', // silver-spotted lungwort
  'Anemone nemorosa', // wood anemone — the classic sheet
  'Anemone ranunculoides', // yellow wood anemone
  'Anemone blanda', // spring carpet under shrubs
  'Corydalis solida', // early tuber, dry shade
  'Dicentra eximia', // long-season fringed bleeding heart
  'Astilbe japonica', // early white plumes
  'Aconitum carmichaelii', // autumn monkshood
  'Trillium erectum', // red trillium
  'Sanguinaria canadensis', // bloodroot
  'Saxifraga stolonifera', // strawberry saxifrage — container shade
  'Bergenia crassifolia', // winter leaf colour
  'Symphytum grandiflorum', // dry-shade groundcover comfrey
  'Lamium orvala', // clump-forming, non-running deadnettle
  'Lamium galeobdolon', // yellow archangel (note running habit in care)
  'Thalictrum aquilegiifolium', // fluffy mauve, aquilegia foliage
  'Thalictrum rochebruneanum', // tall see-through violet
  'Chelone obliqua', // turtlehead — late, damp shade
  'Tricyrtis formosana', // toad lily — only hirta held
  'Stylophorum diphyllum', // wood poppy
  'Papaver cambricum', // Welsh poppy (ex-Meconopsis) — self-sows in shade
  'Primula japonica', // candelabra primula, damp
  'Primula denticulata', // drumstick primula
  'Primula sieboldii', // woodland primula, laced petals
  'Omphalodes cappadocica', // long-flowering blue navelwort

  // --- ferns (structure for the darkest corners) ---
  'Blechnum spicant', // hard fern — evergreen rosette
  'Cyrtomium falcatum', // holly fern — glossy, container-friendly
  'Dryopteris wallichiana', // dark-stemmed, architectural
  'Polystichum polyblepharum', // tassel fern — glossy evergreen
  'Onoclea sensibilis', // sensitive fern — damp spreader

  // --- shade shrubs & evergreen structure ---
  'Aucuba japonica', // deep dry shade evergreen
  'Sarcococca hookeriana', // winter scent — only confusa held
  'Ruscus aculeatus', // butcher's broom — very dry shade
  'Danae racemosa', // Alexandrian laurel — arching evergreen
  'Prunus lusitanica', // Portugal laurel — better-mannered hedge
  'Pieris japonica', // acid-shade evergreen, red new growth
  'Rhododendron luteum', // scented deciduous azalea
  'Gaultheria procumbens', // wintergreen — berried groundcover
  'Hydrangea quercifolia', // oakleaf — autumn colour
  'Hydrangea paniculata', // the reliable late panicle
  'Hydrangea serrata', // refined lacecap for part shade
  'Viburnum davidii', // low evergreen, ribbed leaf
  'Viburnum plicatum', // tiered branching — real structure
  'Ilex crenata', // box alternative
  'Euonymus fortunei', // evergreen shade groundcover/climber
  'Cotoneaster horizontalis', // herringbone wall shrub

  // --- climbers (24 in catalog, shade-capable ones especially thin) ---
  'Parthenocissus henryana', // silver-veined, part shade
  'Actinidia kolomikta', // pink-tipped variegated foliage
  'Aristolochia macrophylla', // Dutchman's pipe — big-leaf screen
  'Hedera colchica', // Persian ivy — large leaf
  'Wisteria floribunda', // Japanese wisteria — only sinensis held
  'Solanum laxum', // potato vine — long season, warm wall

  // --- bulbs & tubers (33 in catalog; shade bulbs almost absent) ---
  'Narcissus poeticus', // pheasant's eye — late, scented
  'Camassia leichtlinii', // tall blue spires, damp meadow
  'Camassia quamash', // shorter quamash
  'Lilium martagon', // turkscap — the shade lily
  'Lilium regale', // regal lily — scent, containers
  'Allium cristophii', // star of Persia — big seedhead
  'Puschkinia scilloides', // striped squill
  'Ipheion uniflorum', // spring starflower
  'Arum italicum', // marbled winter foliage, autumn berries
  'Arisaema triphyllum', // Jack-in-the-pulpit
  'Fritillaria imperialis', // crown imperial — architecture
  'Nerine bowdenii', // late autumn pink
  'Eucomis bicolor', // pineapple lily — container
  'Leucojum vernum', // spring snowflake — only aestivum held
  'Scilla siberica', // intense blue, naturalises

  // --- shade grasses & sedges ---
  'Carex pendula', // weeping sedge — big, damp shade
  'Carex muskingumensis', // palm sedge — bright green whorls
  'Luzula nivea', // snowy woodrush — only sylvatica held

  // --- architectural foliage: succulents & subtropicals (modern + lush) ---
  'Agave americana', // the century plant silhouette
  'Agave parryi', // compact grey rosette, hardier
  'Aeonium arboreum', // dark rosette — container
  'Crassula ovata', // jade plant — pot anchor
  'Opuntia humifusa', // the hardy prickly pear
  'Yucca rostrata', // blue beaked yucca — only filamentosa held
  'Yucca gloriosa', // Spanish dagger
  'Cordyline australis', // cabbage palm — vertical accent
  'Trachycarpus fortunei', // windmill palm — hardiest palm
  'Chamaerops humilis', // dwarf fan palm — Mediterranean
  'Musa basjoo', // Japanese banana — the lush headline
  'Tetrapanax papyrifer', // rice paper plant — huge leaf
  'Colocasia esculenta', // elephant ear — container drama
  'Canna indica', // tropical leaf + flower
  'Dicksonia antarctica', // soft tree fern — shade + lush at once

  // --- small trees (24 in catalog, most of them Mediterranean) ---
  'Acer japonicum', // fullmoon maple — autumn colour
  'Cercis canadensis', // eastern redbud — only siliquastrum held
  'Styrax japonicus', // Japanese snowbell — hanging white
  'Parrotia persica', // Persian ironwood — autumn, bark
  'Malus floribunda', // Japanese crab — blossom + fruit
  'Sorbus aucuparia', // rowan — berries for birds
  'Carpinus betulus', // hornbeam — hedge and small tree
  'Laburnum anagyroides', // golden chain
  'Chionanthus virginicus', // fringe tree — fleecy white
]

// ---------------------------------------------------------------------------
// Name matching, resolution and the dedupe read all live in
// ./species-resolver.ts. This file used to carry its own copy of the synonym
// table, which is how twelve synonym groups were lost between rounds — see that
// file's header.
// ---------------------------------------------------------------------------

seedRound({ label: '8', candidates: CANDIDATES })
