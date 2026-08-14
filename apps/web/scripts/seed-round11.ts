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
 * species gap left. This round exists because Ana asked for one end-to-end
 * exercise of the pipeline built over the past fortnight, and it is sized and
 * scoped accordingly.
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

import { searchSpeciesByName, fetchAndMapSpecies } from '../lib/trefle'
import { upsertPlant } from '../lib/plants-db'
import { fetchCatalogIdentity } from './catalog-identity'
import { writeRoundManifest, type SeededPlant } from './round-manifest'

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

// Scientific-name matching (synonym-aware exact match) — mirrors
// seed-round7.ts / seed-round8.ts / seed-round9.ts / seed-round10.ts. Matching
// requires the species epithet to be identical AND the genus equal or a known
// synonym, so an entry never binds to an unrelated species that merely shares
// an epithet.
//
// Round 10's table is carried forward verbatim (harmless where unused); the
// block at the end is this round's additions, every one of them a genus that
// actually moved for a species on the list above.
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
  ['calibrachoa', 'petunia'],

  // --- round 11 additions ---
  ['eupatorium', 'eutrochium', 'eupatoriadelphus'],
  ['calamintha', 'clinopodium', 'satureja'],
  ['persicaria', 'polygonum', 'bistorta', 'aconogonon'],
  ['stipa', 'achnatherum', 'anemanthele', 'nassella'],
  ['echinacea', 'rudbeckia', 'brauneria'],
  ['campsis', 'bignonia', 'tecoma'],
  ['trachelospermum', 'rhynchospermum'],
  ['parthenocissus', 'ampelopsis', 'psedera'],
  ['ipomoea', 'pharbitis'],
  ['vernonia', 'vernonanthura'],
  ['muehlenbeckia', 'calacinum'],
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
