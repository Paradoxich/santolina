/**
 * Round-10 catalog expansion (July 2026) — balcony & container plants, a
 * direct continuation of round 9's small-space block, not a repeat of it.
 *
 * WHY the theme is unchanged. Checked before writing a single candidate, the
 * same way round 9 checked winter before dropping it:
 *
 *   138 of 645 plants (21.4%) carry space_types terrace_balcony, up from
 *   111/595 (18.7%) after round 9's 27-ish balcony entries. Spot-checked
 *   against 15 unambiguous balcony genera already in the catalog (Sempervivum,
 *   Thymus, Sedum, Lavandula, Armeria, Saxifraga) — all 15 tag correctly, so
 *   this is still a species gap, not a tagging gap. Four fifths of the catalog
 *   remains too large for a pot, same as round 9 found.
 *
 * This round deliberately does NOT re-list round 9's alpines, houseleeks,
 * mat sedums, dwarf shrubs, compact grasses or small bulbs — those genera are
 * covered; this list works different corners of the same gap. A first draft
 * of this list was mostly a second wave of round 9's own categories and it
 * cost 27 of 54 candidates as "already in catalog" on the dry run — round 8/9
 * had already reached most of the obvious Mediterranean-herb and common-bulb
 * second choices. The genus check that actually paid off: Pelargonium,
 * Bougainvillea, Fuchsia, Begonia, Impatiens, Plumbago and Lantana are absent
 * from the catalog ENTIRELY (checked directly against the live table before
 * writing this list) — every one of those is a top-of-mind Adriatic balcony
 * plant, and their absence is a bigger species gap than anything left in
 * round 9's original categories. The seed-time catalog dedupe below is the
 * actual guard; this note is why the two lists don't overlap by design.
 *
 * THREE OF ROUND 9's DOCUMENTED CUTS APPLY HERE TOO, on the same reasoning,
 * so they are not re-proposed:
 *   · Saxifraga oppositifolia — high-alpine, wrong audience (round 9 note).
 *   · Acaena microphylla — runs, sets dog-burr seed. Poor container citizen.
 *   · Chamaecyparis obtusa / Picea glauca — species are forest trees; only
 *     named dwarf cultivars are pot plants, and this catalog stores species.
 *
 * Ornamental-first per CLAUDE.md: the herbs below (sage, marjoram) are
 * included because they are also genuinely ornamental pot plants, not
 * because this is an edibles round.
 *
 * ONE SPECIES WAS CUT to land the round at 50 after resolving cleanly:
 * Torenia fournieri (wishbone flower) — the least distinctive of the annual
 * pot flowers here once Impatiens and Begonia's replacements already covered
 * shade-pot colour.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round10.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round10.ts
 *
 * --dry-run resolves + dedupes and prints the plan without any DB writes or
 * Trefle detail calls. The default (apply) seeds each resolved species via the
 * same fetchAndMapSpecies/upsertPlant path as seed-plants.ts, then writes
 * rounds/10/manifest.json. Species already in the catalog (by resolved Trefle
 * id or scientific name, synonyms included) are skipped. native_to and every
 * AI field are left null on seed — curate-plants.ts fills them next.
 */

import { seedRound } from './seed-runner'

const ROUND_LABEL = '10'

// ---------------------------------------------------------------------------
// The list. Grouped by the block each entry belongs to (comments not stored).
// ---------------------------------------------------------------------------
const CANDIDATES: Array<number | string> = [
  // === ANNUALS & BEDDING BRED FOR POTS ======================================
  'Petunia integrifolia', // wild petunia — species behind the pot hybrids
  'Calibrachoa parviflora', // million bells — trailing, container staple
  'Nemesia caerulea', // long-flowering, spills over a rim
  'Diascia barberae', // twinspur — low mound, front-of-pot
  'Osteospermum ecklonis', // African daisy — compact, sun-loving
  'Lobularia maritima', // sweet alyssum — the classic pot edge
  'Verbena rigida', // compact verbena, upright not sprawling
  'Thunbergia alata', // black-eyed Susan vine — annual pot climber
  'Impatiens walleriana', // busy lizzie — shaded balcony pot staple
  'Portulaca grandiflora', // moss rose — succulent-leaved, full-sun pot

  // === CONTAINER CLIMBERS FOR A BALCONY TRELLIS =============================
  'Clematis macropetala', // compact, double nodding flowers
  'Jasminum polyanthum', // scented, classic pot climber
  'Bougainvillea glabra', // the Adriatic balcony rail plant
  'Plumbago auriculata', // sky-blue, vigorous but very pot/trellis-common

  // === EVERGREEN SHRUBS FOR POT STRUCTURE ====================================
  'Pittosporum tobira', // Mediterranean pot evergreen, scented spring flower
  'Lantana camara', // long-flowering patio shrub, sun-loving

  // === THE ADRIATIC BALCONY GENUS THE CATALOG IS MISSING ENTIRELY ===========
  'Pelargonium peltatum', // trailing ivy-leaf geranium — THE balcony-rail plant
  'Pelargonium zonale', // upright zonal geranium, the pot classic
  'Pelargonium graveolens', // scented-leaf geranium
  'Pelargonium capitatum', // rose-scented, trailing habit
  'Pelargonium odoratissimum', // apple-scented geranium
  'Pelargonium quercifolium', // oak-leaf scented geranium
  'Hibiscus rosa-sinensis', // Chinese hibiscus — the tropical patio-pot flower
  'Kalanchoe blossfeldiana', // the widely-sold flowering pot succulent

  // === SECOND-WAVE ALPINES & TROUGH PERENNIALS ================================
  'Erodium reichardii', // dwarf storksbill, trough scale
  'Euphorbia myrsinites', // trailing succulent-leaved spurge
  'Campanula garganica', // starry trailer, wall and pot
  'Campanula poscharskyana', // vigorous trailing bellflower
  'Nepeta racemosa', // dwarf catmint, pot-scale unlike faassenii
  'Origanum laevigatum', // ornamental oregano, long flower
  'Scabiosa columbaria', // compact pincushion flower
  'Erigeron karvinskianus', // Mexican fleabane, wall and pot spiller
  'Geranium cinereum', // alpine cranesbill, trough scale
  'Geranium sanguineum', // bloody cranesbill, compact mound

  // === POT SUCCULENTS BEYOND SEDUM/SEMPERVIVUM =================================
  'Sempervivum calcareum', // blue-grey rosette, red tips
  'Sedum sexangulare', // tight mat, six-ranked leaves
  'Echeveria elegans', // Mexican hens-and-chicks, the pot-succulent staple
  'Aeonium haworthii', // pinwheel rosette, patio pot structure
  'Agave parryi', // compact century plant, pot-scale unlike americana
  'Aloe vera', // windowsill/balcony succulent, near-universal
  'Convolvulus sabatius', // trailing bindweed relative, hanging pot

  // === CITRUS & FRUIT IN A POT ================================================
  'Citrus aurantium', // bitter orange, the balcony citrus
  'Fragaria vesca', // alpine strawberry — edge-of-pot, ornamental fruit

  // === THIRD-WAVE POT ANNUALS & TRAILERS =======================================
  'Gazania rigens', // treasure flower, drought pot
  'Viola cornuta', // horned violet — the window-box classic
  'Dianthus caryophyllus', // carnation, upright pot flower
  'Rosa chinensis', // china rose — the pot/patio-scale species rose
  'Bidens ferulifolia', // trailing yellow, hanging basket staple
  'Helichrysum petiolare', // silver trailing foliage, basket filler
  'Brachyscome iberidifolia', // Swan River daisy, pot annual
  'Scaevola aemula', // fan flower, trailing hanging basket
  'Ipomoea batatas', // ornamental sweet potato vine, trailing foliage

  // === MORE POT CLIMBERS & POT CACTI ===========================================
  'Mandevilla sanderi', // showy trumpet-flowered pot climber
  'Schlumbergera truncata', // Christmas cactus, epiphytic, classic pot plant
  'Opuntia microdasys', // bunny ears — small pot-scale cactus
  'Cyclamen persicum', // florist cyclamen, cool-season pot flower

  // === SECOND-WAVE COMPACT GRASSES =============================================
  'Festuca glauca', // blue fescue, the pot-edge classic
  'Carex oshimensis', // compact evergreen sedge
  'Anemanthele lessoniana', // pheasant's tail grass, arching mound

  // === SECOND-WAVE SMALL BULBS ==================================================
  'Iris lutescens', // dwarf bearded iris
  'Allium karataviense', // broad silver leaf, low flower head

  // === HANGING-BASKET FUCHSIAS ================================================
  'Fuchsia magellanica', // hardy species fuchsia, pot and hanging basket

  // === ORNAMENTAL POT HERBS =====================================================
  'Salvia officinalis', // culinary sage — grey leaf, compact shrub
  'Origanum majorana', // marjoram — soft grey-green, low mound
]

// ---------------------------------------------------------------------------
// Name matching, resolution and the dedupe read all live in
// ./species-resolver.ts. This file used to carry its own copy of the synonym
// table, which is how twelve synonym groups were lost between rounds — see that
// file's header.
// ---------------------------------------------------------------------------

seedRound({ label: '10', candidates: CANDIDATES })
