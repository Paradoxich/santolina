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

import { seedRound } from './seed-runner'

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
// Name matching, resolution and the dedupe read all live in
// ./species-resolver.ts. This file used to carry its own copy of the synonym
// table, which is how twelve synonym groups were lost between rounds — see that
// file's header.
// ---------------------------------------------------------------------------

// Rounds 6-7 predate manifests, so no label: seedRound writes none.
seedRound({ candidates: CANDIDATES })
