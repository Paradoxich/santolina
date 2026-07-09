/**
 * One-off seed script — fetches plants from Trefle and writes them to
 * the Supabase plants table.
 *
 * Usage (from apps/web):
 *   pnpm seed
 *
 * The npm script in package.json runs:
 *   node --env-file=.env.local --import tsx/esm scripts/seed-plants.ts
 *
 * You can seed by Trefle numeric ID or by scientific/common name:
 *   - IDs are fetched directly via the species detail endpoint.
 *   - Names are searched first; the top result's ID is used.
 *
 * Edit SEED_LIST below with the plants you want to import.
 */

import { fetchAndMapSpecies, searchSpeciesByName } from '../lib/trefle'
import { upsertPlant } from '../lib/plants-db'

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

  console.log(`\nSeeding ${SEED_LIST.length} plant(s) from Trefle...\n`)

  const failures: Array<{ entry: number | string; error: string }> = []
  let succeeded = 0

  for (const [i, entry] of SEED_LIST.entries()) {
    const prefix = `[${pad(i + 1)}/${pad(SEED_LIST.length)}]`

    try {
      console.log(`${prefix} Processing: ${entry}`)
      const perenualId = await resolveId(entry)
      const mapped = await fetchAndMapSpecies(perenualId)
      const saved = await upsertPlant(mapped)
      console.log(
        `${prefix} ✓ Upserted "${saved.common_name}" (id=${saved.id})`
      )
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
    `Seeding complete: ${succeeded} succeeded, ${failures.length} failed`
  )

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
