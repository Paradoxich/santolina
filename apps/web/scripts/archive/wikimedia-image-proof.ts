/**
 * PROOF OF CONCEPT — is a Wikimedia photo a better hero than our current pick?
 *
 * The vision pass can only choose among photos Trefle surfaced, which are ~89%
 * PlantNet identification snapshots. Wikimedia Commons is where photographers
 * upload their best work, and Wikidata's P18 property is a hand-picked "the
 * image" per species. This asks, for a sample of plants: resolve the species'
 * Wikidata P18 image, put it head to head against our current curated pick, and
 * let the vision model judge — then emit a side-by-side page so a human can too.
 *
 * WRITES NOTHING to the database. It only reads the current pick and produces
 * reports/wikimedia-proof.html. If the Wikimedia photos win, the follow-up work
 * is real (an image_source + image_attribution column, feeding Commons images
 * into image_candidates, re-running the pass) — this exists to decide whether
 * that work is worth doing.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/archive/wikimedia-image-proof.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/archive/wikimedia-image-proof.ts --limit 20
 *   open reports/wikimedia-proof.html
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../../lib/supabase-admin'
import { getAnthropicClient, VISION_MODEL } from '../../lib/anthropic-client'
import { fetchAllRows } from '../../lib/paginate'
import { probeImage } from '../../lib/image-probe'

// Wikimedia asks API clients to identify themselves with a descriptive UA and a
// contact — anonymous or generic UAs get rate-limited or blocked.
const UA =
  'Santolina/0.1 (garden planning app; hero-image sourcing evaluation) contact: ana.beverin@gmail.com'
const HTML_OUT = join(process.cwd(), 'reports', 'wikimedia-proof.html')
const INTER_CALL_DELAY_MS = 400

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 2) => String(n).padStart(w, ' ')
const stripHtml = (s: string) => (s ?? '').replace(/<[^>]+>/g, '').trim()

interface Attribution {
  license: string | null
  artist: string | null
  attributionRequired: boolean
}

interface WikimediaImage {
  // A bounded thumbnail (Commons resizes on request) — used for both display
  // and the model, so payloads stay small regardless of the original's size.
  displayUrl: string
  // The original's dimensions, kept for the "this is a high-res source" signal.
  width: number
  height: number
  attribution: Attribution
}

// The four media types the Messages API accepts for image blocks.
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

interface ImageBlob {
  data: string
  mediaType: ImageMediaType
}

const SUPPORTED_MEDIA: Record<string, ImageMediaType> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
}

/**
 * Download an image and return it base64-encoded.
 *
 * The pass sends images to the model as base64 rather than by URL because
 * Anthropic's URL fetcher is unreliable — it failed on both Wikimedia and
 * PlantNet URLs that this process can fetch fine — and Wikimedia additionally
 * requires a descriptive User-Agent. Fetching here removes the dependency on
 * Anthropic reaching the origin entirely.
 */
async function fetchAsBase64(url: string): Promise<ImageBlob | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!r.ok) return null
    const ct = (r.headers.get('content-type') ?? '').split(';')[0]!.trim()
    // CloudFront serves valid JPEGs as octet-stream, so trust JPEG by default.
    const mediaType = SUPPORTED_MEDIA[ct] ?? 'image/jpeg'
    const buf = Buffer.from(await r.arrayBuffer())
    // Keep clear of Anthropic's ~5MB-per-image base64 ceiling.
    if (buf.byteLength > 4_500_000) return null
    return { data: buf.toString('base64'), mediaType }
  } catch {
    return null
  }
}

/** scientific name -> Wikidata taxon (P225) -> P18 image file title. */
async function resolveP18(scientificName: string): Promise<string | null> {
  const q = `SELECT ?image WHERE { ?item wdt:P225 "${scientificName}". ?item wdt:P18 ?image. } LIMIT 1`
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
  // P18 is a Special:FilePath URL ending in the file name; decode it.
  return decodeURIComponent(value.split('/').pop() ?? '')
}

/** Commons imageinfo -> real image URL + attribution, so a CC-BY credit exists. */
async function fetchCommonsImage(
  fileTitle: string
): Promise<WikimediaImage | null> {
  // iiurlwidth asks Commons for a resized thumbnail URL (thumburl) so we never
  // pull a 6000px original just to judge and display it.
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    '&iiprop=url|size|extmetadata&iiurlwidth=1200&titles=' +
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
        thumburl?: string
        width?: number
        height?: number
        extmetadata?: Record<string, { value?: string }>
      }
    | undefined
  if (!ii?.url || !ii.width || !ii.height) return null
  const m = ii.extmetadata ?? {}
  return {
    displayUrl: ii.thumburl ?? ii.url,
    width: ii.width,
    height: ii.height,
    attribution: {
      license: m['LicenseShortName']?.value ?? null,
      artist: stripHtml(m['Artist']?.value ?? '') || null,
      attributionRequired: m['AttributionRequired']?.value === 'true',
    },
  }
}

interface Verdict {
  winner: 'current' | 'wikimedia' | 'tie'
  reason: string
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    winner: { type: 'string', enum: ['current', 'wikimedia', 'tie'] },
    reason: { type: 'string' },
  },
  required: ['winner', 'reason'],
  additionalProperties: false,
} as const

/** Ask the vision model which of the two photos is the better hero. */
async function judge(
  common: string,
  scientific: string,
  current: ImageBlob,
  wikimedia: ImageBlob
): Promise<Verdict | null> {
  const client = getAnthropicClient()
  const res = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 4096,
    output_config: {
      effort: 'medium',
      format: {
        type: 'json_schema',
        schema: VERDICT_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: current.mediaType,
              data: current.data,
            },
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: wikimedia.mediaType,
              data: wikimedia.data,
            },
          },
          {
            type: 'text',
            text: `Two candidate hero photos for ${common} (${scientific}) in a garden planning app, shown full-bleed on a browsing card. Image 1 is the "current" pick; image 2 is the "wikimedia" candidate.

Pick the better hero: most beautiful AND most representative of the species — plant clearly the subject and filling the frame, blooms visible and in focus where relevant, natural setting, uncluttered background, no pots/labels/hands/specimen sheets. If they are genuinely comparable, answer "tie".

Judge only what is in the frames, not what a good photo would contain. Give a one-sentence reason naming the deciding difference.`,
          },
        ],
      },
    ],
  })
  const text = res.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') return null
  try {
    return JSON.parse(text.text) as Verdict
  } catch {
    return null
  }
}

interface Row {
  common_name: string
  scientific_name: string
  image_url_curated: string
}

function parseLimit(): number {
  const args = process.argv.slice(2)
  const i = args.indexOf('--limit')
  if (i < 0) return 10
  const n = parseInt(args[i + 1] ?? '', 10)
  if (!Number.isFinite(n) || n < 1)
    throw new Error('--limit must be a positive integer')
  return n
}

interface Result {
  common: string
  scientific: string
  current: { url: string; dims: string }
  wikimedia: WikimediaImage | null
  verdict: Verdict | null
  note?: string
}

async function main() {
  const limit = parseLimit()
  const supabase = getSupabaseAdmin()

  // Medium-confidence plants are the "ok but maybe better" cases — the exact
  // population this is meant to test. Ordered by id for a stable sample.
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase
      .from('plants')
      .select('common_name, scientific_name, image_url_curated')
      .eq('image_pick_confidence', 'medium')
      .not('scientific_name', 'is', null)
      .not('image_url_curated', 'is', null)
      .order('id')
      .range(from, to)
  )
  const sample = rows.slice(0, limit)

  console.log(
    `Comparing ${sample.length} current pick(s) against Wikimedia P18.\n`
  )

  const results: Result[] = []
  let wins = 0
  let ties = 0
  let losses = 0
  let noWikimedia = 0

  for (const [i, plant] of sample.entries()) {
    const label = `${pad(i + 1)}/${sample.length} ${plant.common_name}`

    const fileTitle = await resolveP18(plant.scientific_name)
    const wikimedia = fileTitle ? await fetchCommonsImage(fileTitle) : null

    const currentProbe = await probeImage(plant.image_url_curated)
    const currentDims = currentProbe.ok
      ? `${currentProbe.width}x${currentProbe.height}`
      : `unmeasured (${currentProbe.reason})`

    if (!wikimedia) {
      console.log(`${label} — no Wikidata P18 image`)
      results.push({
        common: plant.common_name,
        scientific: plant.scientific_name,
        current: { url: plant.image_url_curated, dims: currentDims },
        wikimedia: null,
        verdict: null,
        note: 'no Wikidata P18 image',
      })
      noWikimedia++
      await sleep(INTER_CALL_DELAY_MS)
      continue
    }

    // Fetch both images ourselves and judge from base64 — see fetchAsBase64.
    // A per-plant failure here records a note and moves on rather than
    // crashing the run (a single un-fetchable image took the whole thing down
    // when this judged by URL).
    let verdict: Verdict | null = null
    let note: string | undefined
    try {
      const [currentBlob, wikimediaBlob] = await Promise.all([
        fetchAsBase64(plant.image_url_curated),
        fetchAsBase64(wikimedia.displayUrl),
      ])
      if (!currentBlob || !wikimediaBlob) {
        note = `couldn't fetch ${!currentBlob ? 'current' : 'wikimedia'} image for comparison`
      } else {
        verdict = await judge(
          plant.common_name,
          plant.scientific_name,
          currentBlob,
          wikimediaBlob
        )
      }
    } catch (err) {
      note = `comparison failed: ${err instanceof Error ? err.message : String(err)}`
    }

    if (verdict?.winner === 'wikimedia') wins++
    else if (verdict?.winner === 'tie') ties++
    else if (verdict?.winner === 'current') losses++

    console.log(
      `${label} — ${verdict?.winner ?? note ?? 'no verdict'}` +
        ` (wikimedia ${wikimedia.width}x${wikimedia.height}, ${wikimedia.attribution.license ?? 'license?'})`
    )
    results.push({
      common: plant.common_name,
      scientific: plant.scientific_name,
      current: { url: plant.image_url_curated, dims: currentDims },
      wikimedia,
      verdict,
      note,
    })
    await sleep(INTER_CALL_DELAY_MS)
  }

  writeReport(results, { wins, ties, losses, noWikimedia })

  console.log(
    `\nWikimedia better: ${wins}, tie: ${ties}, current better: ${losses}, no P18: ${noWikimedia}.`
  )
}

function writeReport(
  results: Result[],
  tally: { wins: number; ties: number; losses: number; noWikimedia: number }
) {
  const esc = (s: string) =>
    s.replace(
      /[&<>"]/g,
      (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string
    )

  const card = (r: Result) => {
    const badge = r.verdict
      ? `<span class="verdict ${r.verdict.winner}">${r.verdict.winner}</span>`
      : `<span class="verdict none">${esc(r.note ?? 'no verdict')}</span>`
    const attr = r.wikimedia
      ? `${esc(r.wikimedia.attribution.license ?? 'license unknown')} · ${esc(r.wikimedia.attribution.artist ?? 'artist unknown')}`
      : ''
    const wikNote = r.note ? ` <span class="none">(${esc(r.note)})</span>` : ''
    const wikPane = r.wikimedia
      ? `<div class="pane"><h4>wikimedia — ${r.wikimedia.width}x${r.wikimedia.height}${wikNote}</h4>
           <img loading="lazy" src="${r.wikimedia.displayUrl}">
           <p class="attr">${attr}</p></div>`
      : `<div class="pane"><h4>wikimedia</h4><span class="none">no Wikidata P18 image for this species</span></div>`
    return `<article>
  <header><h3>${esc(r.common)}</h3> <em>${esc(r.scientific)}</em> ${badge}</header>
  ${r.verdict ? `<p class="reason">${esc(r.verdict.reason)}</p>` : ''}
  <div class="panes">
    <div class="pane"><h4>current — ${esc(r.current.dims)}</h4><img loading="lazy" src="${r.current.url}"></div>
    ${wikPane}
  </div>
</article>`
  }

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Wikimedia vs current — hero image proof</title>
<style>
  :root { color-scheme: light dark; --line: #8883; }
  body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem 5rem; }
  h1 { margin: 0 0 .25rem; }
  .lede { opacity: .75; margin: 0 0 2rem; }
  article { border: 1px solid var(--line); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
  header { display: flex; gap: .6rem; align-items: baseline; flex-wrap: wrap; }
  header h3 { margin: 0; }
  .verdict { margin-left: auto; border: 1px solid var(--line); border-radius: 99px; padding: .1rem .6rem; font-size: .8rem; }
  .verdict.wikimedia { border-color: #3a825a; color: #4caf7d; }
  .verdict.current { border-color: #b4483c; color: #d46b60; }
  .verdict.tie { border-color: #b8860b; }
  .reason { opacity: .85; margin: .4rem 0 .75rem; }
  .panes { display: flex; gap: 1rem; flex-wrap: wrap; }
  .pane { flex: 1 1 320px; }
  .pane h4 { margin: 0 0 .35rem; font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; opacity: .6; }
  .pane img { width: 100%; max-height: 440px; object-fit: cover; border-radius: 6px; background: #8881; display: block; }
  .attr { font-size: .75rem; opacity: .6; margin: .35rem 0 0; }
  .none { opacity: .55; font-style: italic; }
</style>
<h1>Wikimedia vs current — hero image proof</h1>
<p class="lede">${results.length} medium-confidence plant(s). Model verdict: <strong>${tally.wins}</strong> Wikimedia better, ${tally.ties} tie, ${tally.losses} current better, ${tally.noWikimedia} with no P18 image. Nothing was written to the database. Wikimedia photos carry a licence + artist credit — attribution is required before any of these could ship.</p>
${results.map(card).join('\n')}`

  mkdirSync(join(process.cwd(), 'reports'), { recursive: true })
  writeFileSync(HTML_OUT, html)
  console.log(`\nProof page: ${HTML_OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
