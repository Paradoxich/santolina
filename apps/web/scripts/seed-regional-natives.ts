/**
 * Regional-natives seed — garden-worthy ornamentals native to Croatia, the
 * Balkans, and the wider Mediterranean basin, tagged with `native_region`.
 *
 * Why a dedicated script rather than editing seed-plants.ts:
 *   1. Each entry carries structured native_region tags (mediterranean /
 *      balkans / croatia), which the generic seed path knows nothing about.
 *   2. It resolves every name to a Trefle ID by EXACT scientific-name match
 *      (genus + species, synonym-aware) instead of blindly taking the top
 *      search hit — the sibling-drift guard the plant-round notes call for.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-regional-natives.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-regional-natives.ts
 *
 * --dry-run resolves + dedupes and prints the plan without any DB writes or
 * Trefle detail calls. The default (apply) seeds each resolved species via the
 * same fetchAndMapSpecies/upsertPlant path as seed-plants.ts, then sets
 * native_region on the new row. Species already in the catalog (by resolved
 * Trefle ID or by scientific name, synonyms included) are skipped.
 *
 * native_to is left null on seed — curate-plants.ts --new-only writes the
 * modern-geography phrase, same as every other seed.
 */

import { fetchAndMapSpecies } from '../lib/trefle'
import { upsertPlant } from '../lib/plants-db'
import {
  fetchCatalogIndex,
  normSci,
  resolve,
  type Resolved,
} from './species-resolver'
import { getSupabaseAdmin } from '../lib/supabase-admin'

type Region = 'mediterranean' | 'balkans' | 'croatia'
const M: Region = 'mediterranean'
const B: Region = 'balkans'
const C: Region = 'croatia'

interface Candidate {
  name: string
  regions: Region[]
}

// ---------------------------------------------------------------------------
// The list. Regions are assigned per species from its true native range:
//   mediterranean = native to the Mediterranean basin (maquis/garrigue/coast)
//   balkans       = native to the Balkan Peninsula
//   croatia       = occurs natively in Croatia
// A species carries every tag that genuinely applies. The continent-level
// accuracy is later checked by cross-check-native-to.ts; finer accuracy is
// the editorial pass + in-app user flagging (per the native_to QA cadence).
// ---------------------------------------------------------------------------
const CANDIDATES: Candidate[] = [
  // --- bulbs & geophytes (the Balkans/Med are a global hotspot) ---
  { name: 'Crocus tommasinianus', regions: [M, B, C] }, // Dalmatian crocus
  { name: 'Crocus chrysanthus', regions: [M, B] },
  { name: 'Fritillaria meleagris', regions: [B, C] },
  { name: 'Muscari botryoides', regions: [M, B, C] },
  { name: 'Muscari neglectum', regions: [M, B, C] },
  { name: 'Anemone blanda', regions: [M, B] },
  { name: 'Cyclamen purpurascens', regions: [B, C] },
  { name: 'Sternbergia lutea', regions: [M, B, C] },
  { name: 'Iris pallida', regions: [M, B, C] }, // Dalmatian iris
  { name: 'Leucojum aestivum', regions: [M, B, C] },
  { name: 'Scilla bifolia', regions: [M, B, C] },
  { name: 'Galanthus elwesii', regions: [M, B] },
  { name: 'Nectaroscordum siculum', regions: [M, B, C] },
  { name: 'Ornithogalum umbellatum', regions: [M, B, C] },
  { name: 'Tulipa sylvestris', regions: [M, B, C] },
  { name: 'Allium sphaerocephalon', regions: [M, B, C] },
  { name: 'Gladiolus italicus', regions: [M, B, C] },
  { name: 'Asphodeline lutea', regions: [M, B, C] },
  { name: 'Asphodelus albus', regions: [M, B, C] },

  // --- herbaceous perennials ---
  { name: 'Geranium macrorrhizum', regions: [M, B, C] }, // bigroot geranium
  { name: 'Helleborus multifidus', regions: [M, B, C] }, // W-Balkan hellebore
  { name: 'Helleborus odorus', regions: [B, C] },
  { name: 'Dictamnus albus', regions: [M, B, C] },
  { name: 'Paeonia mascula', regions: [M, B, C] },
  { name: 'Acanthus spinosus', regions: [M, B, C] },
  { name: 'Acanthus mollis', regions: [M] },
  { name: 'Silene coronaria', regions: [M, B, C] }, // rose campion (syn. Lychnis)
  { name: 'Salvia sclarea', regions: [M, B, C] },
  { name: 'Salvia pratensis', regions: [M, B, C] },
  { name: 'Salvia verticillata', regions: [B, C] },
  { name: 'Digitalis ferruginea', regions: [M, B, C] },
  { name: 'Digitalis lanata', regions: [M, B] },
  { name: 'Digitalis grandiflora', regions: [B, C] },
  { name: 'Campanula portenschlagiana', regions: [M, B, C] }, // Dalmatian bellflower
  { name: 'Campanula poscharskyana', regions: [M, B, C] }, // Serbian bellflower
  { name: 'Campanula glomerata', regions: [B, C] },
  { name: 'Campanula garganica', regions: [M, B] },
  { name: 'Aubrieta deltoidea', regions: [M, B] },
  { name: 'Aurinia saxatilis', regions: [M, B, C] }, // gold dust
  { name: 'Iberis sempervirens', regions: [M, B] },
  { name: 'Cephalaria leucantha', regions: [M, B, C] },
  { name: 'Eryngium amethystinum', regions: [M, B, C] }, // amethyst sea holly
  { name: 'Centaurea montana', regions: [B, C] },
  { name: 'Inula ensifolia', regions: [M, B, C] },
  { name: 'Telekia speciosa', regions: [B, C] },
  { name: 'Doronicum orientale', regions: [M, B, C] },
  { name: 'Anthemis tinctoria', regions: [M, B, C] }, // golden marguerite
  { name: 'Ruta graveolens', regions: [M, B, C] },
  { name: 'Satureja montana', regions: [M, B, C] }, // winter savory
  { name: 'Hyssopus officinalis', regions: [M, B] },
  { name: 'Melissa officinalis', regions: [M, B, C] },
  { name: 'Stachys officinalis', regions: [M, B, C] }, // betony
  { name: 'Nepeta nuda', regions: [M, B, C] },
  { name: 'Linum perenne', regions: [M, B, C] },
  { name: 'Linum narbonense', regions: [M] },
  { name: 'Dianthus carthusianorum', regions: [M, B, C] },
  { name: 'Dianthus deltoides', regions: [B, C] },
  { name: 'Dianthus cruentus', regions: [B, M] }, // blood pink
  { name: 'Anthericum liliago', regions: [M, B, C] },
  { name: 'Verbascum phoeniceum', regions: [M, B, C] },
  { name: 'Verbascum nigrum', regions: [B, C] },
  { name: 'Euphorbia rigida', regions: [M, B, C] },
  { name: 'Sedum album', regions: [M, B, C] },
  { name: 'Sedum rupestre', regions: [M, B, C] },
  { name: 'Hylotelephium telephium', regions: [B, C] }, // orpine (syn. Sedum)
  { name: 'Omphalodes verna', regions: [B, C] }, // blue-eyed Mary
  { name: 'Hepatica nobilis', regions: [B, C] },
  { name: 'Primula vulgaris', regions: [M, B, C] },
  { name: 'Gentiana lutea', regions: [B, C] },
  { name: 'Pulsatilla montana', regions: [B, C] },
  { name: 'Aquilegia nigricans', regions: [B, C] },
  { name: 'Achillea clypeolata', regions: [B] },

  // --- ornamental grasses ---
  { name: 'Stipa pennata', regions: [M, B, C] }, // feather grass
  { name: 'Sesleria caerulea', regions: [B, C] }, // blue moor grass
  { name: 'Melica ciliata', regions: [M, B, C] },
  { name: 'Koeleria glauca', regions: [B, C] },

  // --- shrubs & small trees (Adriatic maquis + Dinaric) ---
  { name: 'Arbutus unedo', regions: [M, B, C] }, // strawberry tree
  { name: 'Laurus nobilis', regions: [M, B, C] }, // bay laurel
  { name: 'Myrtus communis', regions: [M, B, C] }, // myrtle
  { name: 'Pistacia lentiscus', regions: [M, B, C] }, // mastic
  { name: 'Pistacia terebinthus', regions: [M, B, C] },
  { name: 'Phillyrea latifolia', regions: [M, B, C] },
  { name: 'Rhamnus alaternus', regions: [M, B, C] }, // Italian buckthorn
  { name: 'Viburnum opulus', regions: [B, C] }, // guelder rose
  { name: 'Viburnum lantana', regions: [M, B, C] },
  { name: 'Cistus creticus', regions: [M, B, C] },
  { name: 'Cistus salviifolius', regions: [M, B, C] },
  { name: 'Cistus monspeliensis', regions: [M, B, C] },
  { name: 'Spartium junceum', regions: [M, B, C] }, // Spanish broom
  { name: 'Genista lydia', regions: [B, M] },
  { name: 'Colutea arborescens', regions: [M, B, C] }, // bladder senna
  { name: 'Hippocrepis emerus', regions: [M, B, C] }, // scorpion senna
  { name: 'Olea europaea', regions: [M, B, C] }, // olive
  { name: 'Vitex agnus-castus', regions: [M, B, C] }, // chaste tree
  { name: 'Cercis siliquastrum', regions: [M, B, C] }, // Judas tree
  { name: 'Fraxinus ornus', regions: [M, B, C] }, // manna ash
  { name: 'Ostrya carpinifolia', regions: [M, B, C] }, // hop hornbeam
  { name: 'Celtis australis', regions: [M, B, C] }, // southern hackberry
  { name: 'Juniperus oxycedrus', regions: [M, B, C] },
  { name: 'Juniperus communis', regions: [B, C] },
  { name: 'Pinus nigra', regions: [M, B, C] }, // Austrian/black pine
  { name: 'Pinus mugo', regions: [B, C] }, // mountain pine
  { name: 'Pinus halepensis', regions: [M, B, C] }, // Aleppo pine
  { name: 'Erica arborea', regions: [M, B, C] }, // tree heath
  { name: 'Prunus laurocerasus', regions: [B, M] }, // cherry laurel
  { name: 'Prunus mahaleb', regions: [M, B, C] },
  { name: 'Cornus sanguinea', regions: [B, C] }, // common dogwood
  { name: 'Daphne mezereum', regions: [B, C] },
  { name: 'Daphne cneorum', regions: [B, C] }, // garland flower
  { name: 'Daphne blagayana', regions: [B, C] }, // Balkan endemic
  { name: 'Daphne laureola', regions: [M, B, C] },
  { name: 'Jasminum fruticans', regions: [M, B, C] },
  { name: 'Lonicera implexa', regions: [M, B, C] },
  { name: 'Lonicera etrusca', regions: [M, B, C] },
  { name: 'Clematis flammula', regions: [M, B, C] },
  { name: 'Amelanchier ovalis', regions: [B, C] }, // snowy mespilus
  { name: 'Sorbus aria', regions: [B, C] }, // whitebeam
  { name: 'Sorbus domestica', regions: [M, B, C] }, // service tree
  { name: 'Rosa sempervirens', regions: [M, B, C] },
  { name: 'Rosa glauca', regions: [B, C] },

  // --- ferns & shade ---
  { name: 'Asplenium scolopendrium', regions: [M, B, C] }, // hart's tongue
  { name: 'Polypodium vulgare', regions: [B, C] },
  { name: 'Polystichum aculeatum', regions: [B, C] },
]

// ---------------------------------------------------------------------------
// Scientific-name matching (synonym-aware exact match)
// ---------------------------------------------------------------------------

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

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run')
  const catalog = await fetchCatalogIndex()
  console.log(
    `\nCatalog has ${catalog.names.size} species. ${CANDIDATES.length} candidates.` +
      (dryRun ? ' DRY RUN — no writes.\n' : '\n')
  )

  const seenIds = new Set<number>() // resolved this run, to avoid intra-batch dupes
  const seeded: Array<{
    name: string
    id: number
    sci: string
    regions: Region[]
  }> = []
  const skipped: Array<{ name: string; reason: string }> = []
  const unresolved: string[] = []
  const failures: Array<{ name: string; error: string }> = []

  for (const [i, cand] of CANDIDATES.entries()) {
    const prefix = `[${pad(i + 1)}/${pad(CANDIDATES.length)}]`

    // Cheap skip before spending Trefle calls: exact/synonym name already held.
    if (catalog.holds(cand.name)) {
      skipped.push({ name: cand.name, reason: 'name already in catalog' })
      console.log(`${prefix} skip  ${cand.name} — already in catalog`)
      continue
    }

    let r: Resolved | null
    try {
      r = await resolve(cand.name)
    } catch (err) {
      failures.push({ name: cand.name, error: (err as Error).message })
      console.log(`${prefix} ERR   ${cand.name}: ${(err as Error).message}`)
      await sleep(DELAY_MS)
      continue
    }

    if (!r) {
      unresolved.push(cand.name)
      console.log(`${prefix} miss  ${cand.name} — no exact Trefle match`)
      await sleep(DELAY_MS)
      continue
    }

    const resolvedNorm = normSci(r.scientific_name).join(' ')
    if (catalog.ids.has(r.id) || catalog.names.has(resolvedNorm)) {
      skipped.push({
        name: cand.name,
        reason: `resolved to catalog (${r.scientific_name})`,
      })
      console.log(
        `${prefix} skip  ${cand.name} → ${r.scientific_name} already in catalog`
      )
      await sleep(DELAY_MS)
      continue
    }
    if (seenIds.has(r.id)) {
      skipped.push({
        name: cand.name,
        reason: `duplicate of earlier candidate (${r.scientific_name})`,
      })
      console.log(
        `${prefix} skip  ${cand.name} → ${r.scientific_name} already seeded this run`
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
      seeded.push({
        name: cand.name,
        id: r.id,
        sci: r.scientific_name,
        regions: cand.regions,
      })
      console.log(
        `${prefix} OK    ${cand.name} → id ${r.id} (${r.scientific_name}) [${cand.regions.join(',')}]${drift}`
      )
      await sleep(DELAY_MS)
      continue
    }

    // Apply: seed by verified ID, then set native_region on the new row.
    try {
      const mapped = await fetchAndMapSpecies(r.id)
      const saved = await upsertPlant(mapped)
      const db = getSupabaseAdmin()
      const { error: regErr } = await db
        .from('plants')
        .update({ native_region: cand.regions })
        .eq('id', saved.id)
      if (regErr)
        throw new Error(`native_region update failed: ${regErr.message}`)

      seeded.push({
        name: cand.name,
        id: r.id,
        sci: r.scientific_name,
        regions: cand.regions,
      })
      console.log(
        `${prefix} ✓     "${saved.common_name}" (${r.scientific_name}) [${cand.regions.join(',')}]${drift}`
      )
    } catch (err) {
      failures.push({ name: cand.name, error: (err as Error).message })
      console.log(`${prefix} ✗     ${cand.name}: ${(err as Error).message}`)
    }
    await sleep(DELAY_MS)
  }

  // --- summary ---
  console.log('\n─────────────────────────────────────────')
  console.log(
    `${dryRun ? 'Would seed' : 'Seeded'}: ${seeded.length}  ·  skipped: ${skipped.length}  ·  unresolved: ${unresolved.length}  ·  failed: ${failures.length}`
  )
  if (unresolved.length) {
    console.log(
      `\nUnresolved (no exact Trefle match — drop or enter manually):`
    )
    for (const n of unresolved) console.log(`  • ${n}`)
  }
  if (failures.length) {
    console.log(`\nFailed:`)
    for (const { name, error } of failures) console.log(`  • ${name}: ${error}`)
  }
  const byRegion = (reg: Region) =>
    seeded.filter((s) => s.regions.includes(reg)).length
  console.log(
    `\nRegion tags among ${dryRun ? 'would-seed' : 'seeded'}: mediterranean=${byRegion(M)} balkans=${byRegion(B)} croatia=${byRegion(C)}`
  )
  if (!dryRun && failures.length) process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
