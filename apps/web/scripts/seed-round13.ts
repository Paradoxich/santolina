/**
 * Round-13 catalog expansion (August 2026) — the EAST ASIAN TRADITIONS round.
 * Takes the catalog from 747 to ~780.
 *
 * WHICH STEP RUNS THIS, AND WHAT ENDS IT. Step 1 of round 13, the seed, which
 * sits outside `run-round.ts` on purpose — the batch is where a round's
 * judgment lives and it is a different list every time
 * (docs/curation.md#round-runbook). What ends it is `rounds/13/manifest.json`:
 * once written, every later step scopes to it and this file is never run again.
 * The loop itself is `seed-runner.ts`; this file is the candidate list and the
 * reasoning for it, which is the only part that was ever a decision.
 *
 * WHY EAST ASIAN TRADITIONS. The style vocabulary was expanded from 6 to 19 on
 * 2026-08-17 (`6382866`), adding a PLACE axis — `japanese`, `chinese`,
 * `tropical`, `desert` — and the catalog was re-tagged against it the same day.
 * A new axis is the one moment a style's population is a real question rather
 * than an artefact, so the four thinnest new styles were gap-probed before this
 * round was chosen.
 *
 * THE PROBE IS COMMITTED, and that is new. Rounds 9 through 12 ran this test by
 * hand and recorded only the verdict in a header, which made theme selection
 * the one part of a round nobody could reproduce. `scripts/probe-gap.ts` is now
 * step 0 and `reports/gap-probe-2026-08-17.md` is its output, archived into
 * `rounds/13/reports/` at close. Measured against 747 species:
 *
 *   · JAPANESE  — 15 of 32 (47%) held. Survives.
 *   · CHINESE   — 10 of 32 (31%) held. Survives, and is the wider gap.
 *   · MOON      — 7 of 25 (28%) held. UNFILLABLE, see below.
 *   · GOTHIC    — 6 of 20 (30%) held. UNFILLABLE, see below.
 *
 * WHY THE TWO EMPTIEST STYLES ARE NOT THIS ROUND, which is the finding the flat
 * count would have hidden. `gothic` sits at 10 tagged plants and reads as the
 * obvious round; it is not one. The dark garden is near-entirely CULTIVAR
 * selections of species the catalog already holds — 'Queen of Night' tulip,
 * 'Black Lace' elder, 'Diabolo' physocarpus, black mondo, dark dahlias and
 * heucheras. `moon` is half the same story: the white forms of held species are
 * selections, and only the night-scented species are seedable. Neither can be
 * moved by a species-level round at any batch size. That is a cultivar-tier
 * SCHEMA question and belongs on standing rule 11's list, not on a seed. The
 * probe now carries both notes in `CULTIVAR_BOUND` so the next round does not
 * re-derive this from the count.
 *
 * WHY BOTH TRADITIONS IN ONE ROUND. `japanese`/`chinese` is one of the pairs
 * `CONFUSABLE_STYLE_PAIRS` exists to keep apart, and the style prompt tells the
 * model to pick one tradition and never both. Seeding both together puts that
 * boundary under the hardest test it will get, on plants chosen specifically to
 * sit near it — which is the argument FOR doing it now, while the axis is new
 * and a bad boundary is cheap to fix. It also means reading `style_tags` at
 * close is real work, not a formality: double-tagging across this pair is the
 * signal the definitions have not landed.
 *
 * SIX CUTS ON THE "POOR CITIZEN" PRECEDENT (rounds 9/10/11, and round 12's
 * four). The probe found 39 absentees; 33 are seeded. Each cut is a real
 * absentee and a bad recommendation for a beginner who will not know:
 *   · Phyllostachys nigra, P. aurea — RUNNING bamboo, effectively uneradicable
 *     once established. The clumping Fargesia murielae is seeded in their
 *     place and is the honest answer to "I want bamboo".
 *   · Equisetum hyemale — same shape, a running horsetail.
 *   · Nelumbo nucifera — a true aquatic needing standing water. Out of scope on
 *     round 12's own line, which stopped at damp soil and cut Pontederia,
 *     Butomus and Scirpus for exactly this reason.
 *   · Cymbidium goeringii — an orchid, not a garden plant outside its range.
 *   · Citrus trifoliata — a 3-6m barrier hedge armed with 5cm thorns. CUT ON
 *     SIZE AND SAFETY IN A SMALL GARDEN, deliberately NOT on its North American
 *     invasive status. Ana, 2026-08-17: ruling that way would bind round 12's
 *     Lythrum and Iris pseudacorus calls retroactively, and whether a Euro/Med
 *     catalog should be governed by US invasive status is still open.
 *
 * FOUR CANDIDATES KEPT THAT AN EARLIER DRAFT CUT, recorded because the reason
 * they were cut was bad. Camellia sinensis, Cryptomeria japonica, Ziziphus
 * jujuba and Styphnolobium japonicum were trimmed to hit a round number of 30,
 * which is not an argument — "around 30" was a sense of size, not a budget the
 * cuts had to satisfy. Ana, 2026-08-17. They are large or crop-adjacent and
 * that is a curation judgment for `curate-plants`, not a reason to withhold
 * them from the catalog.
 *
 * WHAT TO WATCH AT CLOSE:
 *   · `cross-check-plants` will flag `plant_type` on the bamboos and the
 *     mondo/Rohdea group — the round-4 false-positive class, left naive.
 *   · `curate-common-names` runs with `--apply` for the FIRST time here
 *     (runbook step 1a). It is not deterministic about which correct name it
 *     picks, and this batch is full of plants with several genuine English
 *     names. Read its output before applying.
 *   · `pnpm runs:cost --round 13` at close. First round measured rather than
 *     estimated.
 *
 * Usage:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round13.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round13.ts
 */

import { seedRound, seedRunIncomplete } from './seed-runner'

/**
 * 33 species: 16 Japanese-tradition, 17 Chinese-tradition, in the order the gap
 * probe reported them. Names are the accepted binomials the probe tested, so
 * this list and `reports/gap-probe-2026-08-17.md` can be diffed against each
 * other — the six cuts above are the whole of the difference.
 */
const CANDIDATES = [
  // --- Japanese tradition (16) --------------------------------------------
  // Structure first: the style is form over flower, so the pines and the
  // clipped evergreens matter more here than the flowering cherries do.
  'Pinus thunbergii',
  'Pinus parviflora',
  'Pinus densiflora',
  'Cryptomeria japonica',
  'Chamaecyparis obtusa',
  'Sciadopitys verticillata',
  'Podocarpus macrophyllus',
  'Rhododendron indicum',
  'Rhododendron kiusianum',
  'Camellia sasanqua',
  'Enkianthus campanulatus',
  'Prunus serrulata',
  'Prunus incisa',
  'Ophiopogon japonicus',
  'Farfugium japonicum',
  'Rohdea japonica',

  // --- Chinese tradition (17) ---------------------------------------------
  // The scholar's garden grows plants as specimens for cultural meaning, so
  // this half is flowering and fragrant where the Japanese half is structural.
  'Paeonia suffruticosa',
  'Prunus mume',
  'Osmanthus fragrans',
  'Magnolia denudata',
  'Magnolia liliiflora',
  'Chrysanthemum morifolium',
  'Fargesia murielae',
  'Lagerstroemia indica',
  'Gardenia jasminoides',
  'Camellia sinensis',
  'Jasminum sambac',
  'Hibiscus syriacus',
  'Iris tectorum',
  'Cercis chinensis',
  'Styphnolobium japonicum',
  'Ziziphus jujuba',
  'Malus spectabilis',
] as const

async function main(): Promise<void> {
  const result = await seedRound({ label: '13', candidates: CANDIDATES })
  if (seedRunIncomplete(result)) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
