import { afterEach, describe, expect, it } from 'vitest'
import {
  backoffMs,
  probeImage,
  readImageDimensions,
  wikimediaThumbUrl,
} from './image-probe'

/**
 * These headers are hand-built rather than fixtures because the point of the
 * parser is that it reads dimensions out of the first few bytes without
 * decoding — so the first few bytes are the entire contract.
 */

function png(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24)
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(buf.buffer)
  view.setUint32(8, 13) // IHDR chunk length
  buf.set([0x49, 0x48, 0x44, 0x52], 12) // "IHDR"
  view.setUint32(16, width)
  view.setUint32(20, height)
  return buf
}

/** JPEG with `leadingSegments` filler segments before the SOF0. */
function jpeg(
  width: number,
  height: number,
  { marker = 0xc0, leadingSegments = 0 } = {}
): Uint8Array {
  const bytes: number[] = [0xff, 0xd8]
  for (let i = 0; i < leadingSegments; i++) {
    // An APP0-style segment: marker, length 4, two payload bytes.
    bytes.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00)
  }
  bytes.push(
    0xff,
    marker,
    0x00,
    0x11, // segment length
    0x08, // sample precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff
  )
  // Pad so the parser's bounds checks have room to read the segment.
  bytes.push(...new Array(16).fill(0x00))
  return new Uint8Array(bytes)
}

function gif(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(10)
  buf.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0) // "GIF89a"
  const view = new DataView(buf.buffer)
  view.setUint16(6, width, true)
  view.setUint16(8, height, true)
  return buf
}

function webpVp8x(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(30)
  buf.set([0x52, 0x49, 0x46, 0x46], 0) // "RIFF"
  buf.set([0x57, 0x45, 0x42, 0x50], 8) // "WEBP"
  buf.set([0x56, 0x50, 0x38, 0x58], 12) // "VP8X"
  const w = width - 1
  const h = height - 1
  buf.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24)
  buf.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27)
  return buf
}

describe('readImageDimensions', () => {
  it('reads PNG dimensions from the IHDR chunk', () => {
    expect(readImageDimensions(png(1600, 1197))).toEqual({
      width: 1600,
      height: 1197,
    })
  })

  it('reads JPEG dimensions from SOF0', () => {
    expect(readImageDimensions(jpeg(900, 883))).toEqual({
      width: 900,
      height: 883,
    })
  })

  it('skips leading segments to find the SOF', () => {
    // Real PlantNet JPEGs carry EXIF/JFIF blocks before the frame header; the
    // parser has to walk segment lengths rather than assume a fixed offset.
    expect(
      readImageDimensions(jpeg(800, 1067, { leadingSegments: 6 }))
    ).toEqual({ width: 800, height: 1067 })
  })

  it('reads progressive JPEGs (SOF2)', () => {
    expect(readImageDimensions(jpeg(1067, 800, { marker: 0xc2 }))).toEqual({
      width: 1067,
      height: 800,
    })
  })

  it('does not mistake a Huffman table (0xC4) for a frame header', () => {
    // 0xC4 sits inside the SOF marker range but carries no dimensions; reading
    // it as one would yield garbage sizes and skew the resolution ranking.
    expect(readImageDimensions(jpeg(640, 480, { marker: 0xc4 }))).toBeNull()
  })

  it('reads GIF dimensions (little-endian)', () => {
    expect(readImageDimensions(gif(300, 200))).toEqual({
      width: 300,
      height: 200,
    })
  })

  it('reads WebP VP8X dimensions (stored as size minus one)', () => {
    expect(readImageDimensions(webpVp8x(1024, 768))).toEqual({
      width: 1024,
      height: 768,
    })
  })

  it('returns null for a non-image body', () => {
    // The failure this guards: an HTML error page served with HTTP 200, which
    // currently falls through to the placeholder without anyone noticing.
    const html = new TextEncoder().encode(
      '<!doctype html><html><body>404 Not Found</body></html>'
    )
    expect(readImageDimensions(html)).toBeNull()
  })

  it('returns null for a truncated header rather than guessing', () => {
    expect(readImageDimensions(png(100, 100).slice(0, 12))).toBeNull()
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8]))).toBeNull()
  })
})

/**
 * Retry behaviour. The rule these pin down is the house rule about a failed
 * fetch never looking like a negative result: a rate limit must not silently
 * remove a photograph from the shortlist, and a genuine 404 must not cost
 * three round trips on every one of thousands of candidates.
 */
describe('probeImage retries', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /** Queue of responses, one per attempt. */
  function stubFetch(responses: Array<() => Response>) {
    let i = 0
    const calls = { count: 0 }
    globalThis.fetch = (async () => {
      calls.count++
      const make = responses[Math.min(i++, responses.length - 1)]!
      return make()
    }) as typeof fetch
    return calls
  }

  const ok = () =>
    new Response(png(800, 600).slice().buffer as ArrayBuffer, {
      status: 206,
      headers: { 'content-type': 'image/png' },
    })
  const rateLimited = () => new Response('slow down', { status: 429 })
  const notFound = () => new Response('nope', { status: 404 })
  const truncatedJpeg = () =>
    new Response(new Uint8Array([0xff, 0xd8]).buffer as ArrayBuffer, {
      status: 206,
      headers: { 'content-type': 'image/jpeg' },
    })
  const errorPage = () =>
    new Response('<html>error</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })

  /** Real backoff for a 429 is seconds; no test should sit through it. */
  const noWait = () => 0

  it('retries a 429 and succeeds on a later attempt', async () => {
    const calls = stubFetch([rateLimited, rateLimited, ok])
    const r = await probeImage('https://example.test/a.png', 10_000, 3, noWait)
    expect(r.ok).toBe(true)
    expect(calls.count).toBe(3)
  })

  it('waits seconds, not milliseconds, before re-asking a rate limiter', async () => {
    // Commons 429s on a handful of sequential requests and stays angry for
    // seconds. The original 400/800ms exhausted all three attempts inside 1.2s,
    // which is how nine hand-sourced photos were dropped on 2026-07-30.
    stubFetch([rateLimited, ok])
    const waits: number[] = []
    await probeImage('https://example.test/a.png', 10_000, 3, (r, i) => {
      waits.push(backoffMs(r, i))
      return 0
    })
    expect(waits[0]).toBeGreaterThanOrEqual(2_000)
  })

  it('marks an exhausted transient failure as transient, not as a rejection', async () => {
    // The distinction the caller acts on: pick-plant-images defers a plant
    // whose pool is incomplete instead of judging what happened to load and
    // stamping the row, which would retire the photo permanently.
    stubFetch([rateLimited])
    const r = await probeImage('https://example.test/e.jpg', 10_000, 3, noWait)
    expect(r.ok === false && r.transient).toBe(true)
  })

  it('does not mark a real rejection as transient', async () => {
    stubFetch([notFound])
    const r = await probeImage('https://example.test/c.jpg', 10_000, 3, noWait)
    expect(r.ok === false && r.transient).toBeUndefined()
  })

  it('re-reads further when an image header is unreadable, rather than rejecting', async () => {
    // The real case: a Wikimedia original whose SOF sits past 64KB of EXIF.
    // One escalated read, not a retry of the same range.
    const calls = stubFetch([truncatedJpeg, ok])
    const r = await probeImage('https://example.test/b.jpg')
    expect(r.ok).toBe(true)
    expect(calls.count).toBe(2)
  })

  it('escalates only once, and only for an image content-type', async () => {
    const calls = stubFetch([truncatedJpeg])
    const r = await probeImage('https://example.test/f.jpg')
    expect(r.ok).toBe(false)
    expect(calls.count).toBe(2)
  })

  it('does not retry a 404 — that is an answer, not a hiccup', async () => {
    const calls = stubFetch([notFound])
    const r = await probeImage('https://example.test/c.jpg')
    expect(r.ok).toBe(false)
    expect(calls.count).toBe(1)
  })

  it('does not retry an HTML error page served as 200', async () => {
    const calls = stubFetch([errorPage])
    const r = await probeImage('https://example.test/d.jpg')
    expect(r.ok).toBe(false)
    expect(calls.count).toBe(1)
  })

  it('gives up after the attempt limit and reports the real reason', async () => {
    const calls = stubFetch([rateLimited])
    const r = await probeImage('https://example.test/e.jpg', 10_000, 3, noWait)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toBe('HTTP 429')
    expect(calls.count).toBe(3)
  })
})

describe('wikimediaThumbUrl', () => {
  const original =
    'https://upload.wikimedia.org/wikipedia/commons/3/37/Musa_basjoo_-_G%C3%B6ttingen.jpg'

  it('builds the Commons thumb path from an original', () => {
    expect(wikimediaThumbUrl(original)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Musa_basjoo_-_G%C3%B6ttingen.jpg/1280px-Musa_basjoo_-_G%C3%B6ttingen.jpg'
    )
  })

  it('refuses a URL that is already a thumb, so the rewrite cannot nest', () => {
    expect(wikimediaThumbUrl(wikimediaThumbUrl(original)!)).toBeNull()
  })

  it('leaves non-Commons hosts alone', () => {
    expect(
      wikimediaThumbUrl('https://bs.plantnet.org/image/o/abc123')
    ).toBeNull()
  })

  it('returns null rather than throwing on a malformed URL', () => {
    expect(wikimediaThumbUrl('not a url')).toBeNull()
  })

  it('refuses a width Commons does not serve, loudly', () => {
    // Commons answers an unlisted width with HTTP 400, so a plausible-looking
    // 1600 would be a silent dead end rather than a smaller picture.
    expect(() => wikimediaThumbUrl(original, 1600)).toThrow(/HTTP 400/)
  })
})
