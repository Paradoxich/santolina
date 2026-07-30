/**
 * Compare what is WRITTEN in supabase/migrations/ against what is APPLIED on
 * the remote, and classify every way the two can disagree.
 *
 * WHY THIS EXISTS — trap 14 in docs/database-log.md. A migration was committed
 * to main, merged in the PR carrying the feature that depended on it, and
 * deployed, without ever being applied. `diary_entries.plant_id` stayed NOT
 * NULL in production, so saving a garden-level note failed for a day for
 * anyone who tried. Nothing was watching: there is no `supabase db push` in
 * any workflow, migrations are applied by hand through the MCP, and every
 * other guard in this repo checks catalog DATA. A migration file in the repo
 * reads as applied to anyone browsing it.
 *
 * The durable rule this encodes: the remote's ledger is the truth about what
 * is applied, `supabase/migrations/` is the truth about what was written.
 *
 * WHY THE PAIRING IS NOT JUST A SET DIFFERENCE — trap 13. `apply_migration`
 * (the MCP tool / Management API) records a migration under a version it
 * generates, not under your local filename. So a file and its remote row
 * routinely carry the SAME name and DIFFERENT versions, and a naive
 * version-only diff reports that as one missing migration plus one unknown
 * one. That is the false-alarm shape that made a filename-to-remote
 * comparison "non-obvious" in trap 14's own write-up, and it is why this
 * matches on name as a second pass. A version drift is real and worth fixing
 * — `supabase db push` would try to re-run those files against production —
 * but it is a different defect from "never applied", and conflating the two
 * buries the dangerous one in noise.
 *
 * Pure: no database, no filesystem, no network. The CLI
 * (scripts/check-migration-drift.ts) supplies both lists.
 */

/** A file in supabase/migrations/, parsed. */
export interface LocalMigration {
  /** Filename as it sits on disk, e.g. 20260706093045_initial_schema.sql */
  file: string
  /** The leading timestamp, e.g. 20260706093045 */
  version: string
  /** The descriptive tail, e.g. initial_schema */
  name: string
}

/** A row of supabase_migrations.schema_migrations on the remote. */
export interface RemoteMigration {
  version: string
  /** Null for rows applied by tooling that did not record one. */
  name: string | null
}

export type FindingKind =
  /** Written but never applied. THIS IS TRAP 14 — the one that reached users. */
  | 'not-applied'
  /** Applied under a different version than the filename. Trap 13. */
  | 'version-drift'
  /** Applied with no committed file: a schema change with no source. */
  | 'remote-only'
  /** Same version, different descriptive name. */
  | 'name-drift'
  /** Reconciling the versions would reorder the directory. */
  | 'order-inversion'
  /** A name repeats, so no pairing can be inferred safely. */
  | 'ambiguous'
  /** A file in the directory that is not a migration filename at all. */
  | 'malformed'

export interface Finding {
  kind: FindingKind
  /** What the check is talking about — a filename, or a bare version. */
  subject: string
  /** One line stating the defect. */
  detail: string
  /** The exact command or edit that resolves it. Never a description of one. */
  remedy: string
}

export interface DriftReport {
  localCount: number
  remoteCount: number
  /** Pairs that agree on both version and name. */
  matched: number
  findings: Finding[]
}

const FILENAME = /^(\d+)_(.+)\.sql$/

/**
 * Parse a migrations directory listing. Anything that is not
 * `<digits>_<name>.sql` cannot be applied by `supabase db push` and is
 * reported rather than skipped — a migration silently ignored for being
 * misnamed is trap 14 with extra steps.
 */
export function parseLocalMigrations(files: string[]): {
  migrations: LocalMigration[]
  malformed: string[]
} {
  const migrations: LocalMigration[] = []
  const malformed: string[] = []

  for (const file of files) {
    const match = FILENAME.exec(file)
    const version = match?.[1]
    const name = match?.[2]
    if (version === undefined || name === undefined) {
      malformed.push(file)
      continue
    }
    migrations.push({ file, version, name })
  }

  migrations.sort((a, b) => a.version.localeCompare(b.version))
  malformed.sort()
  return { migrations, malformed }
}

export function compareMigrations(
  localFiles: string[],
  remote: RemoteMigration[]
): DriftReport {
  const { migrations: local, malformed } = parseLocalMigrations(localFiles)

  const findings: Finding[] = []
  for (const file of malformed) {
    findings.push({
      kind: 'malformed',
      subject: file,
      detail:
        'not a <version>_<name>.sql filename, so no tool will ever apply it',
      remedy: `rename it to <timestamp>_<name>.sql, or move it out of supabase/migrations/`,
    })
  }

  const remoteByVersion = new Map<string, RemoteMigration>()
  for (const row of remote) remoteByVersion.set(row.version, row)

  const unmatchedLocal: LocalMigration[] = []
  const matchedRemote = new Set<string>()
  /** local file -> the remote version it is actually applied under */
  const appliedAs = new Map<string, string>()
  let matched = 0

  // Pass 1: the same version on both sides. The names should agree too.
  for (const entry of local) {
    const row = remoteByVersion.get(entry.version)
    if (!row) {
      unmatchedLocal.push(entry)
      continue
    }
    matchedRemote.add(row.version)
    appliedAs.set(entry.file, row.version)

    if (row.name !== null && row.name !== entry.name) {
      findings.push({
        kind: 'name-drift',
        subject: entry.file,
        detail: `applied under version ${row.version} as "${row.name}", not "${entry.name}"`,
        remedy: `git mv supabase/migrations/${entry.file} supabase/migrations/${entry.version}_${row.name}.sql`,
      })
    } else {
      matched++
    }
  }

  const unmatchedRemote = remote.filter((r) => !matchedRemote.has(r.version))

  // Pass 2: same name, different version — trap 13. Only safe to pair when the
  // name is unique on BOTH sides; two files called the same thing give no way
  // to tell which remote row belongs to which, and guessing here would print a
  // confident `git mv` that renames the wrong file.
  const localByName = groupBy(unmatchedLocal, (m) => m.name)
  const remoteByName = groupBy(
    unmatchedRemote.filter((r) => r.name !== null),
    (r) => r.name as string
  )

  const stillUnmatchedLocal: LocalMigration[] = []
  const pairedRemote = new Set<string>()

  for (const entry of unmatchedLocal) {
    const localPeers = localByName.get(entry.name) ?? []
    const remotePeers = remoteByName.get(entry.name) ?? []

    if (localPeers.length > 1 || remotePeers.length > 1) {
      findings.push({
        kind: 'ambiguous',
        subject: entry.file,
        detail: `the name "${entry.name}" appears ${localPeers.length}x locally and ${remotePeers.length}x on the remote, so no pairing can be inferred`,
        remedy: `check supabase_migrations.schema_migrations by hand and give each migration a distinct name`,
      })
      // Deliberately NOT added to stillUnmatchedLocal: reporting it a second
      // time as "never applied" would be a guess in the opposite direction.
      remotePeers.forEach((r) => pairedRemote.add(r.version))
      continue
    }

    const counterpart = remotePeers[0]
    if (!counterpart) {
      stillUnmatchedLocal.push(entry)
      continue
    }

    pairedRemote.add(counterpart.version)
    appliedAs.set(entry.file, counterpart.version)
    findings.push({
      kind: 'version-drift',
      subject: entry.file,
      detail: `applied, but the remote recorded it as ${counterpart.version} (trap 13: apply_migration stamps its own version)`,
      remedy: `git mv supabase/migrations/${entry.file} supabase/migrations/${counterpart.version}_${entry.name}.sql`,
    })
  }

  // Pass 3: what is left on each side is a genuine one-sided fact.
  for (const entry of stillUnmatchedLocal) {
    findings.push({
      kind: 'not-applied',
      subject: entry.file,
      detail:
        'committed but NOT APPLIED to the remote — the schema change is not live',
      remedy: `apply it (Supabase MCP apply_migration, or supabase db push), then reconcile the filename to the version the remote records`,
    })
  }

  for (const row of unmatchedRemote) {
    if (pairedRemote.has(row.version)) continue
    findings.push({
      kind: 'remote-only',
      subject: `${row.version}${row.name ? `_${row.name}` : ''}`,
      detail:
        'applied to the remote with no file in supabase/migrations/ — a live schema change with no source',
      remedy: `write supabase/migrations/${row.version}_${row.name ?? 'unknown'}.sql with the SQL that was applied, or drop the change`,
    })
  }

  findings.push(...orderFindings(local, appliedAs))

  return {
    localCount: local.length,
    remoteCount: remote.length,
    matched,
    findings: sortFindings(findings),
  }
}

/**
 * Renaming a file to the version the remote recorded must not change the
 * order the directory reads in. Trap 13's fix checked this by hand
 * ("add_is_greenery still precedes add_greenery_checked_at"); this is that
 * check, automated. An inversion means the files were applied in a different
 * order than their names imply, so reading the directory top to bottom tells
 * you a false history — and a later `db push` onto a fresh database would
 * replay them in an order production never saw.
 */
function orderFindings(
  local: LocalMigration[],
  appliedAs: Map<string, string>
): Finding[] {
  const applied = local.filter((m) => appliedAs.has(m.file))
  const findings: Finding[] = []

  for (let i = 1; i < applied.length; i++) {
    const previous = applied[i - 1]
    const current = applied[i]
    if (!previous || !current) continue

    const previousRemote = appliedAs.get(previous.file)
    const currentRemote = appliedAs.get(current.file)
    if (!previousRemote || !currentRemote) continue

    if (previousRemote.localeCompare(currentRemote) > 0) {
      findings.push({
        kind: 'order-inversion',
        subject: current.file,
        detail: `the directory has it after ${previous.file}, but the remote applied it FIRST (${currentRemote} before ${previousRemote})`,
        remedy: `confirm the two are independent before reconciling filenames; if they are not, the remote order is the real one`,
      })
    }
  }

  return findings
}

/**
 * Worst first, so the failure that reached real users is the first line
 * somebody reads rather than the eleventh.
 */
const SEVERITY: Record<FindingKind, number> = {
  'not-applied': 0,
  'remote-only': 1,
  'order-inversion': 2,
  ambiguous: 3,
  'version-drift': 4,
  'name-drift': 5,
  malformed: 6,
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY[a.kind] - SEVERITY[b.kind] || a.subject.localeCompare(b.subject)
  )
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = out.get(k)
    if (bucket) bucket.push(item)
    else out.set(k, [item])
  }
  return out
}
