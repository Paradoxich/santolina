import { describe, expect, it } from 'vitest'
import { readImageDimensions } from './image-probe'

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
