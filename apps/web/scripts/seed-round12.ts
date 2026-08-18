/**
 * Round-12 catalog expansion (August 2026) — the DAMP GROUND round.
 * Takes the catalog from 720 to ~750.
 *
 * WHICH STEP RUNS THIS, AND WHAT ENDS IT. This is step 1 of round 12, the
 * seed, which sits outside `run-round.ts` on purpose — the batch is where a
 * round's judgment lives and it is a different list every time
 * (docs/curation.md#round-runbook). What ends it
 * is `rounds/12/manifest.json`: once written, every later step scopes to it and
 * this file is never run again.
 *
 * WHY DAMP GROUND. Four themes were gap-tested against the live catalog before
 * one was chosen, using round 9's rule — a low count is not a gap until you
 * have checked it is not the data, and >=70% of candidates already held kills
 * the theme. Three of the four died on that test:
 *
 *   · SMALL-SPACE / CONTAINER / EDGING — 49 of 58 (84%) already held. This was
 *     the leading hypothesis and it was WRONG. It came from the height
 *     histogram (only 47 rows under 20cm against 194 over 200cm) and from
 *     terrace_balcony sitting at 26%, which together read as a small-garden
 *     product carrying a big-garden catalog. The species test says otherwise:
 *     the archetypal compact palette — Aubrieta, Armeria, Phlox subulata,
 *     Iberis, Erigeron karvinskianus, Sempervivum, Festuca glauca, Santolina,
 *     Convolvulus cneorum — is already in almost entirely. The histogram was
 *     measuring band boundaries, not absence.
 *   · DRY SHADE — 19 of 26 (73%) held. Consistent with round 8 having been the
 *     shade & structure batch. Epimedium, Geranium macrorrhizum, Brunnera,
 *     Asarum, Cyclamen, Ruscus, Danae are all present.
 *   · LATE SEASON (Sep-Nov) — 16 of 26 (62%). Survives the rule but thin, and
 *     it overlaps the winter-interest theme that round 9 killed on this same
 *     test and round 11 re-checked and declined to re-propose. Not taken.
 *   · DAMP / WATERSIDE — 21 of 63 (33%) held over two probes, the only theme
 *     that failed the kill test by a wide margin.
 *
 * The use-tag histogram agrees and is where the idea came from: `bog gardens`
 * 8, `pond margins` 7, `waterside planting` 6, `damp borders` 10, against
 * `pollinator gardens` 214 and `woodland gardens` 143. And it is a CONDITION
 * gap rather than a collector gap, which is the kind worth filling for this
 * product: a damp shady corner where nothing has ever grown is one of the most
 * common real beginner problems, and today the catalog answers it with almost
 * nothing.
 *
 * SCOPE: damp SOIL, not a pond. The round deliberately stops at plants that
 * grow in ground that stays wet. True aquatics that need standing water are a
 * pond installation, not a small ornamental garden, so Pontederia cordata,
 * Butomus umbellatus, Scirpus lacustris and Carex pseudocyperus were all cut
 * as out of scope despite being genuine absentees.
 *
 * FOUR CUTS ON THE "POOR CITIZEN" PRECEDENT (rounds 9/10, and round 11's
 * Lonicera japonica). Each is a real absentee and a bad recommendation for a
 * beginner who will not know:
 *   · Houttuynia cordata — rhizomatous runner, effectively uneradicable once
 *     established in damp soil.
 *   · Mentha aquatica — runs hard in wet ground, and Mentha already holds 4.
 *   · Lythrum salicaria — native and lovely in the Balkans, a regulated
 *     noxious weed across much of North America.
 *   · Iris pseudacorus — same shape as Lythrum: European native, vigorous
 *     self-seeder, invasive in North America.
 * The last two are the judgment calls, not the obvious ones, and they are the
 * two most likely to be overruled: both are native to the target region, and if
 * the catalog's audience is Euro/Med first then the North American status may
 * not be the deciding fact. Recorded here so the decision is reversible by
 * reading rather than by re-deriving.
 *
 * WHAT THE SYNONYM-AWARE DEDUPE CAUGHT, and it is the reason that table exists.
 * The gap probes matched on exact scientific name only, so they reported 28
 * absentees. Re-checked through `fetchCatalogIndex().holds()`, which consults
 * SYNONYM_GENERA, two of those were already in the catalog under another
 * genus — `Persicaria amplexicaulis` (round 11 seeded it) and
 * `Struthiopteris spicant` (held as Blechnum). Both were dropped. Seeded
 * blind they would have inserted DUPLICATE species, which is the one failure
 * no later pass can undo. An exact-name probe is not a dedupe.
 *
 * EXPECT TRAP 27 (gender-variant epithets) AND TRAP 6 (common names). Round 11
 * hit the epithet trap five times in 25 plants. The at-risk entries here are
 * the ones whose genus has moved recently — Erythranthe guttata (ex-Mimulus
 * guttatus, gender-variant, so rule 2 cannot fire and rule 3 must),
 * Succisa pratensis (ex-Scabiosa succisa, a different epithet entirely) and
 * Osmundastrum cinnamomeum (ex-Osmunda). No genus group was added to
 * `species-resolver.ts` for any of them: in all three cases the epithet
 * differs, so rule 2 could never consult the group — it would be an inert
 * entry that only looked like a guard. Rule 3, Trefle's own `synonyms[]`, is
 * the mechanism that can reach them, and the documented escape hatch when it
 * cannot is the printed `top hit rejected: <name> (#<id>)` line: verify the id
 * by hand, then seed it as a number.
 *
 * WHAT THE DRY RUN FOUND (2026-08-16), all three run down by hand before the
 * apply, none of them worked around:
 *
 *   · ARUNCUS AETHUSIFOLIUS IS NOT IN TREFLE AT ALL. The genus search returns
 *     only dioicus, gombalanus, sylvester and parvulus; the binomial returns
 *     nothing on any page. Dropped, on round 11's Ficus pumila precedent —
 *     this pipeline seeds by Trefle id, so a species the source does not hold
 *     cannot be seeded, and inventing a row would put an unsourced plant in a
 *     catalog whose whole point is provenance. It is left in the list above as
 *     a comment so nobody re-proposes it.
 *   · ASTILBE CHINENSIS RESOLVES TO A ROW THE CATALOG ALREADY HAS, and the
 *     skip is CORRECT. Trefle holds `Astilbe rubra` (#147885) and lists
 *     `Astilbe chinensis var. pumila` among its synonyms, so rule 3 matches
 *     the infraspecific synonym back to its accepted species — the deliberate
 *     widening documented in `species-resolver.ts`. The catalog already holds
 *     #147885. Left in the list rather than deleted: the skip line is
 *     self-explanatory in the run output, and the entry records that the
 *     species was considered. Worth knowing it is a real horticultural
 *     conflation, not a matcher bug — A. chinensis and A. rubra are separate
 *     garden plants that Trefle does not separate. Overriding it by hand would
 *     seed a duplicate species, the one failure no later pass can undo.
 *   · THE SIBLING GUARD FIRED ONCE, correctly: `Filipendula purpurea` search
 *     put `Filipendula glaberrima` (#266403) top, and the exact-epithet rule
 *     rejected it for #336446. That is trap 7 caught in flight.
 *
 * So 29 entries below, 28 of which seed.
 *
 * --dry-run resolves + dedupes and prints the plan without any DB writes or
 * Trefle detail calls. The default (apply) seeds each resolved species via the
 * same fetchAndMapSpecies/upsertPlant path as seed-plants.ts, then writes
 * rounds/12/manifest.json. Species already in the catalog (by resolved Trefle
 * id or scientific name, synonyms included) are skipped. native_to and every
 * AI field are left null on seed — curate-plants.ts fills them next.
 */

import { seedRound } from './seed-runner'

const ROUND_LABEL = '12'

// ---------------------------------------------------------------------------
// The list. 29 entries, each checked synonym-aware against the live catalog
// before being written here; 28 seed (see the dry-run notes in the header).
// Nothing is padded to reach a round number — padding is what cost round 10
// its dry run.
// ---------------------------------------------------------------------------
const CANDIDATES: Array<number | string> = [
  // === DAMP BORDER: THE PLUME-AND-SPIRE STRUCTURE ===========================
  'Astilbe chinensis', // SKIPS to Astilbe rubra — see the dry-run notes above
  'Astilbe simplicifolia', // dwarf, arching sprays, for a small damp corner
  'Filipendula purpurea', // Japanese meadowsweet — compact, unlike ulmaria/rubra
  // Aruncus aethusifolius — DROPPED: absent from Trefle entirely (see header).
  'Rodgersia pinnata', // ribbed bronze foliage, architectural in wet shade
  'Ligularia przewalskii', // black stems, narrow yellow spires, deeply cut leaf
  'Persicaria bistorta', // common bistort — soft pink pokers, spreads gently
  'Sanguisorba obtusa', // fluffy pink bottlebrushes on wiry stems
  'Succisa pratensis', // devil's-bit scabious — late blue, meadow-native

  // === DAMP BORDER: COLOUR =================================================
  'Lobelia cardinalis', // cardinal flower — scarlet, the strongest red here
  'Lobelia siphilitica', // great blue lobelia — the blue counterpart
  'Trollius europaeus', // globeflower — clean lemon globes, late spring
  'Ranunculus aconitifolius', // white bachelor's buttons, branching and airy
  'Geum rivale', // water avens — nodding dusky pink bells
  'Gentiana asclepiadea', // willow gentian — arching stems, true blue, moist shade
  'Cardamine pratensis', // cuckooflower — early lilac, naturalises in damp grass
  'Erythranthe guttata', // monkey flower (ex-Mimulus guttatus) — yellow, spotted

  // === POND EDGE AND WET GROUND (damp soil, not standing water) =============
  'Caltha palustris', // marsh marigold — the classic, earliest gold
  'Myosotis scorpioides', // water forget-me-not — long-flowering blue
  'Lysimachia nummularia', // creeping jenny — spiller, damp mat
  'Acorus gramineus', // sweet flag — narrow evergreen fan, container-friendly

  // === THE MOISTURE-LOVING IRISES ==========================================
  'Iris ensata', // Japanese iris — flat, wide, the showiest of the three
  'Iris sibirica', // Siberian iris — narrow, upright, the toughest
  'Iris laevigata', // water iris — the one that takes the wettest ground

  // === CANDELABRA PRIMULAS =================================================
  'Primula florindae', // giant cowslip — scented nodding yellow, latest
  'Primula bulleyana', // candelabra — orange-through-yellow tiers

  // === STRUCTURE: FERN, SEDGE, RUSH ========================================
  'Osmundastrum cinnamomeum', // cinnamon fern (ex-Osmunda) — upright fertile fronds
  'Carex elata', // tufted sedge — the golden form is a damp-garden staple
  'Juncus effusus', // soft rush — vertical green, evergreen structure
  'Eupatorium cannabinum', // hemp agrimony — tall native, major pollinator plant
]

// ---------------------------------------------------------------------------
// Name matching, resolution and the dedupe all live in ./species-resolver.ts.
// This file must not declare its own synonym table — that fork is what lost
// twelve groups between rounds, and check-pipeline-invariants.ts shape 6
// refuses it.
// ---------------------------------------------------------------------------

seedRound({ label: '12', candidates: CANDIDATES })
