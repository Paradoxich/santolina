// CLIENT-ONLY — browser-side photo preparation for diary uploads.
//
// Every picked photo is decoded, downscaled, and re-encoded to JPEG before
// it leaves the browser. One step solves three problems at once (see
// docs/architecture.md §29):
// - size: server actions cap at 4mb (Vercel's request ceiling is ~4.5mb),
//   while phone photos routinely exceed it; a 2000px JPEG lands well under
// - format: HEIC uploads fine as bytes but neither most browsers nor the
//   Vercel image optimizer can render it; re-encoding normalizes everything
//   to JPEG (browsers that can't decode a format get a clear error instead
//   of a silently broken photo)
// - privacy: canvas re-encoding drops EXIF metadata, including the GPS
//   position of the user's home. Browsers apply EXIF rotation during decode,
//   so orientation survives the strip.

/** Long-edge cap. 2000px keeps a photo crisp at any size the diary renders. */
const MAX_EDGE_PX = 2000
const JPEG_QUALITY = 0.85

export class UnreadablePhotoError extends Error {
  constructor(fileName: string) {
    super(`Couldn't read ${fileName}. Try a JPG or PNG.`)
    this.name = 'UnreadablePhotoError'
  }
}

function jpegName(originalName: string): string {
  const stem = originalName.replace(/\.[^.]+$/, '')
  return `${stem || 'photo'}.jpg`
}

/**
 * Decodes, downscales, and re-encodes one picked file to a JPEG File.
 * Throws UnreadablePhotoError when the browser can't decode the format
 * (e.g. HEIC outside Safari) so the composer can show a friendly message.
 */
export async function processPhotoFile(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = document.createElement('img')
    image.src = objectUrl
    try {
      await image.decode()
    } catch {
      throw new UnreadablePhotoError(file.name)
    }

    const scale = Math.min(
      1,
      MAX_EDGE_PX / Math.max(image.naturalWidth, image.naturalHeight)
    )
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new UnreadablePhotoError(file.name)
    context.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    if (!blob) throw new UnreadablePhotoError(file.name)

    return new File([blob], jpegName(file.name), { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export interface ProcessedPhotos {
  files: File[]
  /** Names of picked files the browser couldn't decode, in pick order. */
  failedNames: string[]
}

/** Processes a batch, keeping decodable photos and collecting failures. */
export async function processPhotoFiles(
  picked: File[]
): Promise<ProcessedPhotos> {
  const results = await Promise.allSettled(picked.map(processPhotoFile))
  const files: File[] = []
  const failedNames: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') files.push(result.value)
    else failedNames.push(picked[i]!.name)
  })
  return { files, failedNames }
}
