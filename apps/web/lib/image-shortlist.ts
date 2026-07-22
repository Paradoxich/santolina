/**
 * Choosing which candidate photos are worth paying a vision call to look at.
 *
 * Pure selection logic, kept out of the scripts that use it so it can be tested
 * directly — the round-robin and the incumbent pinning below are both subtle
 * enough to have already shipped one bug between them.
 *
 * Used by scripts/pick-plant-images.ts (and written by
 * scripts/recover-image-categories.ts).
 */

import type { ImageAttribution } from './image-attribution'

/** Where a candidate came from — governs how it is prioritised and credited. */
export type ImageSource = 'trefle' | 'wikimedia'

/** One candidate image plus the category Trefle filed it under. */
export interface ImageCandidate {
  url: string
  category: string
  // Absent means Trefle (the original, un-migrated shape). Wikimedia candidates
  // are curated best-images and carry the attribution their licence requires.
  source?: ImageSource
  attribution?: ImageAttribution
}

/** A candidate that survived probing, with its measured pixel dimensions. */
export interface Measured {
  url: string
  category: string
  width: number
  height: number
  isIncumbent: boolean
  source?: ImageSource
  attribution?: ImageAttribution
}

// A hero is either the bloom or the whole plant; everything else is a detail
// shot that reads as a mystery at card size.
export const PRIMARY_CATEGORIES = ['flower', 'habit']
// Used only to top up a plant with too few primaries to choose between.
export const FALLBACK_CATEGORIES = ['unknown', 'other', 'leaf', 'fruit', 'bark']

export const MAX_FOR_VISION = 6
export const MIN_SHORTLIST = 4
// Cap on Wikimedia candidates per plant, so a large Commons category can't
// crowd Trefle's options out of the shortlist entirely.
export const MAX_WIKIMEDIA = 4

const isWikimedia = (c: { source?: ImageSource }) => c.source === 'wikimedia'

/**
 * Narrow a plant's candidates to the ones worth paying to look at.
 *
 * Primary categories first, interleaved so a plant with five bloom shots and
 * five habit shots offers the model both framings rather than five near-
 * duplicates of one. The incumbent image_url is always included when it is a
 * known candidate, so the model chooses against the current pick rather than
 * in ignorance of it. Wikimedia candidates are always included too — they are
 * curated best-images, so they must reach the vision call regardless of how
 * many Trefle snapshots a plant already has.
 */
export function shortlist(
  candidates: ImageCandidate[],
  incumbent: string | null
): ImageCandidate[] {
  const byCategory = new Map<string, ImageCandidate[]>()
  for (const c of candidates) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, [])
    byCategory.get(c.category)!.push(c)
  }

  const picked: ImageCandidate[] = []
  const seen = new Set<string>()

  const take = (c: ImageCandidate | undefined) => {
    if (!c || seen.has(c.url)) return
    seen.add(c.url)
    picked.push(c)
  }

  // Wikimedia first — a Wikidata P18 / Commons photo is a hand-picked best
  // image, so it always earns a shortlist slot (rankAndCap then pins it past
  // the resolution cut). Capped so a big Commons category can't dominate.
  for (const c of candidates.filter(isWikimedia).slice(0, MAX_WIKIMEDIA)) {
    take(c)
  }

  // Round-robin across flower/habit so neither framing crowds the other out.
  const depth = Math.max(
    ...PRIMARY_CATEGORIES.map((c) => byCategory.get(c)?.length ?? 0),
    0
  )
  for (let i = 0; i < depth; i++) {
    for (const category of PRIMARY_CATEGORIES) {
      take(byCategory.get(category)?.[i])
    }
  }

  // Top up only when there is barely anything to choose between — a plant with
  // no habit shots (Actaea simplex, for one) should still get a real comparison.
  if (picked.length < MIN_SHORTLIST) {
    for (const category of FALLBACK_CATEGORIES) {
      for (const c of byCategory.get(category) ?? []) {
        if (picked.length >= MIN_SHORTLIST) break
        take(c)
      }
    }
  }

  // The incumbent earns a slot even if its category ranks low, so the pass can
  // confirm a good existing pick instead of replacing it blindly.
  if (incumbent) {
    const match = candidates.find((c) => c.url === incumbent)
    if (match && !seen.has(match.url)) picked.unshift(match)
  }

  return picked
}

/**
 * Rank probed candidates and cut the list down to what we will actually send.
 *
 * Ranked by short edge rather than total pixels: the short edge decides how
 * much detail survives a full-bleed card crop, whereas pixel count flatters
 * extreme panoramas that lose most of their area to the crop.
 *
 * Pinned candidates — the incumbent, and any Wikimedia photo — are then
 * guaranteed a place inside the cap. Without this a low-resolution current pick
 * gets sorted below six sharper alternatives and sliced away, so the pass would
 * "upgrade" that plant without ever having compared the two and could never
 * confirm an already-good hero; the same reasoning protects a curated Wikimedia
 * image whose resolution happens to trail a burst of sharp Trefle snapshots.
 */
export function rankAndCap(
  measured: Measured[],
  max = MAX_FOR_VISION
): { kept: Measured[]; capped: number } {
  const byShortEdge = (a: Measured, b: Measured) =>
    Math.min(b.width, b.height) - Math.min(a.width, a.height)
  const isPinned = (m: Measured) => m.isIncumbent || isWikimedia(m)

  const ranked = [...measured].sort(byShortEdge)

  // Guarantee every pinned candidate survives, then fill the rest by
  // resolution. When pinned candidates exceed the cap, the highest-resolution
  // ones win — pinning is a floor on inclusion, not a bypass of ranking.
  const pinned = ranked.filter(isPinned)
  const rest = ranked.filter((m) => !isPinned(m))
  const kept = [...pinned.slice(0, max)]
  for (const m of rest) {
    if (kept.length >= max) break
    kept.push(m)
  }
  kept.sort(byShortEdge)

  return { kept, capped: Math.max(0, measured.length - kept.length) }
}
