/**
 * Full-database backup — the five tables nothing else backs up, plus everything
 * the other two backup scripts already cover.
 *
 * WHY THIS EXISTS. `backup-catalog.ts` dumps `plants` and `plant_combinations`
 * only; `users`, `gardens`, `palette_plants`, `diary_entries` and
 * `agent_sessions` had no backup at all, and **a Free-plan project cannot
 * download or restore Supabase's own daily snapshots**. That was survivable
 * while every account was a demo one and becomes unrecoverable the day the app
 * has users — so this runs before launch, not after.
 *
 * WHAT IT DUMPS. One `pg_dump` custom-format archive of three schemas:
 *   · `public`  — all seven app tables, schema and data
 *   · `auth`    — Supabase auth users and identities (magic link + Google;
 *                 there are no passwords to leak, but this IS private user data)
 *   · `storage` — bucket/object METADATA only; the objects themselves are
 *                 `backup-storage.ts`'s job
 * Custom format (`-Fc`) is compressed and lets `pg_restore` filter to one
 * schema, one table, or data-only at restore time instead of at dump time.
 *
 * WHERE IT GOES. Two places, covering different losses:
 *   · `backups/db/<stamp>/` on this machine (gitignored) — survives losing the
 *     Supabase project
 *   · the private `db-backups` storage bucket (created on first run) — survives
 *     losing this machine. Same project though: a dead project takes the bucket
 *     with it, which is why the local copy is not optional.
 * The dump contains private user data. **Never commit it** — same rule as
 * `diary-photos` in backup-storage.ts.
 *
 * NEEDS. `SUPABASE_DB_URL` in .env.local — the SESSION POOLER connection
 * string (Dashboard → Connect → Session pooler; port 5432). The direct
 * `db.<ref>.supabase.co` host is IPv6-only on the Free plan and will not
 * resolve from most home networks. Also a `pg_dump` at least as new as the
 * server's Postgres 17 (`brew install libpq`).
 *
 * RESTORE. Rehearsed only as far as `pg_restore --list` (a Free plan has no
 * second project to restore into). The shape of a full recovery: create a
 * project, apply `supabase/migrations/`, then
 *   pg_restore -d "$SUPABASE_DB_URL" --data-only --no-owner \
 *     --schema=public --schema=auth <file>.dump
 * restoring auth before public satisfies the users → auth.users FK. Table-level
 * repair on a live project: `pg_restore --data-only -t <table>` after
 * truncating the damaged table. Verify `is_curated` counts after any restore
 * touching `plants` (database-log, the editorial trigger).
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backup-database.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backup-database.ts --skip-upload
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { getSupabaseAdmin } from '../lib/supabase-admin'

const SCHEMAS = ['public', 'auth', 'storage'] as const
const BUCKET = 'db-backups'

/** Bucket copies older than this are pruned after each upload — the weekly
 * cron would otherwise walk the bucket into the Free plan's 1GB storage cap.
 * Local copies under backups/db/ are never touched. */
const BUCKET_RETENTION_DAYS = 90

/** The seven app tables — counted before the dump so meta.json records what a
 * complete backup contained, and a truncated dump is noticeable. */
const APP_TABLES = [
  'users',
  'gardens',
  'plants',
  'palette_plants',
  'plant_combinations',
  'agent_sessions',
  'diary_entries',
] as const

function findPgDump(): string {
  const candidates = [
    'pg_dump',
    '/opt/homebrew/opt/libpq/bin/pg_dump',
    '/usr/local/opt/libpq/bin/pg_dump',
  ]
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf8' })
    if (probe.status === 0) return bin
  }
  throw new Error(
    "pg_dump not found — `brew install libpq` (client must be ≥ the server's Postgres 17)"
  )
}

async function countAppTables(): Promise<Record<string, number>> {
  const db = getSupabaseAdmin()
  const counts: Record<string, number> = {}
  for (const table of APP_TABLES) {
    const { count, error } = await db
      .from(table)
      .select('*', { count: 'exact', head: true })
    if (error) throw new Error(`count ${table}: ${error.message}`)
    counts[table] = count ?? 0
  }
  return counts
}

function dump(dbUrl: string, outFile: string, pgDump: string) {
  // Password travels via PGPASSWORD, not argv, so it never shows up in `ps`.
  const url = new URL(dbUrl)
  const args = [
    '--host',
    url.hostname,
    '--port',
    url.port || '5432',
    '--username',
    decodeURIComponent(url.username),
    '--dbname',
    url.pathname.replace(/^\//, '') || 'postgres',
    '--format',
    'custom',
    '--no-owner',
    '--no-privileges',
    ...SCHEMAS.flatMap((s) => ['--schema', s]),
    '--file',
    outFile,
  ]
  const result = spawnSync(pgDump, args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
  })
  if (result.status !== 0)
    throw new Error(`pg_dump exited with status ${result.status}`)
}

/** A failed attempt leaves a partial archive; pg_dump refuses to overwrite it. */
function discardPartial(outFile: string) {
  if (existsSync(outFile)) rmSync(outFile)
}

/**
 * Attempts before the run is called failed. Three, spaced by SLEEP.
 *
 * NOT PACING, NOT A FALLBACK. The 2026-08-03 run died because the session
 * pooler refused the connection on all three of its IPs, and the whole week's
 * backup was lost to one transient minute — the cron is the retry today, and it
 * is days wide. So the retry is bounded, it re-runs the identical command, and
 * the last failure is rethrown: a run that cannot dump must still exit non-zero
 * (see lib/failure.ts, and the rule that a fallback must never make a failed
 * fetch look like a result).
 */
const DUMP_ATTEMPTS = 3
const DUMP_RETRY_MS = 30_000

function dumpWithRetry(dbUrl: string, outFile: string, pgDump: string) {
  for (let attempt = 1; ; attempt++) {
    discardPartial(outFile)
    try {
      dump(dbUrl, outFile, pgDump)
      return
    } catch (err) {
      if (attempt >= DUMP_ATTEMPTS) throw err
      console.log(
        `  pg_dump attempt ${attempt}/${DUMP_ATTEMPTS} failed (${
          err instanceof Error ? err.message : String(err)
        }); retrying in ${DUMP_RETRY_MS / 1000}s`
      )
      // Synchronous on purpose: nothing else may run between attempts, and
      // this is a one-shot script, not a server.
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        DUMP_RETRY_MS
      )
    }
  }
}

async function upload(localFile: string, objectPath: string) {
  const db = getSupabaseAdmin()

  const { data: buckets, error: listErr } = await db.storage.listBuckets()
  if (listErr) throw new Error(`list buckets: ${listErr.message}`)
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await db.storage.createBucket(BUCKET, { public: false })
    if (error) throw new Error(`create bucket ${BUCKET}: ${error.message}`)
    console.log(`Created private bucket ${BUCKET}`)
  }

  const { error } = await db.storage
    .from(BUCKET)
    .upload(objectPath, readFileSync(localFile), {
      contentType: 'application/octet-stream',
    })
  if (error) throw new Error(`upload ${objectPath}: ${error.message}`)
}

/** Stamp folders sort chronologically, so a date-prefix comparison is enough.
 * Prunes only after a successful upload — a failed run never deletes anything. */
async function pruneBucket() {
  const db = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - BUCKET_RETENTION_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const { data: folders, error } = await db.storage.from(BUCKET).list()
  if (error) throw new Error(`list ${BUCKET}: ${error.message}`)

  for (const folder of folders ?? []) {
    if (folder.name.slice(0, 10) >= cutoff) continue
    const { data: files, error: listErr } = await db.storage
      .from(BUCKET)
      .list(folder.name)
    if (listErr)
      throw new Error(`list ${BUCKET}/${folder.name}: ${listErr.message}`)
    const paths = (files ?? []).map((f) => `${folder.name}/${f.name}`)
    if (!paths.length) continue
    const { error: rmErr } = await db.storage.from(BUCKET).remove(paths)
    if (rmErr) throw new Error(`prune ${folder.name}: ${rmErr.message}`)
    console.log(
      `  pruned ${folder.name} (older than ${BUCKET_RETENTION_DAYS}d)`
    )
  }
}

async function main() {
  const skipUpload = process.argv.includes('--skip-upload')

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl)
    throw new Error(
      'SUPABASE_DB_URL is not set. Add the SESSION POOLER connection string ' +
        '(Dashboard → Connect → Session pooler, port 5432) to .env.local — ' +
        'the direct db.<ref> host is IPv6-only on the Free plan.'
    )
  const pgDump = findPgDump()

  const counts = await countAppTables()
  console.log('Live row counts:')
  for (const [table, n] of Object.entries(counts))
    console.log(`  ${table}: ${n}`)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(process.cwd(), 'backups', 'db', stamp)
  mkdirSync(dir, { recursive: true })
  const fileName = `santolina-${stamp}.dump`
  const localFile = join(dir, fileName)

  console.log(`\nDumping ${SCHEMAS.join(', ')}...`)
  dumpWithRetry(dbUrl, localFile, pgDump)
  if (!existsSync(localFile) || statSync(localFile).size === 0)
    throw new Error('pg_dump produced no output')
  const bytes = statSync(localFile).size
  console.log(`  ${bytes} bytes → ${localFile}`)

  writeFileSync(
    join(dir, 'meta.json'),
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        schemas: SCHEMAS,
        app_table_counts: counts,
        dump_bytes: bytes,
        uploaded: !skipUpload,
      },
      null,
      2
    ) + '\n'
  )

  if (skipUpload) {
    console.log('\n--skip-upload: local copy only')
  } else {
    await upload(localFile, `${stamp}/${fileName}`)
    console.log(`  uploaded → ${BUCKET}/${stamp}/${fileName} (private bucket)`)
    await pruneBucket()
  }

  console.log(
    '\n⚠ The dump contains private user data (auth users, gardens, diary ' +
      'entries) — never commit it. backups/ is gitignored; that stops an ' +
      'accident, nothing more.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
