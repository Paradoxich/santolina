/**
 * Remove one plant from the catalog, with the refusals that make it safe.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none, and it never will. A round ADDS plants;
 * removing one is a decision a person makes about a specific row, the way
 * `apply-description-fixes` is. WHAT ENDS IT: nothing. A catalog that can only
 * grow accumulates its own mistakes — the duplicate that started this one,
 * _Hydrangea anomala_ and _H. petiolaris_, has been known and unfixable since
 * round 11 for exactly one reason: **nothing could remove a plant at all.**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A SCRIPT AND NOT A `delete from plants`
 *
 * The foreign keys do NOT make this safe, and one of them makes it dangerous.
 * Measured against production, 2026-08-17:
 *
 *   palette_plants.plant_id      ON DELETE CASCADE    ← silently deletes
 *   plant_combinations.plant_id_a/b  ON DELETE CASCADE
 *   diary_entries.plant_id       NO ACTION            ← blocks
 *
 * A plain delete therefore removes the plant from every user's garden without
 * a word. `palette_plants` is USER DATA — somebody chose that plant — and the
 * database will not stop you, so the check has to live here. `diary_entries`
 * blocks instead, which is safer but arrives as a raw Postgres FK error rather
 * than an explanation; a diary entry is keyed by garden + plant precisely so a
 * plant's history survives leaving the palette (docs/architecture.md#diary-identity),
 * and deleting the plant is the one thing that destroys it.
 *
 * So: user-owned rows REFUSE, and the refusal names the count. Combinations do
 * not — they are derived data, regenerable by `curate-combinations`, and the
 * report says how many went and what to re-run.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE REMOVAL RECORD IS THE RESTORE POINT
 *
 * Every removal appends to `reference/removals.json`, committed, holding the
 * COMPLETE deleted rows — the plant and each combination — plus who asked, why,
 * and which round manifests named it. That is deliberately not "run
 * backup-catalog first": a whole-catalog snapshot to delete one row is a big
 * artifact that nobody will diff, and it does not answer the question you
 * actually have afterwards, which is *what exactly did we drop, and why*.
 * A removal is reversible from its own record.
 *
 * ROUND MEMBERSHIP IS REPORTED, NOT REFUSED. A manifest records what entered
 * the catalog in that round, and that stays true after the row is gone —
 * rewriting it would be falsifying provenance. But `roundStatus` reads its
 * totals from the rows it can still fetch, so a vanished id silently shrinks
 * the denominator and the round reads MORE complete than it is. That is the
 * exact shape verify-round was built for, so `verify-round` now FAILs on a
 * manifest id with no live row and points at this record.
 *
 * Usage (from apps/web) — dry run is the default, and `--why` is required
 * even for it:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/remove-plant.ts --name 'Hydrangea anomala' --why '<reason>'
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/remove-plant.ts --id <uuid> --why '<reason>' --apply
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { withRunRecord, type Witness } from './run-provenance'
import { readRoundManifest, roundDir } from './round-manifest'

const REMOVALS_FILE = 'reference/removals.json'

/** What depends on the row, counted before anything is deleted. */
export interface Dependents {
  /** Rows in someone's garden. User data. */
  palette: number
  /** Dated notes. User data, and keyed by plant on purpose. */
  diary: number
  /** Derived, regenerable by curate-combinations. */
  combinations: number
}

export interface Refusal {
  /** Which dependent blocked it. */
  table: string
  reason: string
}

/**
 * The whole safety property, as a pure function.
 *
 * SEPARATED FROM THE QUERY so it can be asserted without a database, and so
 * "which dependents block a removal" is one statement rather than a shape
 * spread through an imperative body. The distinction it encodes is the only
 * one that matters here: USER-OWNED rows block, DERIVED rows do not.
 *
 * A count of zero never blocks, so the common case — a catalog row nobody has
 * touched — passes without an override flag existing at all. There is
 * deliberately no `--force`: the answer to "a user has this plant" is to talk
 * to the user or migrate the row, not to widen the tool.
 */
export function assessRemoval(deps: Dependents): Refusal[] {
  const refusals: Refusal[] = []
  if (deps.palette > 0)
    refusals.push({
      table: 'palette_plants',
      reason:
        `${deps.palette} garden(s) hold this plant, and the foreign key is ON DELETE CASCADE — ` +
        `deleting it would remove it from those gardens with no trace. Move those rows to the ` +
        `plant you are keeping first, then re-run.`,
    })
  if (deps.diary > 0)
    refusals.push({
      table: 'diary_entries',
      reason:
        `${deps.diary} dated note(s) reference this plant. A diary entry is keyed by garden + plant ` +
        `so a plant's history survives leaving the palette; deleting the plant is the one thing that ` +
        `destroys it. Re-point them at the plant you are keeping first.`,
    })
  return refusals
}

/** One appended record. The complete rows, so the delete is reversible. */
export interface RemovalRecord {
  removed_at: string
  scientific_name: string
  common_name: string | null
  why: string
  /** Round labels whose manifest names this id. Reported, never rewritten. */
  in_manifests: string[]
  plant: Record<string, unknown>
  combinations: Record<string, unknown>[]
}

export function appendRemoval(
  file: string,
  record: RemovalRecord
): RemovalRecord[] {
  const existing: RemovalRecord[] = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as RemovalRecord[])
    : []
  const all = [...existing, record]
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`, 'utf8')
  return all
}

/** Round labels whose manifest names this id. */
export function manifestsNaming(id: string, labels: string[]): string[] {
  return labels.filter((label) =>
    readRoundManifest(label)?.seeded_ids.includes(id)
  )
}

function flag(name: string): string | undefined {
  const args = process.argv.slice(2)
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const id = flag('id')
  const name = flag('name')
  const why = flag('why')

  if (!id && !name)
    throw new Error('Pass --id <uuid> or --name "<scientific name>".')
  if (!why?.trim())
    throw new Error(
      'Pass --why "<reason>". A removal with no reasoning is not reviewable, ' +
        'and the record this writes is the only place the reason will ever live.'
    )

  const db = getSupabaseAdmin()

  const matches = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let q = db.from('plants').select('*')
    q = id ? q.eq('id', id) : q.eq('scientific_name', name!)
    return q.order('id').range(from, to)
  })

  if (matches.length === 0)
    throw new Error(`No catalog row matches ${id ?? name}.`)
  // Two rows behind one name is the very situation this tool exists to fix, so
  // it must not guess which of them was meant.
  if (matches.length > 1)
    throw new Error(
      `${name} matches ${matches.length} rows. Re-run with --id <uuid>; the ids are ` +
        matches.map((m) => m['id']).join(', ')
    )

  const plant = matches[0]!
  const plantId = plant['id'] as string

  const combinations = await fetchAllRows<Record<string, unknown>>((from, to) =>
    db
      .from('plant_combinations')
      .select('*')
      .or(`plant_id_a.eq.${plantId},plant_id_b.eq.${plantId}`)
      .order('id')
      .range(from, to)
  )
  const palette = await fetchAllRows<{ id: string }>((from, to) =>
    db
      .from('palette_plants')
      .select('id')
      .eq('plant_id', plantId)
      .order('id')
      .range(from, to)
  )
  const diary = await fetchAllRows<{ id: string }>((from, to) =>
    db
      .from('diary_entries')
      .select('id')
      .eq('plant_id', plantId)
      .order('id')
      .range(from, to)
  )

  const deps: Dependents = {
    palette: palette.length,
    diary: diary.length,
    combinations: combinations.length,
  }

  console.log(
    `\n${plant['scientific_name']} (${plant['common_name'] ?? 'no common name'})` +
      `\n  id            ${plantId}` +
      `\n  is_curated    ${plant['is_curated']}` +
      `\n  palette rows  ${deps.palette}` +
      `\n  diary rows    ${deps.diary}` +
      `\n  combinations  ${deps.combinations}  (cascade, regenerable)`
  )

  const labels = ['8', '9', '10', '11', '12']
  const inManifests = manifestsNaming(plantId, labels)
  if (inManifests.length)
    console.log(
      `  in manifest   round ${inManifests.join(', ')} — kept as written; verify-round will report the gap`
    )

  const refusals = assessRemoval(deps)
  if (refusals.length) {
    console.log('\nREFUSED:')
    for (const r of refusals) console.log(`  ${r.table} — ${r.reason}`)
    process.exit(1)
  }

  if (!apply) {
    console.log(
      `\nDRY RUN — would delete this row and ${deps.combinations} combination(s).` +
        `\nRe-run with --apply to write.`
    )
    return
  }

  const runOptions = {
    step: 'remove-plant',
    // A TABLE, not a column: what this mutates is the row's existence.
    writeSet: ['plants'],
    // A DELETION CANNOT WITNESS ITSELF. Every other witness in the pipeline
    // reads something the write left behind; the whole point here is that
    // nothing is left. `updated_at` cannot help either — the row carrying it is
    // the row that is gone. So this is declared unobservable, with the reason,
    // which is the honest answer the module's own header asks for.
    evidence: [
      {
        kind: 'none',
        covers: 'plants',
        reason:
          'a deleted row leaves no stamp and no updated_at to read back; the removal record in reference/removals.json is the evidence, and it holds the complete row',
      },
    ] as Witness[],
    scope: `${plant['scientific_name']} (${plantId})`,
    recipe: {
      model: 'human',
      template: why,
      ingredients: {},
      decoding: {},
    },
  }

  await withRunRecord(runOptions, async (run) => {
    // The record is written BEFORE the delete. If the delete fails, a record of
    // a removal that did not happen is a puzzle someone can resolve by looking;
    // a delete with no record is the thing that cannot be resolved at all.
    const file = join(process.cwd(), REMOVALS_FILE)
    appendRemoval(file, {
      removed_at: new Date().toISOString(),
      scientific_name: plant['scientific_name'] as string,
      common_name: (plant['common_name'] as string | null) ?? null,
      why,
      in_manifests: inManifests,
      plant,
      combinations,
    })
    console.log(`\nRecorded in ${REMOVALS_FILE} (complete row, restorable).`)

    const { error } = await db.from('plants').delete().eq('id', plantId)
    if (error) throw new Error(`delete failed — ${error.message}`)
    run.wrote(plantId)
  })

  console.log(
    `\nDeleted. ${deps.combinations} combination row(s) went with it (cascade).` +
      `\nRe-run: curate-combinations, to refill the companions those pairings held.` +
      (inManifests.length
        ? `\nverify-round --round ${inManifests[0]} will now report a manifest id with no row. That is correct: ${roundDir(inManifests[0]!).split('/').slice(-2).join('/')} still records what entered, and the plant is gone.`
        : '')
  )
}

// Guarded so the test file can import assessRemoval without running the tool —
// same pattern as curate-plants.ts and pick-plant-images.ts. Without it,
// importing this module parses argv and calls the database.
if (require.main === module) {
  main().catch((err) => {
    console.error(`\n${(err as Error).message}\n`)
    process.exit(1)
  })
}
