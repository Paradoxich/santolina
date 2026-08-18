/**
 * Round-11 catalog expansion (August 2026) — a FILL round, and the first one
 * that is deliberately not a theme. Takes the catalog from 695 to ~723.
 *
 * WHY THERE IS NO THEME. Three candidate themes were gap-tested first, using
 * round 9's rule: a low count is not a gap until you have checked it is not
 * the data. All three failed at roughly the ratio that killed round 9's own
 * winter block (44 of 58 already held):
 *
 *   · WINTER INTEREST — already killed by round 9 on that exact test, and the
 *     histogram has only improved since (Nov 13→22, Dec 11→15, Jan 23→29).
 *     Not re-proposed.
 *   · MODERN / NEW PERENNIAL — 33 of 48 candidates (69%) already in catalog.
 *     Worse for the theme, the `modern` style tag reads 95/695 for a reason
 *     that seeding cannot fix: the GRASSES are tagged correctly (19 of 22
 *     archetypal genera — Miscanthus, Stipa, Panicum, Sporobolus,
 *     Deschampsia, Schizachyrium, Hakonechloa, Phormium, Yucca), while the
 *     PRAIRIE PERENNIALS are not. Verbena bonariensis, Veronicastrum
 *     virginicum, Amsonia hubrichtii, Liatris spicata and Sanguisorba
 *     officinalis are the signature palette and none carry `modern`. That is
 *     a re-tag (curate-styles), logged in the Notion Build Backlog — it is
 *     NOT round work and must not be folded in here, or it writes outside
 *     this manifest and trips the scope guard.
 *   · CLIMBERS — 32 of 46 candidates (70%) already in catalog.
 *
 * So the honest read is the one the July 29 ruling already made: at 695
 * species the catalog is inside its 500–700 target band and has no large
 * species gap left. This round exists to exercise the pipeline end to end, and
 * it is sized and scoped accordingly.
 *
 * WHAT THE LIST IS. Every entry below is a verified absentee — the residue of
 * the three probes above, each checked directly against the live table by
 * exact scientific name before being written here. Nothing was padded to hit
 * a round number; padding is precisely what cost round 10 its 27-of-54 dry
 * run. 28 candidates, not 50, for the same reason.
 *
 * ONE DELIBERATE CUT, on the round 9/10 "poor citizen" precedent:
 *   · Lonicera japonica — Japanese honeysuckle. A genuine absentee and a
 *     genuinely bad recommendation: invasive across much of Europe and North
 *     America, and this catalog is read by beginners who will not know that.
 *     L. sempervirens covers the same want without the problem and is below.
 *
 * SCALE NOTE, not a cut: Silphium perfoliatum and Vernonia noveboracensis are
 * both 1.5–2.5m back-of-border plants. They stay — the catalog already holds
 * plants of that scale and the product is "a small garden I want beautiful",
 * not "only small plants" — but they are the two least likely to suit a
 * balcony, and that belongs in their care copy, which is curate-plants' job.
 *
 * SYNONYM GROUPS ARE WRITTEN BEFORE THE DRY RUN (trap 7). This list is unusual
 * in how many entries have moved genus recently, which is exactly the
 * condition that makes a name search bind to a sibling species:
 *   Eutrochium←Eupatorium · Calamintha↔Clinopodium · Persicaria←Polygonum/
 *   Bistorta · Achnatherum←Stipa · Symphyotrichum←Aster · Echinacea←Rudbeckia
 *   · Campsis↔Bignonia/Tecoma · Trachelospermum←Rhynchospermum ·
 *   Parthenocissus↔Ampelopsis · Ipomoea↔Pharbitis
 *
 * WHAT THE DRY RUN FOUND (2026-08-14), all four of its misses run down by hand
 * and resolved by VERIFIED id — never by relaxing the matcher, which is the
 * trap itself. Climbing hydrangea, predicted to miss as Hydrangea anomala
 * subsp. petiolaris, resolved cleanly; the real misses were elsewhere:
 *
 *   · A GENDER-VARIANT EPITHET DEFEATS AN EXACT-EPITHET MATCH — twice in one
 *     round, so expect it. A Latin adjectival epithet agrees in GENDER with
 *     its genus, so moving genus can change the ending: Selinum wallichianum
 *     is held by Trefle as Ligusticopsis wallichian-A (id 96932, synonym list
 *     names Selinum wallichianum), and Rhodochiton atrosanguine-US as
 *     R. atrosanguine-UM (id 122372). SYNONYM_GENERA cannot fix either — the
 *     genus table is not consulted when the epithet itself differs. Seeding by
 *     verified id is the correct escape hatch and the one used here.
 *   · SCHIZOPHRAGMA HAS BEEN SUNK INTO HYDRANGEA. Trefle holds the Japanese
 *     hydrangea vine as Hydrangea hydrangeoides (id 359005, synonym list names
 *     Schizophragma hydrangeoides). Genus AND epithet both moved.
 *   · FICUS PUMILA IS NOT IN TREFLE AT ALL — not under a synonym, not under
 *     the genus; the search returns nothing. Dropped rather than worked
 *     around: this pipeline seeds by Trefle id, so a species the source does
 *     not hold cannot be seeded, and inventing a row would put an unsourced
 *     plant in a catalog whose whole point is provenance.
 *
 * All three ids above were confirmed against the live Trefle record by hand
 * (scientific name, family, and an explicit synonym naming the plant asked
 * for) before being written here. All three also return common_name: null,
 * so they are three known entries for the post-seed name pass (trap 6).
 *
 * THE SYNONYM TABLE ALSO PAID FOR ITSELF ON THE FIRST RUN: Persicaria
 * amplexicaulis and Calamintha nepeta both resolved to plants the catalog
 * already holds (Bistorta amplexicaulis, Clinopodium nepeta) and were skipped.
 * A plain SQL absence check missed both, because SQL does not do synonyms —
 * worth remembering the next time a candidate list is validated with a query.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round11.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round11.ts
 *
 * --dry-run resolves + dedupes and prints the plan without any DB writes or
 * Trefle detail calls. The default (apply) seeds each resolved species via the
 * same fetchAndMapSpecies/upsertPlant path as seed-plants.ts, then writes
 * rounds/11/manifest.json. Species already in the catalog (by resolved Trefle
 * id or scientific name, synonyms included) are skipped. native_to and every
 * AI field are left null on seed — curate-plants.ts fills them next.
 */

import { seedRound } from './seed-runner'

const ROUND_LABEL = '11'

// ---------------------------------------------------------------------------
// The list. Grouped by which probe surfaced it (comments not stored).
// ---------------------------------------------------------------------------
const CANDIDATES: Array<number | string> = [
  // === PRAIRIE / NEW-PERENNIAL RESIDUE ======================================
  'Eutrochium purpureum', // sweet Joe-Pye weed (ex-Eupatorium)
  'Silphium perfoliatum', // cup plant — tall, paired leaves hold rain
  'Vernonia noveboracensis', // New York ironweed — late violet
  'Echinacea pallida', // pale purple coneflower — thin reflexed petals
  'Pycnanthemum muticum', // mountain mint — silver bracts, pollinator magnet
  'Persicaria amplexicaulis', // red bistort — long-season spires (ex-Polygonum)
  'Calamintha nepeta', // lesser calamint — haze of tiny flowers (↔Clinopodium)
  96932, // Selinum wallichianum → Trefle "Ligusticopsis wallichiana" (gender)
  'Cenolophium denudatum', // Baltic parsley — airy umbel
  'Eryngium giganteum', // Miss Willmott's ghost — silver bracts, biennial
  'Symphyotrichum oblongifolium', // aromatic aster — late, compact (ex-Aster)

  // === STRUCTURAL GRASSES THE CATALOG LACKS =================================
  'Muhlenbergia capillaris', // pink muhly — pink autumn haze
  'Andropogon gerardii', // big bluestem — tall prairie grass
  'Achnatherum calamagrostis', // silver spear grass (ex-Stipa calamagrostis)
  'Eragrostis spectabilis', // purple love grass — low purple cloud

  // === CLIMBERS: PERENNIAL & WOODY ==========================================
  'Hydrangea petiolaris', // climbing hydrangea — expected to miss, see header
  359005, // Schizophragma hydrangeoides → Trefle "Hydrangea hydrangeoides"
  'Parthenocissus quinquefolia', // Virginia creeper — scarlet autumn
  'Lonicera sempervirens', // coral honeysuckle — non-invasive, hummingbird red
  'Trachelospermum asiaticum', // Asian star jasmine — tougher than jasminoides
  'Campsis grandiflora', // Chinese trumpet creeper — larger flower than radicans
  'Muehlenbeckia complexa', // wire vine — fine tracery over a frame
  // Ficus pumila — DROPPED: absent from Trefle entirely (see header).

  // === CLIMBERS: ANNUAL & TENDER (a balcony trellis in one season) ==========
  'Cobaea scandens', // cup and saucer vine — fast annual cover
  'Eccremocarpus scaber', // Chilean glory flower — orange tubes
  122372, // Rhodochiton atrosanguineus → Trefle "R. atrosanguineum" (gender)
  'Ipomoea tricolor', // morning glory — the classic annual climber
  'Tropaeolum speciosum', // flame nasturtium — scarlet through a hedge
]

// ---------------------------------------------------------------------------
// Name matching, resolution and the dedupe read all live in
// ./species-resolver.ts. This file used to carry its own copy of the synonym
// table, which is how twelve synonym groups were lost between rounds — see that
// file's header.
// ---------------------------------------------------------------------------

seedRound({ label: '11', candidates: CANDIDATES })
