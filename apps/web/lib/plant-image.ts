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
