/**
 * Round-8 common-name editorial pass — the same corrective step round 7 needed
 * (see the round-7 notes: 50 rows of name fixes after that seed).
 *
 * WHY. `common_name` comes straight from Trefle, which is a botanical source,
 * not a horticultural one. Its names are drawn from floras and USDA lists, so
 * a seed batch reliably lands three defects that are wrong in a *garden*
 * catalog even when they are defensible in a flora:
 *
 *   1. NO NAME. Trefle has no English common name for the species, and the
 *      mapper falls back to the scientific name (docs/architecture.md#trefle-field-mapping). The Explore card then
 *      reads "Thalictrum rochebruneanum" where every other card reads like a
 *      plant you could ask for in a nursery. 18 rows this round.
 *   2. WRONG NAME — including one real collision. Trefle returned "Judastree"
 *      for Cercis canadensis; the Judas tree is C. siliquastrum, which is
 *      ALREADY IN THE CATALOG from an earlier round. Left alone, two different
 *      species carry the same common name and the search box cannot separate
 *      them. Primula sieboldii came back "Japanese primrose", which collides
 *      with P. japonica in the same batch, and Papaver cambricum came back as
 *      the bare word "Poppy" against Papaver rhoeas already held.
 *   3. CROP NAME FOR AN ORNAMENTAL. Colocasia esculenta as "Coco-yam" and
 *      Canna indica as "African arrowroot" are the food-crop names; this
 *      catalog is stocking them as foliage plants, and round 8's whole premise
 *      is that they are the lush palette's raw material.
 *
 * Also folded in: one Trefle typo ("Tree aenium"), a cultivar name standing in
 * for a species ("Peegee hydrangea" is H. paniculata 'Grandiflora'), and a
 * handful of names that belong to a DIFFERENT species than the row they are
 * on ("Alpine woodfern" is not Dryopteris wallichiana; "Lesser wood-rush" is
 * Luzula forsteri, not L. nivea).
 *
 * WHAT THIS IS NOT. It does not touch hyphenation or dialect preference — a
 * defensible regional name is left alone ("Deer fern", "Bird-in-a-bush",
 * "Checkerberry" was changed only because "Wintergreen" is what the plant is
 * sold as). It does not flip `is_curated`: this is a mechanical correction of
 * names that are absent, wrong, or ambiguous, NOT Ana's editorial voice pass
 * (docs/architecture.md#curation-layer). Every row here still needs her read before `is_curated` goes true.
 *
 * SAFETY IS NOT HERE ANY MORE, and that is the improvement: `scripts/name-fixes.ts`
 * owns the drift guard, the frozen-row policy, the idempotence, the id
 * resolution and the run record for all three name passes. This file is its
 * decisions and the reasoning above.
 *
 * IT GAINED THE COLLISION PRE-CHECK IN THE MOVE, which is the one behaviour
 * change worth naming. The COLLISIONS group below exists because this pass
 * created a collision it then had to fix ("SELF-INFLICTED", Anemone
 * quinquefolia); the check that refuses a target another row already holds
 * arrived with round 11 and could not reach backwards. Now it runs here too, so
 * a re-run cannot repeat the mistake this file documents.
 *
 * Usage (from apps/web) — dry run is the default, nothing writes without
 * --apply:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round8-names.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/fix-round8-names.ts --apply
 */

import { runNameFixes, type NameFix } from './name-fixes'

type Fix = NameFix

// --- rows where Trefle had no English name and the mapper fell back to the
// --- scientific name (docs/architecture.md#trefle-field-mapping). Names chosen as the one a nursery would print.
const MISSING: Fix[] = [
  {
    scientific_name: 'Anemonoides blanda',
    from: 'Anemonoides blanda',
    to: 'Grecian windflower',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Anemonoides nemorosa',
    from: 'Anemonoides nemorosa',
    to: 'Wood anemone',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Anemonoides ranunculoides',
    from: 'Anemonoides ranunculoides',
    to: 'Yellow wood anemone',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Danae racemosa',
    from: 'Danae racemosa',
    to: 'Alexandrian laurel',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Dicksonia antarctica',
    from: 'Dicksonia antarctica',
    to: 'Soft tree fern',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Eucomis bicolor',
    from: 'Eucomis bicolor',
    to: 'Pineapple lily',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Fritillaria imperialis',
    from: 'Fritillaria imperialis',
    to: 'Crown imperial',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Hydrangea serrata',
    from: 'Hydrangea serrata',
    to: 'Mountain hydrangea',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Laburnum anagyroides',
    from: 'Laburnum anagyroides',
    to: 'Golden chain tree',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Nerine bowdenii',
    from: 'Nerine bowdenii',
    to: 'Bowden lily',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Omphalodes cappadocica',
    from: 'Omphalodes cappadocica',
    to: 'Blue-eyed Mary',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Parrotia persica',
    from: 'Parrotia persica',
    to: 'Persian ironwood',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Primula japonica',
    from: 'Primula japonica',
    to: 'Japanese candelabra primrose',
    why: 'no Trefle common name; "candelabra" also separates it from P. sieboldii below',
  },
  {
    scientific_name: 'Sarcococca hookeriana',
    from: 'Sarcococca hookeriana',
    to: 'Himalayan sweet box',
    why: 'no Trefle common name; qualified because S. confusa (sweet box) is already held',
  },
  {
    scientific_name: 'Symphytum grandiflorum',
    from: 'Symphytum grandiflorum',
    to: 'Creeping comfrey',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Thalictrum rochebruneanum',
    from: 'Thalictrum rochebruneanum',
    to: 'Lavender mist meadow rue',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Tricyrtis formosana',
    from: 'Tricyrtis formosana',
    to: 'Formosa toad lily',
    why: 'no Trefle common name',
  },
  {
    scientific_name: 'Viburnum davidii',
    from: 'Viburnum davidii',
    to: 'David viburnum',
    why: 'no Trefle common name',
  },
]

// --- rows where Trefle's name is wrong, ambiguous against another catalog
// --- row, or belongs to a different species entirely.
const WRONG: Fix[] = [
  {
    scientific_name: 'Cercis canadensis',
    from: 'Judastree',
    to: 'Eastern redbud',
    why: 'COLLISION — the Judas tree is C. siliquastrum, already in the catalog',
  },
  {
    scientific_name: 'Primula sieboldii',
    from: 'Japanese primrose',
    to: "Siebold's primrose",
    why: 'collides with P. japonica in this same batch',
  },
  {
    scientific_name: 'Papaver cambricum',
    from: 'Poppy',
    to: 'Welsh poppy',
    why: 'bare genus word; P. rhoeas already held',
  },
  {
    scientific_name: 'Aeonium arboreum',
    from: 'Tree aenium',
    to: 'Tree aeonium',
    why: 'Trefle typo',
  },
  {
    scientific_name: 'Hydrangea paniculata',
    from: 'Peegee hydrangea',
    to: 'Panicle hydrangea',
    why: "cultivar name ('Grandiflora') standing in for the species",
  },
  {
    scientific_name: 'Dryopteris wallichiana',
    from: 'Alpine woodfern',
    to: "Wallich's wood fern",
    why: 'alpine woodfern is a different species',
  },
  {
    scientific_name: 'Luzula nivea',
    from: 'Lesser wood-rush',
    to: 'Snowy wood-rush',
    why: 'lesser wood-rush is L. forsteri',
  },
  {
    scientific_name: 'Astilbe japonica',
    from: "Florist's spiraea",
    to: 'Japanese astilbe',
    why: 'not a spiraea; misleads on genus',
  },
  {
    scientific_name: 'Colocasia esculenta',
    from: 'Coco-yam',
    to: 'Elephant ear',
    why: 'food-crop name; stocked here as a foliage plant',
  },
  {
    scientific_name: 'Canna indica',
    from: 'African arrowroot',
    to: 'Canna lily',
    why: 'food-crop name; stocked here as a foliage plant',
  },
  {
    scientific_name: 'Crassula ovata',
    from: 'Japanese rubberplant',
    to: 'Jade plant',
    why: 'not a rubber plant and not Japanese',
  },
  {
    scientific_name: 'Sorbus aucuparia',
    from: 'Quickbeam',
    to: 'Rowan',
    why: 'archaic name; rowan is what it is sold as',
  },
  {
    scientific_name: 'Ruscus aculeatus',
    from: 'Box-holly',
    to: "Butcher's broom",
    why: 'neither a box nor a holly',
  },
  {
    scientific_name: 'Bergenia crassifolia',
    from: 'Siberian-tea',
    to: 'Heart-leaved bergenia',
    why: 'tea name says nothing about the garden plant',
  },
  {
    scientific_name: 'Arisaema triphyllum',
    from: 'Indian-turnip',
    to: 'Jack-in-the-pulpit',
    why: 'archaic; jack-in-the-pulpit is the standard name',
  },
  {
    scientific_name: 'Sanguinaria canadensis',
    from: 'Red puccoon',
    to: 'Bloodroot',
    why: 'archaic; bloodroot is the standard name',
  },
  {
    scientific_name: 'Euonymus fortunei',
    from: 'Climbing euonymus',
    to: 'Wintercreeper',
    why: 'sold as wintercreeper',
  },
  {
    scientific_name: 'Gaultheria procumbens',
    from: 'Checkerberry',
    to: 'Wintergreen',
    why: 'sold as wintergreen',
  },
  {
    scientific_name: 'Hedera colchica',
    from: 'Colchis ivy',
    to: 'Persian ivy',
    why: 'sold as Persian ivy',
  },
  {
    scientific_name: 'Carex muskingumensis',
    from: 'Muskingum sedge',
    to: 'Palm sedge',
    why: 'sold as palm sedge; describes the plant',
  },
  {
    scientific_name: 'Allium cristophii',
    from: 'Persian onion',
    to: 'Star of Persia',
    why: 'sold as star of Persia; "onion" misleads on an ornamental',
  },
  {
    scientific_name: 'Lilium martagon',
    from: "Turk's-cap",
    to: 'Martagon lily',
    why: "turk's-cap is a flower shape shared by several lilies",
  },
  {
    scientific_name: 'Parthenocissus henryana',
    from: 'Chinese virginia-creeper',
    to: 'Silvervein creeper',
    why: 'sold as silvervein creeper; the silver veining is the point',
  },
  {
    scientific_name: 'Hosta plantaginea',
    from: 'August-lily',
    to: 'Fragrant plantain lily',
    why: 'not a lily; fragrance is the reason to plant it',
  },
  {
    scientific_name: 'Ipheion uniflorum',
    from: 'Springstar',
    to: 'Spring starflower',
    why: 'full form of the name',
  },
  {
    scientific_name: 'Prunus lusitanica',
    from: 'Portuguese laurel cherry',
    to: 'Portugal laurel',
    why: 'sold as Portugal laurel',
  },
  {
    scientific_name: 'Camassia quamash',
    from: 'Camash',
    to: 'Common camas',
    why: 'misspelling; also separates it from C. leichtlinii (large camas)',
  },
  {
    scientific_name: 'Heuchera americana',
    from: 'Alumroot',
    to: 'American alumroot',
    why: 'bare genus word; H. villosa is also an alumroot',
  },
  {
    scientific_name: 'Yucca rostrata',
    from: 'Big bend yucca',
    to: 'Beaked yucca',
    why: 'beaked yucca is the horticultural name',
  },
  {
    scientific_name: 'Musa basjoo',
    from: 'Japanese fibre banana',
    to: 'Japanese banana',
    why: 'fibre is the crop use, not the garden use',
  },
  {
    scientific_name: 'Malus × floribunda',
    from: 'Japanese crab',
    to: 'Japanese crab apple',
    why: '"crab" alone reads as the animal',
  },
]

// --- display-name collisions: two rows sharing one common_name. Found by
// --- querying for duplicates AFTER the first two groups were applied, which
// --- is how the third entry was caught — the rename below created it.
// --- verify-round.ts now fails on duplicate common_name so this is checked,
// --- not remembered.
const COLLISIONS: Fix[] = [
  {
    scientific_name: 'Acer japonicum',
    from: 'Japanese maple',
    to: 'Fullmoon maple',
    why: 'collided with A. palmatum, the true Japanese maple, already held',
  },
  {
    scientific_name: 'Anemone quinquefolia',
    from: 'Wood anemone',
    to: 'American wood anemone',
    why: 'SELF-INFLICTED — renaming Anemonoides nemorosa to "Wood anemone" above collided with this pre-existing row; the American species takes the qualifier',
  },
  {
    scientific_name: 'Muscari botryoides',
    from: 'Grape-hyacinth',
    to: 'Italian grape hyacinth',
    why: 'pre-existing collision with M. neglectum, not from this round',
  },
  {
    scientific_name: 'Muscari neglectum',
    from: 'Grape-hyacinth',
    to: 'Southern grape hyacinth',
    why: 'pre-existing collision with M. botryoides, not from this round',
  },
]

const FIXES: Fix[] = [...MISSING, ...WRONG, ...COLLISIONS]

async function main() {
  await runNameFixes({
    step: 'fix-round8-names',
    fixes: FIXES,
    summary: `${MISSING.length} missing, ${WRONG.length} wrong, ${COLLISIONS.length} collisions`,
  })
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
