/**
 * Fetch candidate hero photos from Wikimedia Commons for a plant species.
 *
 * The vision pass (scripts/pick-plant-images.ts) originally chose only among
 * Trefle/PlantNet candidates — ~89% community identification snapshots. Commons
 * is where photographers upload their best work, and Wikidata's P18 property is
 * a hand-picked "the image" per species. This resolves a scientific name to
 * that image plus its attribution, so the feeder can add it as a candidate the
 * pass then judges against the Trefle options.
 *
 * SERVER-ONLY — used by data scripts, never imported into client components.
 */

import type { ImageAttribution } from './image-attribution'

// Wikimedia asks API clients to identify themselves with a descriptive UA and a
// contact; anonymous or generic UAs get rate-limited or blocked.
const UA =
  'Santolina/0.1 (garden planning app; hero-image sourcing) contact: ana.beverin@gmail.com'

export interface WikimediaCandidate {
  // The ORIGINAL file URL. Commons' thumbnail service rate-limits aggressively
  // (it 400s under any volume), but originals are served straight from storage
  // and stay reliable. next/image resizes for display, and fetchImageBlob caps
  // the base64 we send the model, so carrying the original costs us nothing but
  // buys reliability.
  url: string
  width: number
  height: number
  attribution: ImageAttribution
}

const stripHtml = (s: string) => (s ?? '').replace(/<[^>]+>/g, '').trim()

/** scientific name -> Wikidata taxon (P225) -> P18 image file title. */
export async function resolveP18FileTitle(
  scientificName: string
): Promise<string | null> {
  // Match the taxon by its scientific name (P225) and read its image (P18).
  const q = `SELECT ?image WHERE { ?item wdt:P225 "${scientificName.replace(/"/g, '')}". ?item wdt:P18 ?image. } LIMIT 1`
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
  })
  if (!r.ok) return null
  const j = (await r.json()) as {
    results?: { bindings?: { image?: { value?: string } }[] }
  }
  const value = j.results?.bindings?.[0]?.image?.value
  if (!value) return null
  // P18 is a Special:FilePath URL ending in the file name.
  return decodeURIComponent(value.split('/').pop() ?? '')
}

/**
 * Commons imageinfo for a file title: a bounded thumbnail URL plus attribution.
 *
 * `thumbWidth` asks Commons to resize, so the returned URL is safe to fetch and
 * store. width/height are the ORIGINAL dimensions, kept as the resolution
 * signal (the pass ranks by short edge). Returns null if the file is missing,
 * has no usable image, or — deliberately — is a drawing rather than a
 * photograph (P18 sometimes points at a botanical illustration).
 */
export async function fetchCommonsCandidate(
  fileTitle: string
): Promise<WikimediaCandidate | null> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    '&iiprop=url|size|extmetadata&titles=' +
    encodeURIComponent(`File:${fileTitle}`)
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) return null
  const j = (await r.json()) as {
    query?: {
      pages?: Record<string, { imageinfo?: Record<string, unknown>[] }>
    }
  }
  const page = Object.values(j.query?.pages ?? {})[0]
  const ii = page?.imageinfo?.[0] as
    | {
        url?: string
        width?: number
        height?: number
        extmetadata?: Record<string, { value?: string }>
      }
    | undefined
  if (!ii?.url || !ii.width || !ii.height) return null

  // Skip obvious non-photographs early. The vision pass would reject an
  // illustration anyway (it rejects herbarium sheets), but filtering here saves
  // a candidate slot and a paid comparison. The file name and the MIME-ish
  // fields are the cheap signals; SVGs are always diagrams.
  const lowerTitle = fileTitle.toLowerCase()
  if (
    /\.svg$/.test(lowerTitle) ||
    /(illustration|drawing|dessin|zeichnung|botanical plate|lithograph|engraving)/.test(
      lowerTitle
    )
  ) {
    return null
  }

  const m = ii.extmetadata ?? {}
  const license = m['LicenseShortName']?.value ?? null
  return {
    url: ii.url,
    width: ii.width,
    height: ii.height,
    attribution: {
      artist: stripHtml(m['Artist']?.value ?? '') || null,
      license,
      license_url: m['LicenseUrl']?.value ?? null,
      source_url: m['DescriptionUrl']?.value ?? ii.url,
    },
  }
}

/** Resolve a species' Wikidata P18 photo, ready to add as a candidate. */
export async function fetchP18Candidate(
  scientificName: string
): Promise<WikimediaCandidate | null> {
  const fileTitle = await resolveP18FileTitle(scientificName)
  if (!fileTitle) return null
  return fetchCommonsCandidate(fileTitle)
}
