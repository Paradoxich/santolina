// Derives the Plant library's browse "collections" from the loaded catalog.
// Pure + client-safe — same per-plant fields the filters use, no extra query.
// The editorial choices (which style, which colour story) are placeholders
// for Ana to curate.
import { bucketsForPlant } from '@/lib/bloom-colors'
import type { CatalogPlant } from '@/types/garden'

export interface Collection {
  id: string
  title: string
  /** Optional one-line intro under the title. */
  subtitle?: string
  plants: CatalogPlant[]
}

// A shelf is one horizontal row, not the whole catalog.
const SHELF_CAP = 15

// Editorial defaults — placeholders for Ana.
const FEATURED_STYLE = { value: 'cottage', title: 'Cottage garden' }
const COLOUR_STORY = {
  id: 'cool',
  title: 'Blues & Purples',
  buckets: ['blue', 'purple', 'lavender'],
}

/**
 * Deterministic in-place-safe shuffle (Fisher–Yates with an LCG). Seeded so
 * server and client agree — no hydration mismatch — while breaking the
 * catalog's alphabetical order. Varying the seed by month gives the shelves a
 * gentle monthly refresh.
 */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items]
  let state = (seed || 1) >>> 0
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/**
 * Build the browse shelves in display order. `month` is 1–12 (the current
 * month) for the seasonal shelf; `gardenRegions` gates the native shelf. The
 * catalog is shuffled once and each plant is claimed by at most one shelf, so
 * shelves stay distinct instead of all showing the alphabetically-first
 * matches. Shelves that come up empty are dropped.
 */
export function buildCollections(
  plants: CatalogPlant[],
  gardenRegions: string[],
  month: number
): Collection[] {
  const pool = seededShuffle(plants, month)
  const used = new Set<string>()

  // Pull up to SHELF_CAP still-unclaimed plants matching the predicate.
  const take = (match: (p: CatalogPlant) => boolean): CatalogPlant[] => {
    const picked: CatalogPlant[] = []
    for (const p of pool) {
      if (picked.length >= SHELF_CAP) break
      if (used.has(p.id) || !match(p)) continue
      picked.push(p)
      used.add(p.id)
    }
    return picked
  }

  const collections: Collection[] = []

  // Native to your region — personalised; only when the region resolved.
  if (gardenRegions.length > 0) {
    collections.push({
      id: 'native',
      title: 'Native to you',
      subtitle: 'Plants that belong where you garden',
      plants: take((p) =>
        p.nativeRegion.some((r) => gardenRegions.includes(r))
      ),
    })
  }

  // In bloom right now — seasonal.
  collections.push({
    id: 'in-bloom',
    title: 'In bloom',
    subtitle: 'Flowering this month',
    plants: take((p) => p.bloomMonths.includes(month)),
  })

  // Featured style shelf — editorial.
  collections.push({
    id: `style-${FEATURED_STYLE.value}`,
    title: FEATURED_STYLE.title,
    plants: take((p) => p.styleTags.includes(FEATURED_STYLE.value)),
  })

  // Colour story — editorial grouping of bloom-colour buckets.
  collections.push({
    id: `colour-${COLOUR_STORY.id}`,
    title: COLOUR_STORY.title,
    plants: take((p) => {
      const buckets = bucketsForPlant(p.bloomColor)
      return COLOUR_STORY.buckets.some((b) => buckets.includes(b))
    }),
  })

  return collections.filter((c) => c.plants.length > 0)
}
