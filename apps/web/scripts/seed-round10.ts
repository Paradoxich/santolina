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

import { searchSpeciesByName, fetchAndMapSpecies } from '../lib/trefle'
import { upsertPlant } from '../lib/plants-db'
import { fetchCatalogIdentity } from './catalog-identity'
import { writeRoundManifest, type SeededPlant } from './round-manifest'

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

// Scientific-name matching (synonym-aware exact match) — mirrors
// seed-round7.ts / seed-round8.ts / seed-round9.ts. Matching requires the
// species epithet to be identical AND the genus equal or a known synonym, so
// an entry never binds to an unrelated species that merely shares an epithet.
//
// Carried forward from round 9 (harmless if unused this round) plus nothing
// new — this round's list did not surface a fresh synonym trap during
// resolution, but the guard costs nothing to keep.
// ---------------------------------------------------------------------------
const SYNONYM_GENERA: string[][] = [
  ['aster', 'symphyotrichum', 'eurybia'],
  ['erysimum', 'cheiranthus'],
  ['leucojum', 'acis'],
  ['schizostylis', 'hesperantha'],
  ['chrysanthemum', 'dendranthema'],
  ['cimicifuga', 'actaea'],
  ['chionodoxa', 'scilla', 'othocallis'],
  ['abelia', 'linnaea'],
  ['sempervivum', 'jovibarba'],
  ['cornus', 'swida'],
  ['chasmanthium', 'uniola'],
  ['anemone', 'anemonoides', 'eriocapitella'],
  ['blechnum', 'struthiopteris'],
  ['scilla', 'othocallis'],
  ['ipheion', 'tristagma'],
  ['lamium', 'lamiastrum'],
  ['sedum', 'petrosedum', 'hylotelephium', 'phedimus'],
  ['aloe', 'aloiampelos'],
  ['berberis', 'mahonia'],
  ['maianthemum', 'smilacina'],
  ['polygonatum', 'disporum'],
  ['alkekengi', 'physalis'],
  ['calibrachoa', 'petunia'], // Calibrachoa was long sunk into Petunia
]

function genusSynonyms(genus: string): Set<string> {
  const set = new Set<string>([genus])
  for (const group of SYNONYM_GENERA) {
    if (group.includes(genus)) for (const g of group) set.add(g)
  }
  return set
}

// → [genus, species] lowercased, hybrid marker and author stripped.
function normSci(s: string): [string, string] {
  const parts = s
    .toLowerCase()
    .replace(/×/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  return [parts[0] ?? '', parts[1] ?? '']
}

function sciMatches(target: string, candidate: string): boolean {
  const [tg, ts] = normSci(target)
  const [cg, cs] = normSci(candidate)
  if (!ts || ts !== cs) return false
  return genusSynonyms(tg).has(cg)
}

// ---------------------------------------------------------------------------
// Resolve a name to a verified Trefle id (exact match, no sibling drift).
// Numeric entries are taken as verified Trefle ids directly.
// ---------------------------------------------------------------------------
interface Resolved {
  id: number
  scientific_name: string
  topName: string | null // top search hit, for drift logging
  topId: number | null
}

async function resolve(entry: number | string): Promise<Resolved | null> {
  if (typeof entry === 'number') {
    return {
      id: entry,
      scientific_name: `id:${entry}`,
      topName: null,
      topId: null,
    }
  }
  let top: { scientific_name: string; id: number } | null = null
  for (let page = 1; page <= 2; page++) {
    const results = await searchSpeciesByName(entry, page)
    if (!results.length) break
    if (page === 1 && results[0]) {
      top = { scientific_name: results[0].scientific_name, id: results[0].id }
    }
    const exact = results.find((r) => sciMatches(entry, r.scientific_name))
    if (exact) {
      return {
        id: exact.id,
        scientific_name: exact.scientific_name,
        topName: top?.scientific_name ?? null,
        topId: top?.id ?? null,
      }
    }
    if (results.length < 20) break // no more pages
  }
  return null
}

// ---------------------------------------------------------------------------
// Existing catalog (dedupe). Paginated — a bare .select() caps at 1000 rows.
// ---------------------------------------------------------------------------
interface Catalog {
  ids: Set<number>
  names: Set<string> // normalised "genus species"
}

async function fetchCatalog(): Promise<Catalog> {
  const rows = await fetchCatalogIdentity()

  const ids = new Set<number>()
  const names = new Set<string>()
  for (const row of rows) {
    if (row.source_species_id !== null) ids.add(row.source_species_id)
    if (row.scientific_name) names.add(normSci(row.scientific_name).join(' '))
  }
  return { ids, names }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const DELAY_MS = 1600
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 3) => String(n).padStart(w, ' ')
const label = (e: number | string) => (typeof e === 'number' ? `id ${e}` : e)

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run')
  const startedAt = new Date().toISOString()
  const catalog = await fetchCatalog()
  console.log(
    `\nCatalog has ${catalog.names.size} species. ${CANDIDATES.length} candidates.` +
      (dryRun ? ' DRY RUN — no writes.\n' : '\n')
  )

  const seenIds = new Set<number>() // resolved this run, avoid intra-batch dupes
  const seeded: Array<{ entry: number | string; id: number; sci: string }> = []
  const manifestRows: SeededPlant[] = []
  const skipped: Array<{ entry: number | string; reason: string }> = []
  const unresolved: Array<number | string> = []
  const failures: Array<{ entry: number | string; error: string }> = []

  for (const [i, cand] of CANDIDATES.entries()) {
    const prefix = `[${pad(i + 1)}/${pad(CANDIDATES.length)}]`

    // Cheap skip before spending Trefle calls: exact/synonym name already held.
    if (typeof cand === 'string') {
      const candNorm = normSci(cand).join(' ')
      if (catalog.names.has(candNorm)) {
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

    // Apply: seed by verified id via the shared map/upsert path.
    try {
      const mapped = await fetchAndMapSpecies(r.id)
      const saved = await upsertPlant(mapped)
      seeded.push({ entry: cand, id: r.id, sci: r.scientific_name })
      manifestRows.push({
        id: saved.id,
        source_species_id: saved.source_species_id,
        common_name: saved.common_name,
      })
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
    console.log(`\nUnresolved (no exact Trefle match — drop or seed by id):`)
    for (const n of unresolved) console.log(`  • ${label(n)}`)
  }
  if (failures.length) {
    console.log(`\nFailed:`)
    for (const { entry, error } of failures)
      console.log(`  • ${label(entry)}: ${error}`)
  }

  if (!dryRun && manifestRows.length) {
    const path = writeRoundManifest({
      label: ROUND_LABEL,
      startedAt,
      seeded: manifestRows,
    })
    console.log(`\nManifest: ${path}`)
  }
  if (!dryRun && failures.length) process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
