// SERVER-ONLY — diary photo storage helpers for the private diary-photos
// bucket. The database stores bucket-relative paths ({gardenId}/{plantId}/
// {timestamp}-{filename}); renderable URLs are short-lived signed URLs
// generated per request through the session client, so the storage select
// policy (garden ownership) is what actually gates access. See
// docs/architecture.md §28.
import type { SupabaseClient } from '@supabase/supabase-js'

export const DIARY_PHOTOS_BUCKET = 'diary-photos'

/** Long enough for any single page view; short enough that a leaked URL dies. */
const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * Normalizes a stored photo_urls value to a bucket-relative storage path.
 * Rows written before the private-bucket cutover stored the full public URL
 * (percent-encoded); rows written after store the bare path. Kept
 * permanently so pre-cutover rows never need a data migration.
 */
export function toDiaryPhotoPath(stored: string): string {
  const marker = `/${DIARY_PHOTOS_BUCKET}/`
  const index = stored.indexOf(marker)
  if (index === -1) return stored
  const encoded = stored.slice(index + marker.length)
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

/**
 * Signs one list of photo URLs per entry, preserving shape, in a single
 * storage round trip. Photos whose objects can no longer be signed (e.g.
 * removed from the bucket out of band) are dropped rather than rendered
 * as broken images.
 */
export async function signDiaryPhotoUrls(
  db: SupabaseClient,
  storedLists: string[][]
): Promise<string[][]> {
  const paths = [...new Set(storedLists.flat().map(toDiaryPhotoPath))]
  if (paths.length === 0) return storedLists.map(() => [])

  const { data, error } = await db.storage
    .from(DIARY_PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
  if (error) throw new Error(`Failed to sign photo URLs: ${error.message}`)

  const signedByPath = new Map(
    (data ?? [])
      .filter((row) => row.path && row.signedUrl)
      .map((row) => [row.path as string, row.signedUrl])
  )

  return storedLists.map((list) =>
    list
      .map((stored) => signedByPath.get(toDiaryPhotoPath(stored)))
      .filter((url): url is string => Boolean(url))
  )
}

/**
 * Best-effort removal of the given entries' photo objects. Callers invoke
 * this after the owning rows are already deleted, so a storage failure is
 * swallowed (an orphaned object in a private bucket costs storage, not
 * privacy) rather than failing a delete that already happened.
 */
export async function removeDiaryPhotos(
  db: SupabaseClient,
  storedLists: string[][]
): Promise<void> {
  const paths = [...new Set(storedLists.flat().map(toDiaryPhotoPath))]
  if (paths.length === 0) return
  await db.storage.from(DIARY_PHOTOS_BUCKET).remove(paths)
}
