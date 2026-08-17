/**
 * The round seeding loop, once, for every `seed-round*.ts` to call.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none directly — it is the body of the seed
 * step, and the round's own `seed-round<n>.ts` is what the runbook names. WHAT
 * ENDS IT: nothing; it is shared machinery, like `species-resolver.ts`.
 *
 * WHY IT EXISTS. Measured 2026-08-17, before this file: the `main()` bodies of
 * `seed-round8` through `seed-round11` were BYTE-IDENTICAL at 133 lines — all
 * six pairs, zero diff. Round 12 was 137 and differed by 10, rounds 6 and 7 by
 * the manifest block. About 850 lines of the same loop across eight files,
 * where the only part that legitimately differs per round is the `CANDIDATES`
 * list and the label.
 *
 * THE COST WAS ALREADY PAID, WHICH IS WHY THIS IS NOT A TIDY-UP. Round 12's
 * ten-line difference is not a round-12 requirement — it is two FIXES that
 * landed in the newest copy and in no other:
 *
 *   · `process.exitCode = 1` when candidates went UNRESOLVED, not only when
 *     rows failed. Rounds 6-11 exit 0 having silently seeded fewer plants than
 *     asked for, which is trap 4's shape exactly — a step that did not fully
 *     run and said nothing.
 *   · the `(via synonym …)` annotation, so a row seeded through a synonym is
 *     visible in the log rather than looking like a direct hit.
 *
 * Eight copies means a fix reaches one of them. That is the argument, and it is
 * the same one that produced `species-resolver.ts` (twelve synonym groups lost
 * to hand-carrying between round files, trap 7) and `catalog-identity.ts`.
 *
 * THE FLAG IT PARSES, on its callers' behalf: `--dry-run`. Every seeder's own
 * Usage block reads the same as it did when the file parsed argv itself:
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round13.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-round13.ts
 *
 * A dry run resolves every candidate and writes nothing, which is where the
 * synonym drift and the already-in-catalog skips show up — run it first.
 *
 * WHAT IS DELIBERATELY NOT HERE. The candidate list, and the judgment in it.
 * Choosing 28 damp-border plants and writing down why each one is on the list
 * is the actual work of a round; this file is the part that was never a
 * decision. A seeder keeps its header, its reasoning and its dropped-candidate
 * notes — see `seed-round12.ts`, which is unchanged below its imports.
 */

import { fetchAndMapSpecies } from '../lib/trefle'
import { upsertPlant } from '../lib/plants-db'
import {
  fetchCatalogIndex,
  normSci,
  resolve,
  type Resolved,
} from './species-resolver'
import { writeRoundManifest, type SeededPlant } from './round-manifest'

/** A candidate is a verified Trefle id, or an exact scientific name to resolve. */
export type Candidate = number | string

export interface SeedRoundOptions {
  /**
   * Round label, used for the manifest path. OMIT to write no manifest —
   * rounds 6 and 7 predate manifests and must not grow one retroactively, since
   * a manifest claims to record what that run seeded and this one would not.
   */
  label?: string
  candidates: ReadonlyArray<Candidate>
  /** Trefle pacing. 1600ms is what every round has used. */
  delayMs?: number
  /** Injectable for tests; defaults to the process's own arguments. */
  argv?: string[]
}

export interface SeedRoundResult {
  seeded: Array<{ entry: Candidate; id: number; sci: string }>
  skipped: Array<{ entry: Candidate; reason: string }>
  unresolved: Candidate[]
  failures: Array<{ entry: Candidate; error: string }>
  manifestPath: string | null
  dryRun: boolean
}

/**
 * Did the run leave work outstanding? The exit contract, as a function, because
 * it is the thing the eight copies disagreed about.
 *
 * Rounds 6-11 each ran `if (!dryRun && failures.length) process.exit(1)`, which
 * exits 0 when candidates went UNRESOLVED — asked for, not seeded, not
 * mentioned again. Round 12 fixed it and no other copy got the fix. `dryRun` is
 * deliberately not a parameter: a dry run that could not resolve a name has
 * found the same problem a day earlier, which is when it is cheapest to fix.
 */
export function seedRunIncomplete(result: {
  unresolved: readonly unknown[]
  failures: readonly unknown[]
}): boolean {
  return result.failures.length > 0 || result.unresolved.length > 0
}

/**
 * Should this run write a round manifest?
 *
 * A manifest is a claim about which rows a round seeded, so it is written only
 * when there is a label to file it under, rows to put in it, and the run
 * actually wrote them. Rounds 6 and 7 have no label on purpose: they predate
 * manifests, and giving them one retroactively would file a claim about a run
 * that happened months ago from a candidate list rather than from what it did.
 */
export function shouldWriteManifest(opts: {
  dryRun: boolean
  label?: string
  rowCount: number
}): boolean {
  return !opts.dryRun && Boolean(opts.label) && opts.rowCount > 0
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 3) => String(n).padStart(w, ' ')
const label = (e: Candidate) => (typeof e === 'number' ? `id ${e}` : e)

export async function seedRound(
  opts: SeedRoundOptions
): Promise<SeedRoundResult> {
  const { candidates, delayMs = 1600 } = opts
  const dryRun = (opts.argv ?? process.argv.slice(2)).includes('--dry-run')
  const startedAt = new Date().toISOString()

  const catalog = await fetchCatalogIndex()
  console.log(
    `\nCatalog has ${catalog.names.size} species. ${candidates.length} candidates.` +
      (dryRun ? ' DRY RUN — no writes.\n' : '\n')
  )

  const seenIds = new Set<number>() // resolved this run, avoid intra-batch dupes
  const seeded: SeedRoundResult['seeded'] = []
  const manifestRows: SeededPlant[] = []
  const skipped: SeedRoundResult['skipped'] = []
  const unresolved: Candidate[] = []
  const failures: SeedRoundResult['failures'] = []

  for (const [i, cand] of candidates.entries()) {
    const prefix = `[${pad(i + 1)}/${pad(candidates.length)}]`

    // Cheap skip before spending Trefle calls: exact/synonym name already held.
    if (typeof cand === 'string') {
      if (catalog.holds(cand)) {
        skipped.push({ entry: cand, reason: 'name already in catalog' })
        console.log(`${prefix} skip  ${cand} — already in catalog`)
        continue
      }
    } else if (catalog.ids.has(cand)) {
      skipped.push({ entry: cand, reason: 'id already in catalog' })
      console.log(`${prefix} skip  id ${cand} — already in catalog`)
      continue
    }

    let r: Resolved | null
    try {
      r = await resolve(cand)
    } catch (err) {
      failures.push({ entry: cand, error: (err as Error).message })
      console.log(`${prefix} ERR   ${label(cand)}: ${(err as Error).message}`)
      await sleep(delayMs)
      continue
    }

    if (!r) {
      unresolved.push(cand)
      console.log(`${prefix} miss  ${label(cand)} — no exact Trefle match`)
      await sleep(delayMs)
      continue
    }

    const resolvedNorm = normSci(r.scientific_name).join(' ')
    if (catalog.ids.has(r.id) || catalog.names.has(resolvedNorm)) {
      skipped.push({
        entry: cand,
        reason: `resolved to catalog (${r.scientific_name})`,
      })
      console.log(
        `${prefix} skip  ${label(cand)} → ${r.scientific_name} already in catalog`
      )
      await sleep(delayMs)
      continue
    }
    if (seenIds.has(r.id)) {
      skipped.push({
        entry: cand,
        reason: `duplicate of earlier candidate (${r.scientific_name})`,
      })
      console.log(
        `${prefix} skip  ${label(cand)} → ${r.scientific_name} already seeded this run`
      )
      await sleep(delayMs)
      continue
    }
    seenIds.add(r.id)

    const drift =
      r.topName && normSci(r.topName).join(' ') !== resolvedNorm
        ? `  (guard skipped top hit ${r.topName}/${r.topId})`
        : ''
    const via = r.viaSynonym ? `  (via synonym ${r.viaSynonym})` : ''

    if (dryRun) {
      seeded.push({ entry: cand, id: r.id, sci: r.scientific_name })
      console.log(
        `${prefix} OK    ${label(cand)} → id ${r.id} (${r.scientific_name})${via}${drift}`
      )
      await sleep(delayMs)
      continue
    }

    // Apply: seed by verified id via the shared map/upsert path.
    try {
      const mapped = await fetchAndMapSpecies(r.id)
      const saved = await upsertPlant(mapped)
      seeded.push({ entry: cand, id: r.id, sci: r.scientific_name })
      manifestRows.push({
        id: saved.id,
        source_species_id: saved.source_species_id,
        common_name: saved.common_name,
      })
      console.log(
        `${prefix} ✓     "${saved.common_name}" (${r.scientific_name})${via}${drift}`
      )
    } catch (err) {
      failures.push({ entry: cand, error: (err as Error).message })
      console.log(`${prefix} ✗     ${label(cand)}: ${(err as Error).message}`)
    }
    await sleep(delayMs)
  }

  // --- summary ---
  console.log('\n─────────────────────────────────────────')
  console.log(
    `${dryRun ? 'Would seed' : 'Seeded'}: ${seeded.length}  ·  skipped: ${skipped.length}  ·  unresolved: ${unresolved.length}  ·  failed: ${failures.length}`
  )
  if (unresolved.length) {
    console.log(`\nUnresolved (no exact Trefle match — drop or seed by id):`)
    for (const n of unresolved) console.log(`  • ${label(n)}`)
  }
  if (failures.length) {
    console.log(`\nFailed:`)
    for (const { entry, error } of failures)
      console.log(`  • ${label(entry)}: ${error}`)
  }

  let manifestPath: string | null = null
  if (
    shouldWriteManifest({
      dryRun,
      label: opts.label,
      rowCount: manifestRows.length,
    })
  ) {
    manifestPath = writeRoundManifest({
      label: opts.label!,
      startedAt,
      seeded: manifestRows,
    })
    console.log(`\nManifest: ${manifestPath}`)
  }

  // A per-row failure never aborts the batch, but the run must not exit 0 with
  // work outstanding — the same contract every pass here keeps.
  if (seedRunIncomplete({ unresolved, failures })) process.exitCode = 1

  return { seeded, skipped, unresolved, failures, manifestPath, dryRun }
}
