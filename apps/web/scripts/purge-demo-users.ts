/**
 * Delete expired demo accounts.
 *
 * WHY THIS EXISTS. Every visitor who clicks "Look around first" on /login gets a
 * real anonymous auth user, a profile, a garden, and a seeded palette and diary.
 * Nothing ever removes them, so without this the auth table and the row counts
 * grow with every casual visit and never come back down.
 *
 * WHAT COUNTS AS EXPIRED: `auth.users.is_anonymous` is true and the account is
 * older than the age cutoff. A demo user who converted (added an email through
 * the "Keep this garden" banner) is no longer anonymous, so they are invisible
 * to this script by construction — there is no flag to get wrong and no way for
 * this to reach a real account.
 *
 * ORDER MATTERS. Deleting the auth row cascades through public.users -> gardens
 * -> palette_plants / diary_entries, but a database cascade cannot reach
 * Storage. Diary photos are removed first, exactly as `deleteAccount` does it;
 * skipping that would orphan objects in the private bucket forever.
 *
 * Dry run by default. Nothing is deleted without --apply.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/purge-demo-users.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/purge-demo-users.ts --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/purge-demo-users.ts --days 3 --apply
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'

const DEFAULT_MAX_AGE_DAYS = 7

function parseArgs() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')

  const daysIndex = args.indexOf('--days')
  const days =
    daysIndex >= 0 ? Number.parseInt(args[daysIndex + 1] ?? '', 10) : NaN

  if (daysIndex >= 0 && (!Number.isFinite(days) || days < 0)) {
    throw new Error('--days needs a non-negative number')
  }

  return {
    apply,
    maxAgeDays: Number.isFinite(days) ? days : DEFAULT_MAX_AGE_DAYS,
  }
}

async function main() {
  const { apply, maxAgeDays } = parseArgs()
  const admin = getSupabaseAdmin()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - maxAgeDays)

  console.log(
    `Demo purge: anonymous users created before ${cutoff.toISOString()} ` +
      `(older than ${maxAgeDays} days)`
  )
  console.log(apply ? 'Mode: APPLY\n' : 'Mode: dry run (pass --apply)\n')

  // Deliberately NOT auth.admin.listUsers: that endpoint 500s ("Database error
  // finding users") whenever per_page exceeds the project's total user count,
  // so it fails on small projects at any page size. The
  // `expired_demo_users` SQL function reads auth.users directly instead. See
  // supabase/migrations/20260729170000_expired_demo_users.sql.
  const { data, error } = await admin.rpc('expired_demo_users', {
    cutoff: cutoff.toISOString(),
  })
  if (error) throw new Error(`Failed to list demo accounts: ${error.message}`)

  const expired = (
    (data ?? []) as { user_id: string; created_at: string }[]
  ).map((row) => ({ id: row.user_id, createdAt: row.created_at }))

  console.log(`${expired.length} demo account(s) past the cutoff.`)

  if (expired.length === 0 || !apply) {
    for (const user of expired) {
      console.log(`  would delete ${user.id} (created ${user.createdAt})`)
    }
    return
  }

  let deleted = 0
  let photosRemoved = 0

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
        const { error } = await admin.storage.from('diary-photos').remove(paths)
        // Best-effort, same as deleteAccount: a storage hiccup must not block
        // the purge, or expired accounts pile up behind one bad object.
        if (error) {
          console.warn(
            `  photo cleanup failed for ${user.id}: ${error.message}`
          )
        } else {
          photosRemoved += paths.length
        }
      }
    }

    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      console.error(`  failed to delete ${user.id}: ${error.message}`)
      continue
    }
    deleted++
    console.log(`  deleted ${user.id} (created ${user.createdAt})`)
  }

  console.log(
    `\nDone. ${deleted}/${expired.length} account(s) deleted, ` +
      `${photosRemoved} photo(s) removed.`
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
