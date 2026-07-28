/**
 * One-off seed script — fetches plants from Trefle and writes them to
 * the Supabase plants table.
 *
 * Usage (from apps/web) — --round is REQUIRED, see the check in main():
 *   pnpm seed -- --round 9
 *
 * The npm script in package.json runs:
 *   tsx --env-file=.env.local scripts/seed-plants.ts
 *
 * You can seed by Trefle numeric ID or by scientific/common name:
 *   - IDs are fetched directly via the species detail endpoint.
 *   - Names are searched first; the top result's ID is used.
 *
 * Species already in the catalog are SKIPPED by default (matched on
 * scientific name or resolved Trefle ID), so routine runs only touch new
 * entries. Pass --include-existing to re-upsert known species; the upsert
 * is fill-only, so a re-run can fill gaps but never overwrites stored data.
 *
 * CAUTION: verify each new plant after seeding — Trefle name search can
 * silently resolve to a sibling species (diff requested vs stored
 * scientific_name; seed by numeric Trefle ID or add manually when it does).
 *
 * Edit SEED_LIST below with the plants you want to import.
 */

import { fetchAndMapSpecies, searchSpeciesByName } from '../lib/trefle'
import { upsertPlant } from '../lib/plants-db'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchCatalogIdentity } from './catalog-identity'
import { writeRoundManifest, type SeededPlant } from './round-manifest'

// ---------------------------------------------------------------------------
// Edit this list before running.
// Each entry is either a numeric Trefle ID or a scientific/common name.
// ---------------------------------------------------------------------------
const SEED_LIST: Array<number | string> = [
  // cottage
  'Rosa rugosa',
  'Digitalis purpurea',
  'Delphinium elatum',
  'Paeonia lactiflora',
  // mediterranean
  'Rosmarinus officinalis',
  'Cistus ladanifer',
  'Nerium oleander',
  'Santolina chamaecyparissus',
  // wildflower
  'Achillea millefolium',
  'Rudbeckia hirta',
  'Papaver rhoeas',
  'Centaurea cyanus',
  // modern / structural
  'Miscanthus sinensis',
  'Phormium tenax',
  'Agapanthus africanus',
  // lush
  'Hosta sieboldiana',
  'Astilbe chinensis',
  'Fatsia japonica',
  // classic
  'Buxus microphylla',
  'Taxus baccata',
  'Hedera helix',
  // fillers / common garden staples
  'Salvia officinalis',
  'Geranium sanguineum',
  'Sedum spectabile',
  'Viburnum tinus',
  // --- catalog expansion, July 2026 ---
  // cottage
  'Alcea rosea',
  'Aquilegia vulgaris',
  'Lupinus polyphyllus',
  'Campanula persicifolia',
  'Dianthus barbatus',
  'Phlox paniculata',
  'Clematis viticella',
  // mediterranean
  'Salvia nemorosa',
  'Perovskia atriplicifolia',
  'Echinops ritro',
  'Eryngium planum',
  'Thymus vulgaris',
  'Verbena bonariensis',
  'Oenothera lindheimeri',
  // wildflower
  'Knautia macedonica',
  'Leucanthemum vulgare',
  'Monarda didyma',
  'Scabiosa columbaria',
  'Coreopsis verticillata',
  'Rudbeckia fulgida',
  // modern / structural
  'Stipa tenuissima',
  'Festuca glauca',
  'Allium giganteum',
  'Kniphofia uvaria',
  'Euphorbia characias',
  'Verbascum olympicum',
  // lush / shade
  'Brunnera macrophylla',
  'Heuchera micrantha',
  'Dryopteris filix-mas',
  'Ligularia dentata',
  'Rodgersia podophylla',
  'Lamium maculatum',
  // classic
  'Syringa vulgaris',
  'Philadelphus coronarius',
  'Ilex aquifolium',
  'Lonicera periclymenum',
  'Hydrangea arborescens',
  'Rosa gallica',
  // season spread — bulbs, early spring, autumn, winter interest
  'Narcissus pseudonarcissus',
  'Tulipa gesneriana',
  'Crocus vernus',
  'Galanthus nivalis',
  'Helleborus niger',
  'Anemone hupehensis',
  'Tiarella cordifolia',
  'Aster amellus',
  'Hemerocallis fulva',
  // --- round 2: to 125, July 2026 ---
  // cottage fillers & front-of-border
  'Nepeta racemosa',
  'Alchemilla mollis',
  'Astrantia major',
  'Geum coccineum',
  'Penstemon barbatus',
  'Malva moschata',
  'Myosotis sylvatica',
  'Viola odorata',
  // mediterranean / dry & gravel
  'Helichrysum italicum',
  'Phlomis fruticosa',
  'Teucrium chamaedrys',
  'Sempervivum tectorum',
  'Sedum acre',
  'Armeria maritima',
  'Iris germanica',
  'Artemisia absinthium',
  // wildflower / meadow
  'Echium vulgare',
  'Silene dioica',
  'Primula veris',
  'Origanum vulgare',
  // grasses
  'Pennisetum alopecuroides',
  'Briza media',
  'Deschampsia cespitosa',
  'Molinia caerulea',
  // shade & ground cover
  'Polystichum setiferum',
  'Epimedium grandiflorum',
  'Pulmonaria officinalis',
  'Convallaria majalis',
  'Ajuga reptans',
  'Vinca minor',
  'Anemone nemorosa',
  'Aconitum napellus',
  // flowering shrubs
  'Lavandula stoechas',
  'Spiraea japonica',
  'Weigela florida',
  'Forsythia suspensa',
  'Ribes sanguineum',
  'Cornus alba',
  'Sambucus nigra',
  'Cotinus coggygria',
  // climbers
  'Jasminum officinale',
  'Wisteria sinensis',
  'Passiflora caerulea',
  'Hydrangea anomala',
  // bulbs & seasonal color
  'Hyacinthus orientalis',
  'Muscari armeniacum',
  'Cyclamen hederifolium',
  'Dahlia pinnata',
  'Crocosmia aurea',
  // --- round 3: lush/modern balance + winter interest, July 2026 ---
  // NOTE: 4 entries below could not be seeded by name — Trefle name-search
  // returns a sibling species. They were instead inserted manually
  // (data_source='manual', source_species_id NULL) and AI-curated, so they
  // ARE in the catalog. Keep them commented out here so a future seed run
  // doesn't re-import the wrong sibling. To Trefle-back them later, seed by
  // numeric species ID, not name.
  // lush / shade / foliage
  'Hakonechloa macra',
  'Athyrium niponicum',
  // 'Matteuccia struthiopteris', // name search resolved to Onoclea orientalis (wrong fern) — needs Trefle ID
  'Aruncus dioicus',
  'Persicaria amplexicaulis', // stored under accepted synonym Bistorta amplexicaulis — correct plant
  // 'Bergenia cordifolia', // no Trefle match at all — seed by ID or enter manually
  // modern / structural
  'Echinacea purpurea',
  'Panicum virgatum',
  // 'Calamagrostis acutiflora', // name search resolved to C. caucasica (wrong grass) — needs Trefle ID
  'Baptisia australis',
  'Liatris spicata',
  'Yucca filamentosa',
  // mediterranean / dry
  'Lavandula angustifolia', // NOTE: duplicate of round-1 'Lavender' — already in catalog
  'Euphorbia myrsinites',
  'Eschscholzia californica',
  // winter & early-season interest
  'Helleborus orientalis',
  'Hamamelis mollis',
  'Jasminum nudiflorum',
  'Sarcococca confusa',
  'Mahonia aquifolium', // stored under accepted synonym Berberis aquifolium — correct plant
  'Cornus mas',
  'Eranthis hyemalis',
  'Iris reticulata',
  // 'Erica carnea', // name search resolved to E. erigena (wrong heath) — needs Trefle ID
  'Camellia japonica',
  // autumn interest
  'Symphyotrichum novae-angliae',
  'Colchicum autumnale',
  'Ceratostigma plumbaginoides',
  // --- round 4: to ~200, July 2026 ---
  // Gap-targeted: winter/late-autumn bloom (Oct–Feb hole), plus the thin
  // modern / lush / mediterranean style tags and the shade-thrives deficit.
  // CAUTION: cultivar/hybrid entries below (× media, × bodnantense, ×
  // hybridus, × purpureus, × burkwoodii, × fraseri) do not resolve cleanly
  // in Trefle name search — verify each against the requested vs stored
  // scientific_name after seeding, and re-seed by numeric Trefle ID if it
  // drifts to a sibling or parent species.
  // winter & late-autumn interest
  151168, // Mahonia × media unavailable in Trefle → Berberis japonica (Mahonia japonica), stored under accepted synonym
  'Chimonanthus praecox',
  'Daphne bholua',
  351791, // Viburnum × bodnantense unavailable → Viburnum farreri (a parent, same winter bloom)
  'Skimmia japonica',
  'Cornus sericea',
  'Hesperantha coccinea',
  'Cyclamen coum',
  // Helleborus × hybridus dropped — redundant with existing Helleborus orientalis
  'Edgeworthia chrysantha',
  'Nandina domestica',
  'Liriope muscari',
  'Tricyrtis hirta',
  183032, // Erysimum 'Bowles's Mauve' is a sterile cultivar → Erysimum linifolium (the species behind it)
  // lush / shade
  'Polygonatum hybridum',
  'Lamprocapnos spectabilis',
  'Kirengeshoma palmata',
  'Actaea simplex',
  'Darmera peltata',
  'Asarum europaeum',
  'Adiantum pedatum',
  'Podophyllum hexandrum',
  'Melianthus major',
  'Ophiopogon planiscapus',
  // modern / structural
  'Stipa gigantea',
  'Anemanthele lessoniana',
  'Sesleria autumnalis',
  'Sanguisorba officinalis',
  'Astelia chathamica',
  'Euphorbia amygdaloides',
  'Allium hollandicum',
  'Verbena hastata',
  // mediterranean / dry
  'Stachys byzantina',
  'Ballota pseudodictamnus',
  'Convolvulus cneorum',
  'Phlomis russeliana',
  'Teucrium fruticans',
  'Tulbaghia violacea',
  'Cistus purpureus',
  'Salvia guaranitica',
  // climbers
  'Trachelospermum jasminoides',
  'Clematis armandii',
  'Clematis montana',
  'Campsis radicans',
  'Parthenocissus tricuspidata',
  'Akebia quinata',
  // structural evergreen shrubs
  'Pittosporum tenuifolium',
  'Choisya ternata',
  217374, // Osmanthus × burkwoodii unavailable → Osmanthus delavayi (a parent, spring-fragrant evergreen)
  'Photinia fraseri',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Trefle rate limit is 120 req/min. Each species needs 2 calls (search +
// detail), so 1 500ms pause between species keeps us well under the limit.
const INTER_SPECIES_DELAY_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Species already in the catalog are skipped by default so a routine run
// only touches new entries — no wasted Trefle calls, no rate-limit failures
// on long lists. Pass --include-existing to re-upsert known species (the
// upsert is fill-only, so re-runs can fill gaps but never overwrite).
interface ExistingCatalog {
  ids: Set<number>
  names: Set<string>
}

async function fetchExistingCatalog(): Promise<ExistingCatalog> {
  const rows = await fetchCatalogIdentity()

  const ids = new Set<number>()
  const names = new Set<string>()
  for (const row of rows) {
    if (row.source_species_id !== null) ids.add(row.source_species_id)
    if (row.scientific_name) names.add(row.scientific_name.toLowerCase())
  }
  return { ids, names }
}

async function resolveId(entry: number | string): Promise<number> {
  if (typeof entry === 'number') return entry
  const results = await searchSpeciesByName(entry)
  if (!results.length) {
    throw new Error(`No Trefle results found for name: "${entry}"`)
  }
  const match = results[0]
  if (!match) {
    throw new Error(`No Trefle results found for name: "${entry}"`)
  }
  console.log(
    `  Resolved "${entry}" → source_species_id ${match.id} (${match.common_name})`
  )
  return match.id
}

function pad(n: number, width = 3): string {
  return String(n).padStart(width, ' ')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!SEED_LIST.length) {
    console.warn('SEED_LIST is empty — add entries to scripts/seed-plants.ts')
    process.exit(0)
  }

  const args = process.argv.slice(2)
  const includeExisting = args.includes('--include-existing')
  const roundIdx = args.indexOf('--round')
  const roundLabel = roundIdx >= 0 ? args[roundIdx + 1] : undefined

  // --round is REQUIRED, and it is required here rather than politely defaulted
  // because the manifest it writes is what every later guard scopes by. Seeding
  // without one silently disarms both cross-check scopes, round-status,
  // check-round-scope, archive-round, log-db-session AND the pre-commit hook at
  // the same moment — and the hook cannot even notice, because it only fires on
  // a rounds/<label>/ directory that was never created. One forgotten flag used
  // to turn every guard in the pipeline off at once, with no output saying so.
  if (!roundLabel || roundLabel.startsWith('--')) {
    console.error(
      '\nScope required: pass --round <label> (e.g. --round 9).\n\n' +
        'The seed run records what it inserted in rounds/<label>/manifest.json,\n' +
        'and every downstream guard scopes by that file. Without it the round is\n' +
        'unverifiable: nothing downstream can tell which plants were yours.\n'
    )
    process.exit(1)
  }

  const startedAt = new Date().toISOString()
  const seeded: SeededPlant[] = []

  const existing = includeExisting
    ? { ids: new Set<number>(), names: new Set<string>() }
    : await fetchExistingCatalog()

  if (!includeExisting) {
    console.log(
      `\nCatalog has ${existing.names.size} species — already-seeded entries will be skipped (--include-existing to override).`
    )
  }

  console.log(`\nSeeding ${SEED_LIST.length} plant(s) from Trefle...\n`)

  const failures: Array<{ entry: number | string; error: string }> = []
  let succeeded = 0
  let skipped = 0

  for (const [i, entry] of SEED_LIST.entries()) {
    const prefix = `[${pad(i + 1)}/${pad(SEED_LIST.length)}]`

    // Skip known species before spending any Trefle calls
    if (
      (typeof entry === 'number' && existing.ids.has(entry)) ||
      (typeof entry === 'string' && existing.names.has(entry.toLowerCase()))
    ) {
      console.log(`${prefix} — already in catalog, skipped: ${entry}`)
      skipped++
      continue
    }

    try {
      console.log(`${prefix} Processing: ${entry}`)
      const perenualId = await resolveId(entry)

      // A name entry can resolve to a species we already hold under a
      // synonym (e.g. Persicaria → Bistorta) — catch that after resolution.
      if (existing.ids.has(perenualId)) {
        console.log(
          `${prefix} — resolved to source_species_id ${perenualId}, already in catalog, skipped`
        )
        skipped++
        await sleep(INTER_SPECIES_DELAY_MS)
        continue
      }

      const mapped = await fetchAndMapSpecies(perenualId)
      const saved = await upsertPlant(mapped)
      console.log(
        `${prefix} ✓ Upserted "${saved.common_name}" (id=${saved.id})`
      )
      seeded.push({
        id: saved.id,
        source_species_id: saved.source_species_id,
        common_name: saved.common_name,
      })
      succeeded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`${prefix} ✗ Failed: ${message}`)
      failures.push({ entry, error: message })
    }

    if (i < SEED_LIST.length - 1) await sleep(INTER_SPECIES_DELAY_MS)
  }

  // Summary
  console.log('\n─────────────────────────────────────────')
  console.log(
    `Seeding complete: ${succeeded} succeeded, ${skipped} skipped (already in catalog), ${failures.length} failed`
  )

  // Round manifest — the explicit record of what this run seeded, so the
  // rest of the pipeline (and future us) never has to infer the batch.
  if (seeded.length) {
    const path = writeRoundManifest({ label: roundLabel, startedAt, seeded })
    console.log(`\nWrote round manifest: ${path}`)
  } else {
    console.log('\nNothing seeded — no manifest written.')
  }

  if (failures.length) {
    console.log('\nFailed entries:')
    for (const { entry, error } of failures) {
      console.log(`  • ${entry}: ${error}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
