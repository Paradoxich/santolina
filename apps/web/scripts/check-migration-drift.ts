/**
 * Fail if supabase/migrations/ and the remote's applied-migration ledger
 * disagree.
 *
 * TRAP 14, AND IT REACHED REAL USERS. `diary_entries_garden_level.sql` was
 * committed to main, merged in the PR carrying the feature that depended on
 * it, and deployed — and never applied. `diary_entries.plant_id` stayed NOT
 * NULL in production, so saving a garden-level note failed for anyone who
 * tried. It went unnoticed for a day, and was found only because somebody
 * happened to diff the two lists by hand while applying something unrelated.
 *
 * Nothing was watching, and that was the whole defect: there is no
 * `supabase db push` in any workflow, migrations are applied by hand through
 * the MCP, and every other guard in this repo checks catalog DATA. A migration
 * file in the repo reads as applied to anyone browsing it. This is the thing
 * that watches.
 *
 * WHAT IT COMPARES. `supabase/migrations/` is the truth about what was
 * WRITTEN; `public.applied_migrations()` reads the remote ledger, which is the
 * truth about what was APPLIED. The classification rules — and in particular
 * why a name pairing has to happen before anything is called missing — live in
 * lib/migration-drift.ts, which is pure and unit-tested.
 *
 * WHERE IT RUNS. CI, on pushes to main only, because it needs the service role
 * key and a PR-triggered job holding that key is not worth the drift check it
 * buys (same reasoning as the catalog-state job). That timing is deliberate
 * rather than a compromise: a migration is applied by hand around the time its
 * PR merges, so the push to main straight after the merge is exactly the
 * moment the question "did anyone actually apply it?" has a useful answer.
 *
 * Read-only. No AI calls, no writes, no catalog access.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-migration-drift.ts
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import {
  compareMigrations,
  type Finding,
  type RemoteMigration,
} from '../lib/migration-drift'

const MIGRATIONS_DIR = join(process.cwd(), '..', '..', 'supabase', 'migrations')

/** Headline per finding kind, so the output groups by defect rather than file. */
const HEADLINE: Record<Finding['kind'], string> = {
  'not-applied':
    'WRITTEN BUT NEVER APPLIED — the schema change is not live (trap 14)',
  'content-drift':
    'APPLIED, THEN THE FILE WAS EDITED — what is live is not what the file says',
  'remote-only':
    'APPLIED WITH NO COMMITTED FILE — a schema change with no source',
  'order-inversion': 'APPLY ORDER DISAGREES WITH THE DIRECTORY',
  ambiguous: 'DUPLICATE MIGRATION NAME — no pairing can be inferred',
  'version-drift': 'FILENAME DOES NOT MATCH THE APPLIED VERSION (trap 13)',
  'name-drift': 'SAME VERSION, DIFFERENT NAME',
  malformed: 'NOT A MIGRATION FILENAME',
}

async function fetchRemote(): Promise<RemoteMigration[]> {
  const admin = getSupabaseAdmin()

  // supabase_migrations is not an exposed schema, so this cannot be a plain
  // .from() read — see the applied_migrations migration for why a function is
  // the narrowest route to it.
  const { data, error } = await admin.rpc('applied_migrations')
  if (error) {
    throw new Error(
      `Could not read the remote migration ledger: ${error.message}\n` +
        'If this says the function does not exist, apply ' +
        'supabase/migrations/20260730082104_applied_migrations.sql — which ' +
        'is this check failing to bootstrap itself, and is exactly the ' +
        'condition it exists to report.'
    )
  }

  const rows = (data ?? []) as {
    version: string
    name: string | null
    // Absent on a remote still running the pre-2026-08-17 two-column function.
    // The content comparison then skips every row and says so, rather than
    // reporting a clean identity check as a clean content check.
    statements?: string[] | null
  }[]

  // An empty ledger is not "nothing to check". It is either a wrong database
  // or a broken read, and treating it as clean is the vacuous-scope bug the
  // round-9 rehearsal was written for (0 === 0 reading as complete).
  if (rows.length === 0) {
    throw new Error(
      'The remote migration ledger came back EMPTY. This project has been ' +
        'migrated since 2026-07-06, so this is a wrong-database or ' +
        'broken-permissions answer, not a clean one. Check ' +
        'NEXT_PUBLIC_SUPABASE_URL points at the right project.'
    )
  }

  return rows.map((r) => ({
    version: r.version,
    name: r.name,
    statements: r.statements ?? null,
  }))
}

function readLocal(): string[] {
  try {
    return readdirSync(MIGRATIONS_DIR)
  } catch (cause) {
    throw new Error(
      `Could not read ${MIGRATIONS_DIR}: ${(cause as Error).message}`
    )
  }
}

async function main() {
  const localFiles = readLocal().filter((f) => !f.startsWith('.'))
  const remote = await fetchRemote()
  const sqlByFile = new Map(
    localFiles
      .filter((f) => f.endsWith('.sql'))
      .map((f) => [f, readFileSync(join(MIGRATIONS_DIR, f), 'utf8')])
  )
  const report = compareMigrations(localFiles, remote, sqlByFile)

  // How many pairings the content check could actually see. A remote still
  // running the two-column applied_migrations() reports zero here and a clean
  // identity check above, and those two sentences together are the honest
  // reading — the check bootstrapping itself, the same way the function's own
  // absence is reported.
  const withStatements = remote.filter((r) => r.statements?.length).length

  if (report.findings.length === 0) {
    console.log(
      `migrations: OK — ${report.matched} committed migrations, all applied ` +
        'under the version their filename claims' +
        (withStatements === 0
          ? '\n  CONTENT NOT CHECKED: the remote ledger returned no statements. ' +
            'Apply supabase/migrations/20260817190000_applied_migrations_statements.sql.'
          : `, and ${withStatements} checked against the SQL that was applied`)
    )
    return
  }

  console.error(
    `migrations: ${report.findings.length} finding(s) — ` +
      `${report.localCount} local, ${report.remoteCount} applied\n`
  )

  let lastKind: Finding['kind'] | null = null
  for (const finding of report.findings) {
    if (finding.kind !== lastKind) {
      console.error(`  ${HEADLINE[finding.kind]}`)
      lastKind = finding.kind
    }
    console.error(`    ${finding.subject}`)
    console.error(`      ${finding.detail}`)
    console.error(`      fix: ${finding.remedy}\n`)
  }

  // Only the one-sided facts mean the database and the repo actually disagree
  // about what exists. A version drift is a real defect — `supabase db push`
  // would try to re-run those files against production — but the schema is
  // correct, so it must not be described as an unapplied change.
  const severe = report.findings.filter(
    (f) => f.kind === 'not-applied' || f.kind === 'remote-only'
  )
  if (severe.length > 0) {
    console.error(
      `  ${severe.length} of these mean the live schema is NOT what this ` +
        'repo describes. Everything else is ledger bookkeeping.\n'
    )
  }

  process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
