/**
 * Delete expired demo accounts. Shared by the CLI script
 * (scripts/purge-demo-users.ts) and the Vercel Cron route
 * (app/api/cron/purge-demo-users/route.ts) — one implementation, two
 * triggers.
 *
 * WHAT COUNTS AS EXPIRED: `auth.users.is_anonymous` is true and the account
 * is older than the age cutoff. A demo user who converted (added an email
 * through the "Keep this garden" banner) is no longer anonymous, so they are
 * invisible to this function by construction — there is no flag to get
 * wrong and no way for this to reach a real account.
 *
 * ORDER MATTERS. Deleting the auth row cascades through public.users ->
 * gardens -> palette_plants / diary_entries, but a database cascade cannot
 * reach Storage. Diary photos are removed first, exactly as `deleteAccount`
 * does it; skipping that would orphan objects in the private bucket forever.
 *
 * A FAILED PHOTO REMOVAL DOES NOT BLOCK THE ACCOUNT DELETION, and that is a
 * decision rather than an oversight: Storage and Postgres cannot be deleted
 * atomically, so aborting on a storage error converts a recoverable orphan
 * into an unbounded queue of demo accounts that never expire. What it must
 * not do is stay quiet. `deleteUser` cascades away the `diary_entries` rows
 * holding `photo_urls`, which are the only record of which objects belong to
 * this account, so the paths are copied onto `orphanedPhotos` and logged by
 * the caller BEFORE that happens. See
 * `apps/web/app/api/cron/purge-demo-users/route.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from './supabase-admin'
import { removeDiaryPhotos } from './diary-photos'

export const DEFAULT_MAX_AGE_DAYS = 7

/**
 * One account whose photo objects were NOT deleted, captured while its
 * `diary_entries` rows still existed. Recoverable state, not a statistic:
 * `paths` is what a later cleanup needs, and nothing else holds it.
 */
export interface OrphanedPhotos {
  id: string
  paths: string[]
  message: string
}

export interface PurgeResult {
  cutoff: string
  maxAgeDays: number
  apply: boolean
  expired: { id: string; createdAt: string }[]
  deleted: number
  /**
   * Paths submitted in a removal request Storage ACCEPTED — not objects
   * verified gone; `remove()` gives no dependable per-path receipt
   * (see removeDiaryPhotos). Read `orphanedPhotos` for what failed.
   */
  photosRemoved: number
  orphanedPhotos: OrphanedPhotos[]
  failures: { id: string; message: string }[]
}

export async function purgeExpiredDemoUsers({
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  apply = false,
  client,
}: {
  maxAgeDays?: number
  apply?: boolean
  /**
   * The service-role client, injected only by tests — both real callers (the
   * cron route and the CLI) omit it and get `getSupabaseAdmin()`. Present so
   * the ordering this function depends on, recording orphaned paths BEFORE
   * `deleteUser` destroys the rows they came from, can be asserted without a
   * live project. Same seam `removeDiaryPhotos` already takes.
   */
  client?: SupabaseClient
}): Promise<PurgeResult> {
  const admin = client ?? getSupabaseAdmin()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - maxAgeDays)

  // Deliberately NOT auth.admin.listUsers: that endpoint 500s ("Database
  // error finding users") whenever per_page exceeds the project's total user
  // count, so it fails on small projects at any page size. The
  // `expired_demo_users` SQL function reads auth.users directly instead. See
  // supabase/migrations/20260729164307_expired_demo_users.sql.
  const { data, error } = await admin.rpc('expired_demo_users', {
    cutoff: cutoff.toISOString(),
  })
  if (error) throw new Error(`Failed to list demo accounts: ${error.message}`)

  const expired = (
    (data ?? []) as { user_id: string; created_at: string }[]
  ).map((row) => ({ id: row.user_id, createdAt: row.created_at }))

  const result: PurgeResult = {
    cutoff: cutoff.toISOString(),
    maxAgeDays,
    apply,
    expired,
    deleted: 0,
    photosRemoved: 0,
    orphanedPhotos: [],
    failures: [],
  }

  if (expired.length === 0 || !apply) return result

  for (const user of expired) {
    // Storage first — the cascade below cannot reach the bucket.
    const { data: gardens } = await admin
      .from('gardens')
      .select('id')
      .eq('user_id', user.id)

    const gardenIds = (gardens ?? []).map((g) => g.id as string)

    if (gardenIds.length > 0) {
      const { data: entries } = await admin
        .from('diary_entries')
        .select('photo_urls')
        .in('garden_id', gardenIds)

      // Via removeDiaryPhotos, not a local remove(): it is where the
      // pre-cutover full-URL rows get normalized to bucket paths, and a
      // second copy of that normalization would silently no-op on them.
      const removal = await removeDiaryPhotos(
        admin,
        (entries ?? []).map((row) => (row.photo_urls ?? []) as string[])
      )

      if (removal.orphaned.length > 0) {
        // Recorded HERE, before deleteUser cascades the rows these paths
        // came from. After that line there is nothing left to read them off.
        result.orphanedPhotos.push({
          id: user.id,
          paths: removal.orphaned,
          message: removal.error ?? 'unknown storage failure',
        })
      } else {
        result.photosRemoved += removal.requested.length
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      result.failures.push({ id: user.id, message: deleteError.message })
      continue
    }
    result.deleted++
  }

  return result
}
