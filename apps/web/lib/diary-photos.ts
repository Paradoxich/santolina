// SERVER-ONLY — diary photo storage helpers for the private diary-photos
// bucket. The database stores bucket-relative paths ({gardenId}/{plantId}/
// {timestamp}-{filename}); renderable URLs are short-lived signed URLs
// generated per request through the session client, so the storage select
// policy (garden ownership) is what actually gates access. See
// docs/architecture.md#diary-photos-private.
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
 * The paths a removal will ask Storage to delete: normalized (pre-cutover
 * rows store full URLs), deduplicated, order preserved. Split out from
 * removeDiaryPhotos so the normalization has one home and can be asserted
 * without a Storage client.
 */
export function planPhotoRemoval(storedLists: (string[] | null)[]): string[] {
  return [
    ...new Set(storedLists.flatMap((list) => list ?? []).map(toDiaryPhotoPath)),
  ]
}

/** What a removal attempt is able to tell its caller afterwards. */
export interface PhotoRemovalOutcome {
  /** Normalized paths handed to Storage. */
  requested: string[]
  /**
   * Paths whose delete request FAILED. The objects are presumed to still
   * exist while the rows pointing at them may be about to disappear, so a
   * caller that is deleting those rows has to record these or lose them.
   */
  orphaned: string[]
  /** Storage's message, when the request failed. */
  error?: string
}

/**
 * Best-effort removal of the given entries' photo objects. Callers invoke
 * this after (or immediately before) the owning rows are deleted, so a
 * storage failure is never thrown — failing a delete that already happened
 * helps nobody.
 *
 * It is returned instead. Swallowing was the defect: a caller that is about
 * to destroy the only pointers to these objects needs to know which ones did
 * not go, and `void` could not tell it.
 *
 * WHY THERE IS NO "removed" LIST. `remove()` resolves with `data:
 * FileObject[]`, but its own documented example returns `[]` for a delete
 * that succeeded (@supabase/storage-js 2.110.2, StorageFileApi.remove), so
 * the array cannot be read as a per-path receipt. Request-level `error` is
 * the only signal this API gives that is safe to act on, and an empty
 * `orphaned` therefore means "Storage accepted the request", not "every
 * object is verified gone". Verifying the stronger claim would take a
 * per-path `info()` round trip, which no caller has needed.
 */
export async function removeDiaryPhotos(
  db: SupabaseClient,
  storedLists: (string[] | null)[]
): Promise<PhotoRemovalOutcome> {
  const requested = planPhotoRemoval(storedLists)
  if (requested.length === 0) return { requested, orphaned: [] }

  const { error } = await db.storage.from(DIARY_PHOTOS_BUCKET).remove(requested)

  if (error) return { requested, orphaned: requested, error: error.message }
  return { requested, orphaned: [] }
}
