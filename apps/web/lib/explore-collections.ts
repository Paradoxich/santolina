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
  title: 'Cool blues & purples',
  buckets: ['blue', 'purple', 'lavender'],
}

/**
 * Build the browse shelves in display order. `month` is 1–12 (the current
 * month) for the seasonal shelf; `gardenRegions` gates the native shelf.
 * Shelves that come up empty are dropped.
 */
export function buildCollections(
  plants: CatalogPlant[],
  gardenRegions: string[],
  month: number
): Collection[] {
  const collections: Collection[] = []

  // Native to your region — personalised; only when the region resolved.
  if (gardenRegions.length > 0) {
    collections.push({
      id: 'native',
      title: 'Native to your region',
      subtitle: 'Plants that belong where you garden',
      plants: plants
        .filter((p) => p.nativeRegion.some((r) => gardenRegions.includes(r)))
        .slice(0, SHELF_CAP),
    })
  }

  // In bloom right now — seasonal.
  collections.push({
    id: 'in-bloom',
    title: 'In bloom right now',
    subtitle: 'Flowering this month',
    plants: plants
      .filter((p) => p.bloomMonths.includes(month))
      .slice(0, SHELF_CAP),
  })

  // Featured style shelf — editorial.
  collections.push({
    id: `style-${FEATURED_STYLE.value}`,
    title: FEATURED_STYLE.title,
    plants: plants
      .filter((p) => p.styleTags.includes(FEATURED_STYLE.value))
      .slice(0, SHELF_CAP),
  })

  // Colour story — editorial grouping of bloom-colour buckets.
  collections.push({
    id: `colour-${COLOUR_STORY.id}`,
    title: COLOUR_STORY.title,
    plants: plants
      .filter((p) => {
        const buckets = bucketsForPlant(p.bloomColor)
        return COLOUR_STORY.buckets.some((b) => buckets.includes(b))
      })
      .slice(0, SHELF_CAP),
  })

  return collections.filter((c) => c.plants.length > 0)
}
