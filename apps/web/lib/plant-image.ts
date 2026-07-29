// Pure image-resolution helpers. No server imports, so this is safe to pull
// into client components and shared modules (e.g. lib/bloom-timeline.ts).

/**
 * Resolve a plant's hero image, preferring the editorial pick.
 *
 * image_url is Trefle's own choice — the first image of its highest-priority
 * category, which is not a curation decision and often lands on a herbarium
 * sheet or a potted nursery shot. image_url_curated is what the vision pass
 * chose (scripts/pick-plant-images.ts), so it wins wherever it exists. Falling
 * back through image_url to image_urls[0] keeps every plant rendering exactly
 * as it did before the pass ran, so this is safe to ship ahead of the data.
 */
export function heroImageUrl(plant: {
  image_url_curated?: string | null
  image_url?: string | null
  image_urls?: string[] | null
}): string {
  return (
    plant.image_url_curated ?? plant.image_url ?? plant.image_urls?.[0] ?? ''
  )
}

/**
 * How many photos a plant's gallery shows, hero included.
 *
 * image_urls is every URL Trefle returned, unfiltered and in Trefle's order —
 * 26 per plant on average, 43 at the worst. Only the hero was ever curated
 * (scripts/pick-plant-images.ts), so the tail is the raw PlantNet pile: bark
 * closeups, herbarium sheets, out-of-focus phone shots. Nobody needs 43 photos
 * of a plant, and quality drops the further down that list you go, so the cap
 * removes most of the bad ones by construction.
 */
export const GALLERY_MAX_PHOTOS = 10

/**
 * The ordered photo list for a plant's gallery: hero first, then the remaining
 * Trefle images, deduped and capped.
 *
 * Leading with the hero matters because getPlantDetail resolves image_url to
 * the curated pick, which can be a Wikimedia image that isn't in image_urls at
 * all — so the detail view opens on the same photo the browse card shows.
 */
export function galleryPhotoUrls(
  plant: {
    image_url?: string | null
    image_urls?: string[] | null
  },
  limit: number = GALLERY_MAX_PHOTOS
): string[] {
  return [
    ...(plant.image_url ? [plant.image_url] : []),
    ...(plant.image_urls ?? []).filter((u) => u !== plant.image_url),
  ].slice(0, limit)
}
