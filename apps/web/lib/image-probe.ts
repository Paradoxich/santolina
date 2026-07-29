/**
 * Cheap remote image validation and measurement.
 *
 * The image pass needs two things about each candidate photo before deciding
 * whether it is worth a vision call: is the URL actually alive and serving an
 * image, and how big is it. Both answers live in the first few kilobytes of the
 * file, so we fetch a byte range instead of the whole thing — measuring ~3,000
 * candidates costs a few MB of transfer rather than a few GB, and needs no
 * image-decoding dependency.
 *
 * Resolution matters because the vision model can't judge it: it sees a resized
 * copy, so a beautifully-composed 320px photo looks identical to a 2000px one
 * and would win a pick it can't actually deliver on an image-forward card.
 * Sharpness is the opposite case — it needs a full decode to measure, and the
 * model judges it well from the image itself, so we leave that to the prompt.
 *
 * SERVER-ONLY — used by data scripts, never imported into client components.
 */

export interface ImageDimensions {
  width: number
  height: number
}

export type ProbeResult =
  | {
      ok: true
      url: string
      width: number
      height: number
      bytes: number | null
    }
  /**
   * `transient` marks a failure that means "ask again later" and did not stop
   * meaning that after every retry was spent — a rate limit or an outage, not a
   * judgment on the photograph. Callers must not treat it as a rejection: the
   * candidate is of unknown quality, which is a different thing from bad.
   */
  | { ok: false; url: string; reason: string; transient?: boolean }

/**
 * Read pixel dimensions out of an image file header.
 *
 * Supports the formats Trefle's upstream sources actually serve (PlantNet is
 * almost entirely JPEG). Returns null when the format is unrecognised or the
 * header is truncated — callers treat that as "couldn't measure", not "broken".
 */
export function readImageDimensions(buf: Uint8Array): ImageDimensions | null {
  return (
    readPngDimensions(buf) ??
    readJpegDimensions(buf) ??
    readWebpDimensions(buf) ??
    readGifDimensions(buf)
  )
}

function readPngDimensions(buf: Uint8Array): ImageDimensions | null {
  // \x89PNG\r\n\x1a\n, then an IHDR chunk whose first 8 bytes are w/h (BE).
  if (buf.length < 24) return null
  if (
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return null
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function readJpegDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 < buf.length) {
    // Segments start with 0xFF; padding bytes of 0xFF are legal, so skip them.
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf[offset + 1]!
    if (marker === 0xff) {
      offset++
      continue
    }

    // Standalone markers carry no length field.
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2
      continue
    }
    // Start of scan — pixel data begins, no dimensions past here.
    if (marker === 0xda) return null

    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const length = view.getUint16(offset + 2)
    if (length < 2) return null

    // SOF0-SOF15 hold the frame dimensions. C4 (Huffman table), C8 (JPEG
    // extension) and CC (arithmetic coding) share the range but are not SOFs.
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc

    if (isStartOfFrame) {
      // Segment layout: length(2) precision(1) height(2) width(2)
      if (offset + 9 >= buf.length) return null
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      }
    }

    offset += 2 + length
  }
  return null
}

function readWebpDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 30) return null
  const tag = String.fromCharCode(...buf.slice(0, 4))
  const format = String.fromCharCode(...buf.slice(8, 12))
  if (tag !== 'RIFF' || format !== 'WEBP') return null

  const chunk = String.fromCharCode(...buf.slice(12, 16))
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

  if (chunk === 'VP8X') {
    // 24-bit little-endian, stored as (dimension - 1).
    const w = (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16)) + 1
    const h = (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16)) + 1
    return { width: w, height: h }
  }
  if (chunk === 'VP8 ') {
    // Lossy: 14-bit dimensions after the 3-byte start code 0x9d012a.
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    }
  }
  if (chunk === 'VP8L') {
    // Lossless: 14-bit each, packed across 4 bytes after the 0x2f signature.
    const bits =
      buf[21]! | (buf[22]! << 8) | (buf[23]! << 16) | (buf[24]! << 24)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    }
  }
  return null
}

function readGifDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 10) return null
  const sig = String.fromCharCode(...buf.slice(0, 3))
  if (sig !== 'GIF') return null
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
}

/** How many bytes to pull; JPEG SOF markers can sit past a large EXIF blob. */
const PROBE_BYTES = 65_536

/**
 * Descriptive User-Agent for image fetches.
 *
 * Not optional politeness: Wikimedia's upload host returns HTTP 400 to a range
 * request with no UA (which is what silently rejected every Wikimedia candidate
 * on the first run). Harmless for Trefle/PlantNet/CloudFront, required here.
 */
export const IMAGE_FETCH_UA =
  'Santolina/0.1 (garden planning app; hero-image sourcing) contact: ana.beverin@gmail.com'

/**
 * Validate a candidate image URL and measure it, transferring only the header.
 *
 * Servers that ignore Range return the full body; we cap what we read anyway.
 *
 * The header parse — not the content-type — decides whether this is an image.
 * Trefle's CloudFront-hosted images serve perfectly good JPEGs as
 * `application/octet-stream`, so gating on content-type would reject about a
 * thousand valid photos. Meanwhile the failure this is actually here to catch
 * (an HTML error page returned with HTTP 200, which today falls silently
 * through to the placeholder) can claim any content-type it likes but will
 * never parse as an image header. Content-type is only used to explain a
 * failure, never to cause one.
 */
async function probeImageOnce(
  url: string,
  timeoutMs = 10_000,
  probeBytes = PROBE_BYTES
): Promise<ProbeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      headers: {
        Range: `bytes=0-${probeBytes - 1}`,
        'User-Agent': IMAGE_FETCH_UA,
      },
      signal: controller.signal,
    })

    if (!res.ok && res.status !== 206) {
      return { ok: false, url, reason: `HTTP ${res.status}` }
    }

    const contentType = res.headers.get('content-type') ?? 'no content-type'
    const full = res.headers.get('content-range')?.split('/')[1]
    const bytes = full && full !== '*' ? Number(full) : null

    const buf = new Uint8Array(await res.arrayBuffer())
    const dims = readImageDimensions(buf.slice(0, probeBytes))
    if (!dims) {
      return { ok: false, url, reason: `unreadable header (${contentType})` }
    }
    if (dims.width < 1 || dims.height < 1) {
      return { ok: false, url, reason: 'zero dimension' }
    }

    return {
      ok: true,
      url,
      width: dims.width,
      height: dims.height,
      bytes: Number.isFinite(bytes) ? bytes : null,
    }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err)
    return { ok: false, url, reason }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Failures that say "ask again later", not "this photo is no good".
 *
 * The distinction is the whole point, and it is the house rule about a failed
 * fetch never looking like a negative result (trap 1). A rejected candidate is
 * silently dropped from the shortlist, the pick proceeds on what is left, and
 * the row is stamped `image_checked_at` — so a rate limit lasting ten seconds
 * permanently removes a photograph from consideration and nothing anywhere
 * reports that it happened. Sourcing nine Wikimedia photos on 2026-07-29 hit
 * this immediately: a different candidate dropped on each dry run, on 429s and
 * on truncated bodies, and only running it twice made it visible.
 *
 * An unreadable header is NOT in this set — retrying it fetches the same bytes
 * and fails identically. It is handled separately below, by reading further.
 */
type ProbeFailure = Extract<ProbeResult, { ok: false }>

function isTransient(result: ProbeResult): result is ProbeFailure {
  if (result.ok) return false
  const r = result.reason
  if (/^HTTP (429|5\d\d)$/.test(r)) return true
  if (r.startsWith('timed out')) return true
  // Network-level failures (DNS blips, socket resets) surface as the raw Error
  // message, so they cannot be enumerated — anything not recognised above is
  // treated as permanent, which keeps a genuine 404 from being retried twice.
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(r)
}

/**
 * An unreadable header from a server that says it is sending an image usually
 * means we did not read far enough, not that the file is broken.
 *
 * 64KB covers essentially every PlantNet photo, so this went unnoticed until
 * hand-sourced Wikimedia originals arrived on 2026-07-29: those carry large
 * EXIF, ICC and XMP blocks ahead of the SOF marker, and two of nine had their
 * dimensions at byte 71,816 and 135,539. The probe read 65,536 and reported
 * "unreadable header (image/jpeg)" — which reads as a corrupt file and is
 * really a truncated read, so both photos were silently dropped from the pick
 * they had been sourced for.
 *
 * A non-image content-type is excluded deliberately: an HTML error page served
 * as HTTP 200 will not become an image at 512KB, and re-reading it is pure
 * waste. This is the one case where content-type is allowed to influence
 * anything, and it only ever decides whether to spend MORE effort.
 */
const ESCALATED_PROBE_BYTES = 524_288

function wantsMoreBytes(result: ProbeResult): boolean {
  return !result.ok && /^unreadable header \(image\//.test(result.reason)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Validate and measure a candidate image, distinguishing the two ways this can
 * fail for reasons that have nothing to do with the photograph.
 *
 * Both exist to keep a fetch failure from reading as a verdict (trap 1). A
 * rejected candidate is dropped from the shortlist, the pick proceeds on what
 * is left, and the row is stamped `image_checked_at` — so without these, ten
 * seconds of rate limiting or 6KB of camera metadata permanently removes a
 * photograph from consideration and nothing reports that it happened.
 *
 *   1. Transient failure (429, 5xx, timeout, socket) — ask again, up to three
 *      attempts with a widening backoff. Deliberately modest: this runs over
 *      thousands of candidates behind a concurrency limit, and the point is to
 *      ride out a burst, not to grind against a host that is down.
 *   2. Unreadable image header — read further, once, then give up.
 *
 * A permanent failure still returns on the first attempt, so the 404s that
 * make up most real rejections cost exactly one request.
 */
export async function probeImage(
  url: string,
  timeoutMs = 10_000,
  attempts = 3,
  /** Injectable so the retry tests do not actually wait out a rate limit. */
  waitMs: (result: ProbeResult, attempt: number) => number = backoffMs
): Promise<ProbeResult> {
  let last = await probeImageOnce(url, timeoutMs)
  for (let i = 1; i < attempts && isTransient(last); i++) {
    await sleep(waitMs(last, i))
    last = await probeImageOnce(url, timeoutMs)
  }
  if (wantsMoreBytes(last)) {
    last = await probeImageOnce(url, timeoutMs, ESCALATED_PROBE_BYTES)
  }
  // Say so when the retries ran out on a transient failure, so the caller can
  // decline to draw a conclusion. Without this the result is indistinguishable
  // from a 404 by the time anyone reads it.
  if (isTransient(last)) return { ...last, transient: true }
  return last
}

/**
 * How long to wait before asking again.
 *
 * A rate limit and a socket blip are both transient and want very different
 * waits. 400/800ms rides out a blip and is nowhere near enough for Wikimedia
 * Commons, which 429s on a handful of sequential requests to the upload host
 * and stays angry for seconds: on 2026-07-30 nine of fourteen hand-sourced
 * Commons originals exhausted all three attempts inside 1.2s and were dropped.
 * Seconds cost nothing here — this path only runs when something already
 * failed, and the alternative is losing a photograph that was sourced by hand.
 */
export function backoffMs(result: ProbeResult, attempt: number): number {
  const rateLimited = !result.ok && result.reason === 'HTTP 429'
  return (rateLimited ? 2_000 : 400) * attempt
}

/** The four media types the Messages API accepts for image blocks. */
export type ImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'

export interface ImageBlob {
  data: string
  mediaType: ImageMediaType
}

const SUPPORTED_MEDIA: Record<string, ImageMediaType> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
}

// Anthropic caps image blocks near 5MB of base64; stay clear of it.
const MAX_IMAGE_BYTES = 4_500_000

/**
 * Rewrite a Wikimedia Commons original into a scaled rendition.
 *
 * Commons stores camera originals, and they are frequently far past what the
 * Messages API will accept as an image block — the Musa basjoo photo sourced
 * on 2026-07-29 is 13.7MB. Before this, an oversized candidate was fetched in
 * full, found too big, and dropped, so a photograph deliberately sourced for a
 * plant never reached the model that was choosing its hero. The whole download
 * was wasted to learn that.
 *
 * The vision pass only ever sees a resized copy anyway (which is why
 * resolution is measured from the header rather than judged by the model), so
 * a scaled rendition loses the model nothing. Commons derives these on demand
 * at a URL built from the original's own path:
 *
 *   .../commons/3/37/Name.jpg  →  .../commons/thumb/3/37/Name.jpg/1280px-Name.jpg
 *
 * THE WIDTH IS NOT FREE-FORM. Commons now serves only a fixed set of sizes and
 * answers anything else with HTTP 400 and a page pointing at the list — 1600,
 * 800, 1024, 320 and 2560 are all rejected, while 1280 and 1920 are fine. A
 * plausible-looking width is therefore a silent dead end, which is why the
 * allowed values are named here rather than passed in ad hoc. 1280px is the
 * default: comfortably detailed for a visual judgment, and ~460KB against the
 * 13.7MB original.
 *
 * Returns null for anything that is not an upload.wikimedia.org original —
 * including a URL that is already a thumb, which would otherwise nest.
 */
export const WIKIMEDIA_THUMB_WIDTHS = [120, 250, 500, 960, 1280, 1920] as const

/**
 * Above this, a Commons original is served as a rendition instead.
 *
 * Separate from MAX_IMAGE_BYTES, which is about what the Messages API accepts.
 * This one is about what a browser should be asked to pull: Commons stores
 * camera originals, and the Musa basjoo hero picked on 2026-07-29 is 13.7MB
 * for a card that renders it a few hundred pixels wide. `next/image` resizes
 * and caches, so this is a cold-cache and optimizer cost rather than a
 * per-visitor one, but it is a real cost paid for nothing.
 */
const MAX_DISPLAY_BYTES = 2_000_000

/**
 * What URL a hero should actually be STORED as.
 *
 * 1920 rather than the 1280 used for vision — this is the displayed image, not
 * a model's input, so it should still look right on a large screen.
 *
 * THREE OUTCOMES, NOT TWO, and the third is the point. An unreachable host
 * cannot be reported as "this hero is a sane size": that is a failed fetch
 * wearing the costume of a negative result (trap 1), and the first draft of
 * this function had exactly that bug — a HEAD that failed returned the URL
 * unchanged, so a run reported nine rows to fix, rewrote four, and then
 * reported zero remaining. The five it lost looked identical to five it had
 * checked and approved.
 */
export type DisplayUrlResult =
  | { kind: 'unchanged'; url: string }
  | { kind: 'rescaled'; url: string }
  | { kind: 'unmeasured'; url: string; reason: string }

export async function displayUrlFor(url: string): Promise<DisplayUrlResult> {
  let thumb: string | null
  try {
    thumb = wikimediaThumbUrl(url, 1920)
  } catch {
    return { kind: 'unchanged', url }
  }
  // Not a Commons original: nothing to rescale, and nothing to measure either.
  if (!thumb) return { kind: 'unchanged', url }

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': IMAGE_FETCH_UA },
    })
    if (!res.ok) {
      return { kind: 'unmeasured', url, reason: `HTTP ${res.status}` }
    }
    const declared = Number(res.headers.get('content-length'))
    if (!Number.isFinite(declared) || declared <= 0) {
      return { kind: 'unmeasured', url, reason: 'no content-length' }
    }
    return declared > MAX_DISPLAY_BYTES
      ? { kind: 'rescaled', url: thumb }
      : { kind: 'unchanged', url }
  } catch (err) {
    return {
      kind: 'unmeasured',
      url,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

export function wikimediaThumbUrl(url: string, width = 1280): string | null {
  if (!WIKIMEDIA_THUMB_WIDTHS.includes(width as never)) {
    throw new Error(
      `Commons rejects a ${width}px thumbnail with HTTP 400. ` +
        `Use one of: ${WIKIMEDIA_THUMB_WIDTHS.join(', ')}.`
    )
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.hostname !== 'upload.wikimedia.org') return null
  if (parsed.pathname.includes('/thumb/')) return null

  // /wikipedia/<project>/<a>/<ab>/<file>
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 5 || parts[0] !== 'wikipedia') return null
  const file = parts[parts.length - 1]!
  const head = parts.slice(0, 2)
  const hash = parts.slice(2, parts.length - 1)
  if (hash.length !== 2) return null

  parsed.pathname = `/${[...head, 'thumb', ...hash, file].join('/')}/${width}px-${file}`
  return parsed.toString()
}

/**
 * Download an image and return it base64-encoded for a Messages API image
 * block.
 *
 * Used for images Anthropic's URL fetcher can't reliably reach — chiefly
 * Wikimedia's upload host, which failed on both direct fetches and the model's
 * own URL fetch. Fetching here (with a real User-Agent) removes the dependency
 * on Anthropic reaching the origin. Returns null on any failure so the caller
 * can fall back or skip rather than crash.
 */
export async function fetchImageBlob(
  url: string,
  timeoutMs = 15_000
): Promise<ImageBlob | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': IMAGE_FETCH_UA },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
    // CloudFront serves valid JPEGs as octet-stream, so default to JPEG.
    const mediaType = SUPPORTED_MEDIA[ct] ?? 'image/jpeg'
    // Check the advertised size before reading the body: the oversized case is
    // exactly the one where downloading it is most expensive and least useful.
    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      const thumb = wikimediaThumbUrl(url)
      if (thumb) return await fetchImageBlob(thumb, timeoutMs)
    }

    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      // Too big to send. For Commons that is a solvable problem, not a dead
      // end — ask for a scaled rendition instead of discarding the candidate.
      const thumb = wikimediaThumbUrl(url)
      return thumb ? await fetchImageBlob(thumb, timeoutMs) : null
    }
    return { data: buf.toString('base64'), mediaType }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
