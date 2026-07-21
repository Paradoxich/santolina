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
  | { ok: false; url: string; reason: string }

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
export async function probeImage(
  url: string,
  timeoutMs = 10_000
): Promise<ProbeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${PROBE_BYTES - 1}` },
      signal: controller.signal,
    })

    if (!res.ok && res.status !== 206) {
      return { ok: false, url, reason: `HTTP ${res.status}` }
    }

    const contentType = res.headers.get('content-type') ?? 'no content-type'
    const full = res.headers.get('content-range')?.split('/')[1]
    const bytes = full && full !== '*' ? Number(full) : null

    const buf = new Uint8Array(await res.arrayBuffer())
    const dims = readImageDimensions(buf.slice(0, PROBE_BYTES))
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
