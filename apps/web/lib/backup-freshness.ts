/**
 * Is there a recent backup in the `db-backups` bucket, and is it a real dump?
 *
 * Pure so it can be asserted without a bucket. The caller
 * (scripts/check-backup-freshness.ts) does the listing; everything that decides
 * pass or fail is here.
 *
 * WHY A CHECK AND NOT JUST THE JOB'S OWN FAILURE. `db-backup.yml` reports by
 * failing, and a failure notification fires only when the job RUNS. The cases
 * that produce no run at all are the ones that matter: GitHub disables a
 * scheduled workflow after 60 days of repository inactivity, a removed secret,
 * a rotated database password. All three look exactly like a quiet week from
 * inside the repo. Asking the bucket instead catches every one of them with a
 * single question, and it is the question a restore would ask.
 *
 * DAY GRANULARITY, ON PURPOSE. A stamp folder is named from an ISO instant, but
 * only its `YYYY-MM-DD` prefix is read — the same prefix comparison
 * `backup-database.ts` already prunes by. Age is therefore a lower bound by
 * under a day, which is the right direction for a threshold measured in days.
 */

/** One object in the bucket, flattened to what the verdict needs. */
export interface BackupObject {
  /** The stamp folder it sits in, e.g. `2026-08-18T03-12-04-123Z`. */
  folder: string
  /** Object size in bytes. Zero means the upload landed but the dump did not. */
  bytes: number
}

export type FreshnessKind =
  /** A dated, non-empty dump inside the window. */
  | 'fresh'
  /** The bucket holds no dated backup at all. */
  | 'none'
  /** The newest dated backup is older than the window. */
  | 'stale'
  /** The newest dated backup is inside the window but has no bytes. */
  | 'empty'

export interface FreshnessVerdict {
  ok: boolean
  kind: FreshnessKind
  /** The newest dated folder, when there is one. */
  newest?: string
  /** Whole days between that folder's date and `now`. */
  ageDays?: number
  /** Total bytes across the objects in that folder. */
  bytes?: number
  /** Folder names that carry no `YYYY-MM-DD` prefix, so cannot date a backup. */
  undated: string[]
}

const DAY_MS = 86_400_000
const DATED = /^(\d{4}-\d{2}-\d{2})/

/** UTC midnight of a folder's date prefix, or null if it has none. */
export function folderDate(folder: string): Date | null {
  const m = DATED.exec(folder)
  if (!m) return null
  const d = new Date(`${m[1]}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Verdict for a listing.
 *
 * `maxAgeDays` is the whole point of the check and belongs to the caller, which
 * reads it from one place next to the cron it is calibrated against.
 */
export function assessFreshness(
  objects: BackupObject[],
  now: Date,
  maxAgeDays: number
): FreshnessVerdict {
  const undated = [
    ...new Set(
      objects.filter((o) => !folderDate(o.folder)).map((o) => o.folder)
    ),
  ].sort()

  const dated = objects.filter((o) => folderDate(o.folder))
  if (!dated.length) return { ok: false, kind: 'none', undated }

  // Stamp folders sort chronologically, so a string max is the newest.
  const newest = dated.reduce((a, b) => (b.folder > a.folder ? b : a)).folder
  const bytes = dated
    .filter((o) => o.folder === newest)
    .reduce((n, o) => n + o.bytes, 0)
  const ageDays = Math.floor(
    (now.getTime() - folderDate(newest)!.getTime()) / DAY_MS
  )

  if (ageDays > maxAgeDays)
    return { ok: false, kind: 'stale', newest, ageDays, bytes, undated }
  if (bytes === 0)
    return { ok: false, kind: 'empty', newest, ageDays, bytes, undated }
  return { ok: true, kind: 'fresh', newest, ageDays, bytes, undated }
}
