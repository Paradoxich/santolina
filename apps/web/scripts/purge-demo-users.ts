/**
 * CLI wrapper for lib/purge-demo-users.ts. Manual/local use — production
 * runs on a schedule via app/api/cron/purge-demo-users/route.ts (Vercel
 * Cron, see vercel.json).
 *
 * Dry run by default. Nothing is deleted without --apply.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/purge-demo-users.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/purge-demo-users.ts --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/purge-demo-users.ts --days 3 --apply
 */

import {
  purgeExpiredDemoUsers,
  DEFAULT_MAX_AGE_DAYS,
} from '../lib/purge-demo-users'

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

  console.log(`Demo purge: anonymous users older than ${maxAgeDays} days`)
  console.log(apply ? 'Mode: APPLY\n' : 'Mode: dry run (pass --apply)\n')

  const result = await purgeExpiredDemoUsers({ maxAgeDays, apply })

  console.log(
    `Cutoff: ${result.cutoff}. ${result.expired.length} demo account(s) past it.`
  )

  if (result.expired.length === 0 || !apply) {
    for (const user of result.expired) {
      console.log(`  would delete ${user.id} (created ${user.createdAt})`)
    }
    return
  }

  for (const user of result.expired) {
    const failure = result.failures.find((f) => f.id === user.id)
    if (failure) {
      console.error(`  failed to delete ${user.id}: ${failure.message}`)
    } else {
      console.log(`  deleted ${user.id} (created ${user.createdAt})`)
    }
  }

  console.log(
    `\nDone. ${result.deleted}/${result.expired.length} account(s) deleted, ` +
      `${result.photosRemoved} photo(s) removed.`
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
