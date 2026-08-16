/**
 * Round-6 catalog expansion (July 2026) — a gap-targeted seed of ~100
 * garden-worthy ornamentals, taking the catalog from 318 toward ~418.
 *
 * WHY a dedicated script rather than appending to seed-plants.ts:
 *   1. seed-plants.ts's name resolver takes the top Trefle search hit, which
 *      silently drifts to sibling species (the failure the plant-round notes
 *      warn about repeatedly). This script resolves every name to a Trefle ID
 *      by an EXACT scientific-name match (genus + species, synonym-aware) and
 *      logs when it had to skip the top hit — same guard as
 *      seed-regional-natives.ts.
 *   2. It does NOT touch native_region. That column is no longer hand-tagged;
 *      it is regenerated for the whole catalog from Trefle distributions by
 *      regenerate-native-region.ts (Option A, WGSRPD Level 2). Run that AFTER
 *      this seed + curate-plants --new-only, per the region-data-model cadence.
 *
 * SELECTION — round 6 is a global gap-fill, deliberately reaching past the
 * Adriatic/Med/cottage core that rounds 1-5 saturated. Targets, from the live
 * 318-plant distribution:
 *   - the persistently thin `modern` (42) and `lush` (48) style tags
 *   - the shade-thrives deficit (shade 97 of 318)
 *   - the Nov-Feb bloom hole (Nov 6 / Dec 5 / Jan 16 plants)
 *   - the thinnest plant_types: annual (3), succulent (3), biennial (7),
 *     tree (12), grass (17), climber (17)
 *   - orange bloom (10) — the thinnest genuine color bucket
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round6.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round6.ts
 *
 * --dry-run resolves + dedupes and prints the plan without any DB writes or
 * Trefle detail calls. The default (apply) seeds each resolved species via the
 * same fetchAndMapSpecies/upsertPlant path as seed-plants.ts. Species already
 * in the catalog (by resolved Trefle ID or scientific name, synonyms included)
 * are skipped. native_to and every AI field are left null on seed —
 * curate-plants.ts --new-only fills them next.
 */

import { fetchAndMapSpecies } from '../lib/trefle'
import { upsertPlant } from '../lib/plants-db'
import {
  fetchCatalogIndex,
  normSci,
  resolve,
  type Resolved,
} from './species-resolver'

// ---------------------------------------------------------------------------
// The list. Grouped by the gap each block targets (comments are not stored).
// A handful of hybrids/cultivars are seeded by numeric Trefle ID where name
// search can't resolve them — noted inline.
// ---------------------------------------------------------------------------
const CANDIDATES: Array<number | string> = [
  // --- ornamental grasses & sedges (grass 17 → deepen; shade + modern) ---
  'Sporobolus heterolepis', // prairie dropseed
  'Chasmanthium latifolium', // northern sea oats — shade grass
  'Schizachyrium scoparium', // little bluestem — prairie, autumn
  'Bouteloua gracilis', // blue grama — modern prairie
  'Imperata cylindrica', // Japanese blood grass — red, modern
  'Carex oshimensis', // evergreen Japanese sedge — lush/modern
  'Carex testacea', // orange sedge — modern, orange foliage
  'Carex morrowii', // Japanese sedge — shade evergreen
  'Milium effusum', // Bowles' golden grass — shade
  'Luzula sylvatica', // greater woodrush — shade groundcover
  'Hordeum jubatum', // foxtail barley — annual grass

  // --- bold foliage / architectural (lush 48, modern 42) ---
  'Cynara cardunculus', // cardoon — architectural silver
  'Macleaya cordata', // plume poppy — architectural
  'Thalictrum delavayi', // Chinese meadow rue — airy, lush
  'Rheum palmatum', // ornamental rhubarb — architectural
  'Angelica gigas', // Korean angelica — deep red umbels, modern
  'Foeniculum vulgare', // fennel — bronze, architectural
  'Filipendula rubra', // queen of the prairie — lush moisture
  'Astilboides tabularis', // shield leaf — lush
  'Rodgersia aesculifolia', // fingerleaf rodgersia — lush
  'Inula helenium', // elecampane — architectural
  'Veronicastrum virginicum', // Culver's root — modern vertical
  'Amsonia hubrichtii', // threadleaf blue star — modern, autumn gold

  // --- shade / woodland (shade 97 → deepen) ---
  'Tellima grandiflora', // fringe cups
  'Pseudofumaria lutea', // yellow corydalis (Corydalis lutea) — long bloom
  'Dicentra formosa', // western bleeding heart
  'Trillium grandiflorum', // white trillium — woodland spring
  'Erythronium dens-canis', // dog's tooth violet — woodland bulb
  'Uvularia grandiflora', // large-flowered bellwort
  'Maianthemum racemosum', // false Solomon's seal
  'Polygonatum odoratum', // scented Solomon's seal
  'Geranium phaeum', // dusky cranesbill — shade geranium
  'Geranium nodosum', // knotted cranesbill — shade geranium
  'Galium odoratum', // sweet woodruff — shade groundcover
  'Waldsteinia ternata', // barren strawberry — evergreen groundcover
  'Actaea racemosa', // black cohosh (Cimicifuga) — architectural shade
  'Astrantia maxima', // large masterwort

  // --- ferns (lush / shade) ---
  'Osmunda regalis', // royal fern — lush
  'Dryopteris erythrosora', // autumn fern — coppery new growth
  'Polystichum munitum', // western sword fern
  'Athyrium filix-femina', // lady fern
  'Asplenium trichomanes', // maidenhair spleenwort

  // --- winter / early-spring interest (Nov-Feb hole) ---
  'Helleborus foetidus', // stinking hellebore — winter, green, architectural
  'Iris unguicularis', // Algerian iris — winter bloom
  'Clematis cirrhosa', // winter-flowering clematis — climber
  'Lonicera fragrantissima', // winter honeysuckle — fragrant shrub
  'Abeliophyllum distichum', // white forsythia — early spring fragrant
  'Stachyurus praecox', // early spring catkins
  'Corylopsis pauciflora', // buttercup winter hazel — early spring
  'Garrya elliptica', // silk tassel bush — winter catkins, evergreen
  'Scilla forbesii', // glory-of-the-snow (Chionodoxa) — early spring bulb
  'Adonis amurensis', // Amur adonis — very early, yellow

  // --- annuals & biennials (annual 3, biennial 7 → cottage cutting garden) ---
  'Cosmos bipinnatus', // cosmos — annual cutting
  'Nigella damascena', // love-in-a-mist — annual
  'Calendula officinalis', // pot marigold — annual, orange
  'Tropaeolum majus', // nasturtium — annual, orange
  'Zinnia elegans', // zinnia — annual cutting
  'Antirrhinum majus', // snapdragon — annual/short-lived
  'Lathyrus odoratus', // sweet pea — annual climber
  'Lobularia maritima', // sweet alyssum — annual groundcover
  'Nicotiana sylvestris', // flowering tobacco — architectural annual
  'Ammi majus', // bishop's flower — annual umbel
  'Orlaya grandiflora', // white laceflower — annual umbel
  'Cerinthe major', // honeywort — annual, blue
  'Lunaria annua', // honesty — biennial, silver seedheads
  'Hesperis matronalis', // sweet rocket — biennial
  'Onopordum acanthium', // Scotch thistle — biennial, architectural silver

  // --- mediterranean / dry structural ---
  'Coronilla valentina', // winter-flowering, yellow
  'Bupleurum fruticosum', // shrubby hare's ear — evergreen
  'Salvia microphylla', // baby sage — long-blooming subshrub
  'Euphorbia mellifera', // honey spurge — architectural evergreen
  'Cistus albidus', // grey-leaved cistus

  // --- modern prairie / long-bloom perennials ---
  'Helenium autumnale', // sneezeweed — orange/red, autumn
  'Agastache foeniculum', // anise hyssop — modern, pollinators
  'Eryngium yuccifolium', // rattlesnake master — modern architectural
  'Rudbeckia maxima', // giant coneflower — architectural, glaucous
  'Solidago rugosa', // rough goldenrod — autumn
  'Eutrochium maculatum', // Joe Pye weed (Eupatorium) — architectural
  'Echinacea paradoxa', // yellow coneflower
  'Salvia greggii', // autumn sage — long-blooming subshrub

  // --- small ornamental trees & large structural shrubs (tree 12) ---
  'Acer palmatum', // Japanese maple — lush/modern, autumn
  'Acer griseum', // paperbark maple — bark interest
  'Amelanchier lamarckii', // snowy mespilus — blossom + autumn
  'Cornus kousa', // Chinese dogwood — modern
  'Prunus serrula', // Tibetan cherry — ornamental bark
  'Magnolia stellata', // star magnolia — spring blossom
  'Cercidiphyllum japonicum', // katsura — autumn colour + scent
  'Koelreuteria paniculata', // golden rain tree — yellow summer
  'Betula utilis', // Himalayan birch — white bark, modern
  'Crataegus monogyna', // hawthorn — blossom + berries
  'Ginkgo biloba', // maidenhair tree — modern, autumn gold

  // --- climbers (17 → deepen) ---
  'Clematis tangutica', // golden clematis — yellow, autumn seedheads
  'Clematis alpina', // alpine clematis — spring
  'Lathyrus latifolius', // perennial sweet pea
  'Vitis coignetiae', // crimson glory vine — autumn foliage
  'Humulus lupulus', // golden hop — foliage climber
  'Rosa banksiae', // Lady Banks' rose — climbing rose

  // --- hardy succulents / alpines (succulent 3) ---
  'Delosperma cooperi', // hardy ice plant — magenta
  'Sempervivum arachnoideum', // cobweb houseleek
  'Phedimus spurius', // Caucasian stonecrop (Sedum spurium) — groundcover
]

// ---------------------------------------------------------------------------
// Name matching, resolution and the dedupe read all live in
// ./species-resolver.ts. This file used to carry its own copy of the synonym
// table, which is how twelve synonym groups were lost between rounds — see that
// file's header.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const DELAY_MS = 1600
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 3) => String(n).padStart(w, ' ')
const label = (e: number | string) => (typeof e === 'number' ? `id ${e}` : e)

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run')
  const catalog = await fetchCatalogIndex()
  console.log(
    `\nCatalog has ${catalog.names.size} species. ${CANDIDATES.length} candidates.` +
      (dryRun ? ' DRY RUN — no writes.\n' : '\n')
  )

  const seenIds = new Set<number>() // resolved this run, avoid intra-batch dupes
  const seeded: Array<{ entry: number | string; id: number; sci: string }> = []
  const skipped: Array<{ entry: number | string; reason: string }> = []
  const unresolved: Array<number | string> = []
  const failures: Array<{ entry: number | string; error: string }> = []

  for (const [i, cand] of CANDIDATES.entries()) {
    const prefix = `[${pad(i + 1)}/${pad(CANDIDATES.length)}]`

    // Cheap skip before spending Trefle calls: exact/synonym name already held.
    if (typeof cand === 'string') {
      if (catalog.holds(cand)) {
        skipped.push({ entry: cand, reason: 'name already in catalog' })
        console.log(`${prefix} skip  ${cand} — already in catalog`)
        continue
      }
    } else if (catalog.ids.has(cand)) {
      skipped.push({ entry: cand, reason: 'id already in catalog' })
      console.log(`${prefix} skip  id ${cand} — already in catalog`)
      continue
    }

    let r: Resolved | null
    try {
      r = await resolve(cand)
    } catch (err) {
      failures.push({ entry: cand, error: (err as Error).message })
      console.log(`${prefix} ERR   ${label(cand)}: ${(err as Error).message}`)
      await sleep(DELAY_MS)
      continue
    }

    if (!r) {
      unresolved.push(cand)
      console.log(`${prefix} miss  ${label(cand)} — no exact Trefle match`)
      await sleep(DELAY_MS)
      continue
    }

    const resolvedNorm = normSci(r.scientific_name).join(' ')
    if (catalog.ids.has(r.id) || catalog.names.has(resolvedNorm)) {
      skipped.push({
        entry: cand,
        reason: `resolved to catalog (${r.scientific_name})`,
      })
      console.log(
        `${prefix} skip  ${label(cand)} → ${r.scientific_name} already in catalog`
      )
      await sleep(DELAY_MS)
      continue
    }
    if (seenIds.has(r.id)) {
      skipped.push({
        entry: cand,
        reason: `duplicate of earlier candidate (${r.scientific_name})`,
      })
      console.log(
        `${prefix} skip  ${label(cand)} → ${r.scientific_name} already seeded this run`
      )
      await sleep(DELAY_MS)
      continue
    }
    seenIds.add(r.id)

    const drift =
      r.topName && normSci(r.topName).join(' ') !== resolvedNorm
        ? `  (guard skipped top hit ${r.topName}/${r.topId})`
        : ''

    if (dryRun) {
      seeded.push({ entry: cand, id: r.id, sci: r.scientific_name })
      console.log(
        `${prefix} OK    ${label(cand)} → id ${r.id} (${r.scientific_name})${drift}`
      )
      await sleep(DELAY_MS)
      continue
    }

    // Apply: seed by verified ID via the shared map/upsert path.
    try {
      const mapped = await fetchAndMapSpecies(r.id)
      const saved = await upsertPlant(mapped)
      seeded.push({ entry: cand, id: r.id, sci: r.scientific_name })
      console.log(
        `${prefix} ✓     "${saved.common_name}" (${r.scientific_name})${drift}`
      )
    } catch (err) {
      failures.push({ entry: cand, error: (err as Error).message })
      console.log(`${prefix} ✗     ${label(cand)}: ${(err as Error).message}`)
    }
    await sleep(DELAY_MS)
  }

  // --- summary ---
  console.log('\n─────────────────────────────────────────')
  console.log(
    `${dryRun ? 'Would seed' : 'Seeded'}: ${seeded.length}  ·  skipped: ${skipped.length}  ·  unresolved: ${unresolved.length}  ·  failed: ${failures.length}`
  )
  if (unresolved.length) {
    console.log(`\nUnresolved (no exact Trefle match — drop or seed by ID):`)
    for (const n of unresolved) console.log(`  • ${label(n)}`)
  }
  if (failures.length) {
    console.log(`\nFailed:`)
    for (const { entry, error } of failures)
      console.log(`  • ${label(entry)}: ${error}`)
  }
  if (!dryRun && failures.length) process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
