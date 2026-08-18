/**
 * Fail if the `db-backups` bucket has no recent, non-empty dump.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none. It is a CI guard, like
 * check-migration-drift.ts. WHAT ENDS IT: nothing — it ends when the backup
 * does.
 *
 * WHY IT EXISTS. `db-backup.yml` reports by failing, and a failure
 * notification fires only when the job RUNS. Three failure modes produce no run
 * at all and are therefore invisible from inside the repo: GitHub disables a
 * scheduled workflow after 60 days of repository inactivity (documented Actions
 * behaviour, not inferred), a secret is removed, a database password is
 * rotated. A fourth is a run that fails and is not read — the 2026-08-03 run
 * died on a pooler timeout and nobody noticed for 15 days.
 *
 * All four have the same witness: the newest object in the bucket stops moving.
 * So this asks the bucket rather than the workflow, which is also the question
 * a restore would ask.
 *
 * WHERE IT RUNS. CI, on pushes to main only — it reads the service role key,
 * same trade as the catalog-state and migration-drift jobs. Pushes to main are
 * frequent enough to be the heartbeat; the check is deliberately NOT on the
 * backup workflow's own schedule, because a check that only runs when the thing
 * it watches runs cannot see the thing it is watching for.
 *
 * Read-only. No AI calls, no writes, no catalog access.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-backup-freshness.ts
 */

import { assessFreshness, type BackupObject } from '../lib/backup-freshness'
import { getSupabaseAdmin } from '../lib/supabase-admin'

const BUCKET = 'db-backups'

/**
 * How old the newest dump may be before this fails.
 *
 * Calibrated against `db-backup.yml`'s cron, which runs Mondays and Thursdays:
 * the largest healthy gap is four days, so ten allows one missed run plus
 * slack, and fails on the second. Widen this only by widening the cron — a
 * threshold that no longer corresponds to a schedule is a green light with
 * nothing behind it.
 */
const MAX_AGE_DAYS = 10

/** Every object in the bucket, flattened to folder + size. */
async function listBackups(): Promise<BackupObject[]> {
  const db = getSupabaseAdmin()

  const { data: buckets, error: bucketErr } = await db.storage.listBuckets()
  if (bucketErr) throw new Error(`list buckets: ${bucketErr.message}`)
  if (!buckets?.some((b) => b.name === BUCKET))
    // Not "no backups yet": backup-database.ts creates the bucket on its first
    // run, so a missing bucket means the backup has never once completed.
    throw new Error(
      `the ${BUCKET} bucket does not exist, so the database backup has never ` +
        `completed. backup-database.ts creates it on a successful first run — ` +
        `run 'gh workflow run db-backup.yml' and read the log.`
    )

  const { data: folders, error } = await db.storage.from(BUCKET).list()
  if (error) throw new Error(`list ${BUCKET}: ${error.message}`)

  const objects: BackupObject[] = []
  for (const folder of folders ?? []) {
    const { data: files, error: listErr } = await db.storage
      .from(BUCKET)
      .list(folder.name)
    if (listErr)
      throw new Error(`list ${BUCKET}/${folder.name}: ${listErr.message}`)
    // A folder with no objects still counts as a folder: an empty stamp is
    // exactly the shape a half-finished upload leaves, and `empty` says so.
    if (!files?.length) objects.push({ folder: folder.name, bytes: 0 })
    for (const f of files ?? [])
      objects.push({ folder: folder.name, bytes: f.metadata?.size ?? 0 })
  }
  return objects
}

/** What to do about it, per verdict. The remedy is the output, not the status. */
const REMEDY: Record<string, string> = {
  none:
    `The ${BUCKET} bucket holds no dated backup. Run 'gh workflow run ` +
    `db-backup.yml', read the log, and fix what it says before assuming the ` +
    `bucket is merely new.`,
  stale:
    `The backup workflow has not landed a dump inside the window. Check, in ` +
    `this order: 'gh run list --workflow db-backup.yml' for a failing or ` +
    `absent run; the Actions page for a schedule DISABLED after 60 days of ` +
    `repository inactivity, which produces no run and no notification; and ` +
    `'gh secret list' for SUPABASE_DB_URL and SUPABASE_SERVICE_ROLE_KEY.`,
  empty:
    `A dump landed on time and contains no bytes, which is worse than a ` +
    `missing one — it reads as covered. Re-run the workflow and check the ` +
    `pg_dump step's own output.`,
}

async function main() {
  const objects = await listBackups()
  const verdict = assessFreshness(objects, new Date(), MAX_AGE_DAYS)

  if (verdict.undated.length)
    console.log(
      `note: ${verdict.undated.length} folder(s) in ${BUCKET} carry no date ` +
        `prefix and cannot evidence a backup: ${verdict.undated.join(', ')}`
    )

  if (verdict.ok) {
    console.log(
      `✓ newest backup ${verdict.newest} — ${verdict.ageDays}d old ` +
        `(limit ${MAX_AGE_DAYS}d), ${verdict.bytes} bytes`
    )
    return
  }

  console.error(
    `\n✗ NO USABLE RECENT DATABASE BACKUP (${verdict.kind}).` +
      (verdict.newest
        ? `\n  Newest: ${verdict.newest} — ${verdict.ageDays}d old, ${verdict.bytes} bytes. Limit is ${MAX_AGE_DAYS}d.`
        : '') +
      `\n\n  ${REMEDY[verdict.kind]}\n` +
      `\n  This is standing rule 10's floor. A Free-plan project cannot ` +
      `download or\n  restore Supabase's own snapshots, so the bucket copy ` +
      `and the laptop copy\n  under backups/db/ are the only two that exist.\n`
  )
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
