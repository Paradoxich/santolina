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

/**
 * Does this Commons file title depict the STRAIGHT SPECIES asked for?
 *
 * The search fallback below is the only place this codebase takes a photo it
 * was not handed by name, so this is where wrong-taxon risk lives. Searching
 * Commons for `Filipendula purpurea` returns, among ten hits: the hybrid
 * `Filipendula × purpurea`, three files of the white cultivar
 * `F. purpurea 'Alba'`, and `F. purpurea var. auriculata`. Every one of those
 * is a DIFFERENT plant to a careful reader, and all of them contain the
 * binomial, so a substring test is not enough.
 *
 * Rejected: a hybrid marker, a quoted cultivar epithet, and any infraspecific
 * rank. Accepted: the binomial with surrounding words, since a good photo is
 * often titled "(Filipendula purpurea close-up in Nikkō, Japan)".
 *
 * KNOWN LIMIT, carried deliberately: a cultivar written WITHOUT quotes
 * ("Filipendula purpurea Elegans 1zz.jpg") passes. There is no cultivar
 * registry here to test against, and the damage is bounded — a cultivar of the
 * right species is a far smaller error than a different species, and the vision
 * pass still judges the photograph afterwards. `rankSpeciesFileTitles` below
 * puts the clean binomial first so this case only ever wins when nothing
 * better exists.
 */
export function isStraightSpeciesFile(
  fileTitle: string,
  scientificName: string
): boolean {
  const title = fileTitle
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
  const [genus, epithet] = scientificName.toLowerCase().split(/\s+/)
  if (!genus || !epithet) return false

  // A different taxon that still contains the binomial.
  if (/(?:×|&times;|\s+x\s+)/.test(title)) return false
  if (/['"‘’“”]/.test(title)) return false
  if (/\b(?:var|subsp|ssp|cv|f)\.\s/.test(title)) return false

  return new RegExp(`\\b${genus}\\s+${epithet}\\b`).test(title)
}

/** Cleanest match first: the bare binomial beats the binomial in a sentence. */
export function rankSpeciesFileTitles(
  titles: string[],
  scientificName: string
): string[] {
  const bare = scientificName.toLowerCase()
  return [...titles].sort((a, b) => {
    const norm = (t: string) =>
      t
        .replace(/^File:/i, '')
        .replace(/\.[a-z0-9]+$/i, '')
        .toLowerCase()
        .trim()
    return (norm(a) === bare ? 0 : 1) - (norm(b) === bare ? 0 : 1)
  })
}

/** Commons full-text search, file namespace only. Titles keep their prefix. */
export async function searchCommonsFileTitles(
  scientificName: string,
  limit = 10
): Promise<string[]> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search' +
    `&srnamespace=6&srlimit=${limit}&srsearch=${encodeURIComponent(scientificName)}`
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) return []
  const j = (await r.json()) as {
    query?: { search?: { title?: string }[] }
  }
  return (j.query?.search ?? [])
    .map((s) => s.title ?? '')
    .filter((t): t is string => Boolean(t))
}

/**
 * A species' best Commons photo: the designated one, or the best search hit.
 *
 * WHY THE FALLBACK EXISTS. Wikidata's P18 is a hand-curated "the image" per
 * taxon and most species have none — round 12's `Filipendula purpurea` did
 * not, so `fetchP18Candidate` returned null and the feeder reported "no usable
 * Wikidata P18 photo". Read as "no photo exists" that is simply false: Commons
 * held ten files, one of them a 3072x2304 CC BY 3.0 photograph of the straight
 * species. **A missing designation is not a missing photograph**, and letting
 * the narrower answer stand for the broader one is the shape this project
 * keeps paying for (trap family A in `docs/database-log.md`).
 *
 * The `via` field is returned rather than logged away because the two routes
 * carry different confidence: P18 is somebody's considered pick for the taxon,
 * a search hit is this function's guess filtered by `isStraightSpeciesFile`.
 */
export async function fetchSpeciesCandidate(
  scientificName: string
): Promise<{ candidate: WikimediaCandidate; via: 'p18' | 'search' } | null> {
  const p18 = await fetchP18Candidate(scientificName)
  if (p18) return { candidate: p18, via: 'p18' }

  const titles = rankSpeciesFileTitles(
    (await searchCommonsFileTitles(scientificName)).filter((t) =>
      isStraightSpeciesFile(t, scientificName)
    ),
    scientificName
  )
  for (const title of titles) {
    const candidate = await fetchCommonsCandidate(title.replace(/^File:/i, ''))
    if (candidate) return { candidate, via: 'search' }
  }
  return null
}
