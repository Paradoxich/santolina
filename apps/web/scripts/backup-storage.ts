/**
 * Back up the Supabase Storage buckets to disk.
 *
 * WHY THIS EXISTS. **Storage objects are in no database backup, on any plan** —
 * the database only holds metadata about them. So `backup-catalog.ts`, the
 * committed round archives, and Supabase's own daily backups (which a Free-plan
 * project cannot download or restore anyway) all leave the buckets completely
 * uncovered. Nothing protected them until this.
 *
 * TWO KINDS OF OBJECT, AND THE DIFFERENCE MATTERS:
 *
 *   · `plant-images` is PUBLIC product data — hero images self-hosted because
 *     their source host is not in the next/image allowlist. Production rows
 *     point at them via `image_url_curated`, so losing one 404s a plant page.
 *     This is catalog content and could reasonably be committed.
 *   · `diary-photos` is PRIVATE user data, served only through signed URLs.
 *     It must **never** be committed to the repo — a git history is forever and
 *     may become public. Back it up somewhere private instead.
 *
 * The script does not make that call. It writes everything to the gitignored
 * `backups/storage/<stamp>/`, keeping the buckets separated, and prints which
 * is which. Be honest about what that buys: it gets the objects off Supabase,
 * NOT off this machine. Syncing that directory somewhere durable is a separate,
 * manual step — and for the private bucket it has to be.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backup-storage.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/backup-storage.ts --bucket plant-images
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getSupabaseAdmin } from '../lib/supabase-admin'

/** Buckets holding private user data — flagged so nobody commits them. */
const PRIVATE_BUCKETS = new Set(['diary-photos'])

interface ObjectRecord {
  bucket: string
  path: string
  bytes: number
}

function parseArgs() {
  const args = process.argv.slice(2)
  const at = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  return { bucket: at('--bucket') }
}

/**
 * Storage `list` returns one directory level at a time, and marks a folder by
 * giving it a null id. Recurse rather than assuming a flat bucket: diary photos
 * are nested two deep (`<garden>/<plant>/<file>`).
 */
async function listRecursive(bucket: string, prefix = ''): Promise<string[]> {
  const db = getSupabaseAdmin()
  const found: string[] = []
  const pageSize = 100

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    if (!data?.length) break

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      // A null id means a folder placeholder, not an object.
      if (entry.id === null) found.push(...(await listRecursive(bucket, path)))
      else found.push(path)
    }
    if (data.length < pageSize) break
  }
  return found
}

async function backupBucket(
  bucket: string,
  destRoot: string
): Promise<ObjectRecord[]> {
  const db = getSupabaseAdmin()
  const paths = await listRecursive(bucket)
  const records: ObjectRecord[] = []

  const label = PRIVATE_BUCKETS.has(bucket) ? 'PRIVATE' : 'public'
  console.log(`\n${bucket} (${label}) — ${paths.length} object(s)`)

  for (const path of paths) {
    const { data, error } = await db.storage.from(bucket).download(path)
    if (error) throw new Error(`download ${bucket}/${path}: ${error.message}`)
    const bytes = Buffer.from(await data.arrayBuffer())

    const dest = join(destRoot, bucket, path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, bytes)
    records.push({ bucket, path, bytes: bytes.byteLength })
    console.log(`  ${path} — ${bytes.byteLength} bytes`)
  }
  return records
}

async function main() {
  const { bucket: only } = parseArgs()
  const db = getSupabaseAdmin()

  const { data: buckets, error } = await db.storage.listBuckets()
  if (error) throw new Error(`Failed to list buckets: ${error.message}`)

  const targets = (buckets ?? [])
    .map((b) => b.name)
    .filter((name) => !only || name === only)
  if (!targets.length)
    throw new Error(only ? `No bucket named "${only}"` : 'No buckets found')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const destRoot = join(process.cwd(), 'backups', 'storage', stamp)
  mkdirSync(destRoot, { recursive: true })

  const all: ObjectRecord[] = []
  for (const name of targets) all.push(...(await backupBucket(name, destRoot)))

  const totalBytes = all.reduce((sum, r) => sum + r.bytes, 0)
  writeFileSync(
    join(destRoot, 'meta.json'),
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        buckets: targets,
        private_buckets: targets.filter((b) => PRIVATE_BUCKETS.has(b)),
        object_count: all.length,
        total_bytes: totalBytes,
        objects: all,
      },
      null,
      2
    ) + '\n'
  )

  console.log(`\n${all.length} object(s), ${totalBytes} bytes → ${destRoot}`)
  const priv = targets.filter((b) => PRIVATE_BUCKETS.has(b))
  if (priv.length)
    console.log(
      `\n⚠ ${priv.join(', ')} holds private user data — do NOT commit it. ` +
        `Sync this directory somewhere private instead; backups/ is gitignored ` +
        `but that only stops an accident, it does not get the files off this machine.`
    )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
