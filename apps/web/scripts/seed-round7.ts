/**
 * Round-7 catalog expansion (July 2026) — the first kitchen-adjacent seed:
 * 88 aromatic-herb & decorative-edible candidates, ~76 net new after dedupe,
 * taking the catalog from 418 toward ~495.
 *
 * WHY this round exists: rounds 1-6 were ornamental-only. The catalog held a
 * handful of Mediterranean subshrubs that happen to be culinary (rosemary,
 * thyme, sage, oregano, lavender — all filed `shrub`, docs/architecture.md#plant-type-label),
 * but zero tender aromatics and zero fruiting edibles. This round fills the
 * "a beautiful garden with a couple of edible things" gap that CLAUDE.md's
 * ornamental-FIRST-not-ornamental-ONLY line explicitly invites.
 *
 * SCOPE — deliberately "herbs + DECORATIVE edibles", not a veg patch:
 *   - tender/annual culinary herbs (basil, mint, chives, parsley, dill…) plus
 *     perennial herbs with real ornamental standing (bee balm, clary sage…)
 *   - peppers, seeded as 5 distinct SPECIES (see the cultivar note below)
 *   - fruiting things with a genuine ornamental claim: alpine strawberry as
 *     edging, blueberry for autumn colour, fig / olive / pomegranate as
 *     Mediterranean specimens, currants for blossom, dwarf citrus (lemon,
 *     kumquat, calamondin) as fragrant evergreen container anchors
 *   - a small dual-use flower block (globe artichoke, sunflower, saffron
 *     crocus, marigolds, Chinese-lantern physalis)
 *   Pure salad/veg (tomato, cucumber, zucchini, lettuce, spinach) is HELD for
 *   a later "full small-garden edibles" round — a separate product call.
 *
 * PEPPERS — the catalog is keyed on Trefle *species* id, so two cultivars of
 * one species cannot be separate rows (the round-4 note's cultivar constraint).
 * Peppers are therefore seeded as five distinct species, each labelled by its
 * signature cultivar: annuum (jalapeño/bell/shishito), chinense (biquinho/
 * habanero), baccatum (ají), frutescens (tabasco/bird's-eye), pubescens
 * (rocoto). curate-plants fills the descriptive detail per species.
 *
 * WHY a dedicated script rather than appending to seed-plants.ts: identical to
 * round 6 — seed-plants.ts takes the top Trefle search hit, which drifts to
 * sibling species. This resolves every name to a Trefle id by EXACT
 * scientific-name match (genus + species, synonym-aware) and logs any skipped
 * top hit. It does NOT touch native_region — that is regenerated for the whole
 * catalog by regenerate-native-region.ts AFTER this seed + curate-plants
 * --new-only, per the region-data-model cadence.
 *
 * A number of entries are hybrids/cultivars that Trefle often can't resolve by
 * name (Mentha × piperita, Nepeta × faassenii, the calamondin Citrus
 * microcarpa). Those are listed by name anyway; unresolved ones print in the
 * summary for seeding by numeric Trefle id in a follow-up, exactly as round 6
 * handled its cultivars.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round7.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round7.ts
 *
 * --dry-run resolves + dedupes and prints the plan without any DB writes or
 * Trefle detail calls. The default (apply) seeds each resolved species via the
 * same fetchAndMapSpecies/upsertPlant path as seed-plants.ts. Species already
 * in the catalog (by resolved Trefle id or scientific name, synonyms included)
 * are skipped. native_to and every AI field are left null on seed —
 * curate-plants.ts --new-only fills them next.
 */

import { searchSpeciesByName, fetchAndMapSpecies } from '../lib/trefle'
import { upsertPlant } from '../lib/plants-db'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchCatalogIdentity } from './catalog-identity'

// ---------------------------------------------------------------------------
// The list. Grouped by the block each entry belongs to (comments not stored).
// ---------------------------------------------------------------------------
const CANDIDATES: Array<number | string> = [
  // --- tender & annual culinary herbs (the core gap) ---
  'Ocimum basilicum', // sweet basil
  'Ocimum tenuiflorum', // holy basil (tulsi)
  'Petroselinum crispum', // parsley
  'Coriandrum sativum', // cilantro / coriander
  'Anethum graveolens', // dill
  'Anthriscus cerefolium', // chervil
  'Perilla frutescens', // shiso
  'Pimpinella anisum', // anise
  'Carum carvi', // caraway
  'Satureja hortensis', // summer savory — annual

  // --- perennial culinary herbs with ornamental standing ---
  'Allium schoenoprasum', // chives — edible + purple pompom bloom
  'Allium tuberosum', // garlic chives — white autumn umbels
  'Artemisia dracunculus', // French tarragon
  'Origanum majorana', // sweet marjoram
  'Origanum onites', // pot marjoram
  'Origanum dictamnus', // dittany of Crete — silver, ornamental
  'Satureja montana', // winter savory — evergreen subshrub
  'Melissa officinalis', // lemon balm
  'Aloysia citrodora', // lemon verbena
  'Levisticum officinale', // lovage — architectural
  'Myrrhis odorata', // sweet cicely — fern-like, shade
  'Sanguisorba minor', // salad burnet
  'Rumex acetosa', // common sorrel
  'Rumex scutatus', // buckler-leaf sorrel
  'Nepeta cataria', // catnip
  349429, // catmint (Nepeta × faassenii) — Trefle files it "faasenii" (1 s); by verified id
  233826, // lesser calamint (Calamintha nepeta) — Trefle accepted name Clinopodium nepeta; by verified id
  'Hyssopus officinalis', // hyssop — blue spikes
  'Monarda didyma', // bee balm / bergamot — edible + ornamental
  'Agastache rugosa', // Korean mint
  'Thymus serpyllum', // creeping thyme
  'Thymus pulegioides', // broad-leaved thyme
  'Thymus herba-barona', // caraway thyme
  'Salvia elegans', // pineapple sage — red, late
  'Salvia sclarea', // clary sage — architectural biennial
  'Laurus nobilis', // bay laurel — evergreen culinary tree/shrub
  'Chamaemelum nobile', // Roman chamomile — lawn/edging
  'Matricaria chamomilla', // German chamomile — annual
  'Angelica archangelica', // angelica — architectural
  'Borago officinalis', // borage — edible blue flowers
  'Mentha spicata', // spearmint (note pot-culture invasiveness in care)
  'Mentha suaveolens', // apple mint
  'Mentha × piperita', // peppermint (hybrid, may not resolve)
  'Mentha pulegium', // pennyroyal — creeping
  'Stevia rebaudiana', // stevia
  'Foeniculum vulgare', // fennel — likely already (round 6); dedupe will skip

  // --- aromatic / ornamental "herb border" perennials ---
  'Artemisia abrotanum', // southernwood — feathery aromatic
  'Artemisia absinthium', // wormwood — silver, architectural
  'Ruta graveolens', // rue — blue-green, ornamental
  'Tanacetum balsamita', // costmary / alecost
  'Tanacetum parthenium', // feverfew — white daisies, self-sows
  'Tanacetum vulgare', // tansy — flat gold heads
  'Marrubium vulgare', // white horehound — woolly
  'Symphytum officinale', // comfrey — pollinators, chop-and-drop
  'Verbena officinalis', // vervain — airy
  'Valeriana officinalis', // valerian — tall, scented
  'Galium verum', // lady's bedstraw — frothy yellow
  'Filipendula ulmaria', // meadowsweet — cream plumes, moist

  // --- peppers: five distinct SPECIES (see header cultivar note) ---
  'Capsicum annuum', // jalapeño / bell / shishito
  'Capsicum chinense', // biquinho / habanero
  'Capsicum baccatum', // ají amarillo
  'Capsicum frutescens', // tabasco / bird's-eye
  'Capsicum pubescens', // rocoto — purple flowers, ornamental

  // --- decorative fruiting edibles & berries (ornamental claim) ---
  'Fragaria vesca', // alpine strawberry — edible edging
  'Vaccinium corymbosum', // highbush blueberry — autumn colour
  'Vaccinium myrtillus', // bilberry — compact, autumn
  'Rubus idaeus', // raspberry
  'Ribes rubrum', // redcurrant — translucent fruit
  'Ribes nigrum', // blackcurrant
  'Ribes uva-crispa', // gooseberry
  // Ficus carica (fig) intentionally dropped — Trefle's search can't reach the
  // Ficus genus with our key; seed by a verified numeric id in a follow-up.
  'Punica granatum', // pomegranate — scarlet flowers + fruit
  'Olea europaea', // olive — silver evergreen specimen
  'Cornus mas', // Cornelian cherry — early yellow bloom, edible
  'Sambucus nigra', // elder — cream umbels, dark berries

  // --- dwarf / container citrus (fragrant evergreen anchors) ---
  'Citrus limon', // lemon
  'Citrus japonica', // kumquat (Fortunella japonica)
  'Citrus reticulata', // mandarin
  // Citrus microcarpa (calamondin) dropped — hybrid absent from Trefle; kumquat
  // + lemon + mandarin carry the dwarf-citrus block.

  // --- dual-use flowers & architectural edibles ---
  // Globe artichoke (Cynara scolymus) omitted — Trefle treats it as C.
  // cardunculus var. scolymus, and cardoon (C. cardunculus) is already in the
  // catalog from round 6, so it would collide on species id.
  'Helianthus annuus', // sunflower — edible seed, cutting
  'Helianthus tuberosus', // Jerusalem artichoke — tall screen + tuber
  'Physalis peruviana', // cape gooseberry — lantern fruit
  267450, // Chinese lantern (Physalis alkekengi) — Trefle accepted name Alkekengi officinarum; by verified id
  'Crocus sativus', // saffron crocus — autumn bulb, culinary
  20106, // marigold (Tagetes erecta) — Trefle folds French T. patula into erecta; by verified id
  'Tagetes tenuifolia', // signet marigold — citrus-scented edible flowers
  'Viola tricolor', // heartsease — edible flowers
  'Cichorium intybus', // chicory — sky-blue flowers, edible
  'Portulaca oleracea', // purslane — edible succulent groundcover
  'Salvia viridis', // annual clary — coloured bracts
]

// ---------------------------------------------------------------------------
// Scientific-name matching (synonym-aware exact match) — mirrors
// seed-round6.ts / seed-regional-natives.ts. Matching requires the species
// epithet to be identical AND the genus equal or a known synonym, so an entry
// never binds to an unrelated species that merely shares an epithet
// (e.g. "officinalis").
// ---------------------------------------------------------------------------
const SYNONYM_GENERA: string[][] = [
  ['citrus', 'fortunella'], // kumquat Fortunella japonica → Citrus japonica
  ['physalis', 'alkekengi'], // guard only; harmless if unused
  ['matricaria', 'chamomilla'], // Matricaria recutita ↔ chamomilla epithet
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
// Existing catalog (dedupe)
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
  const catalog = await fetchCatalog()
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
  if (!dryRun && failures.length) process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
