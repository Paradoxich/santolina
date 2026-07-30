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
 */

import { getSupabaseAdmin } from './supabase-admin'

export const DEFAULT_MAX_AGE_DAYS = 7

export interface PurgeResult {
  cutoff: string
  maxAgeDays: number
  apply: boolean
  expired: { id: string; createdAt: string }[]
  deleted: number
  photosRemoved: number
  failures: { id: string; message: string }[]
}

export async function purgeExpiredDemoUsers({
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  apply = false,
}: {
  maxAgeDays?: number
  apply?: boolean
}): Promise<PurgeResult> {
  const admin = getSupabaseAdmin()

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

      const paths = (entries ?? []).flatMap(
        (row) => (row.photo_urls ?? []) as string[]
      )

      if (paths.length > 0) {
        const { error: storageError } = await admin.storage
          .from('diary-photos')
          .remove(paths)
        // Best-effort, same as deleteAccount: a storage hiccup must not
        // block the purge, or expired accounts pile up behind one bad
        // object.
        if (!storageError) result.photosRemoved += paths.length
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
