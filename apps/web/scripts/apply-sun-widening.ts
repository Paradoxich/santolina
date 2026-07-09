/**
 * SUPERSEDED (July 9, 2026) by the two-field sun model (migration
 * 20260709220000; curation now drafts sun_thrives + sun_tolerates directly, so
 * first drafts capture the full tolerated range at the source and this
 * corrective sweep is no longer part of the standard round). Kept for the
 * record and as a fallback for a legacy flat-list report. Note: it writes
 * sun_requirements, which is now a trigger-derived mirror — on a split row the
 * write is recomputed away, so this only affects rows not yet split.
 *
 * Sun-tolerance widening — applies the blind cross-check's sun findings.
 *
 * The curation pass systematically under-reports `sun_requirements`: it names
 * a plant's optimum, not its full tolerated range, and a prompt instruction
 * to "include every exposure" doesn't reliably stop it (a single draft
 * anchors on the textbook answer). The blind cross-check
 * (`cross-check-plants.ts`) is a second, independent read of each plant's sun
 * tolerance; where the stored range is a strict subset of that read it flags
 * "under-reported tolerance". This script consumes that report and widens
 * those rows to the cross-check's range.
 *
 * Because it acts only on strict-subset flags, "widen to the checked range"
 * is exactly the union of the two reads — it only ever ADDS an exposure the
 * independent read judged tolerable, never removes one.
 *
 * Safety rules:
 *   - Only widens SINGLE-value ranges (e.g. ["full_sun"] → ["full_sun",
 *     "partial_sun"]). That is the systematic under-report signal — the draft
 *     named one optimum. Plants already listing 2+ exposures are left alone:
 *     widening those (e.g. partial+shade → all three) means asserting a plant
 *     "grows anywhere", the least trustworthy claim, and it can silently undo
 *     a deliberate editorial narrowing (e.g. Ajuga, a shade groundcover, was
 *     editorially cut to partial_sun/shade — a fresh over-broad read would
 *     otherwise re-add full sun).
 *   - Only touches `is_curated = false` rows. Once a plant is finalized
 *     (`is_curated = true`), its sun value is frozen — never widened.
 *   - Only acts on the 'under-reported tolerance' flag (stored ⊂ checked).
 *     Contradictions ('no overlap') and lateral shifts ('partial overlap')
 *     are left for editorial review — a machine can't tell "narrow but right"
 *     from "wrong direction".
 *   - Guarded + idempotent: skips any row whose live `sun_requirements` no
 *     longer equals the value recorded in the report (drift protection), so a
 *     re-run is a no-op.
 *
 * This is a corroborated backstop, NOT the root-cause fix. The real fix is to
 * model sun as best + tolerated instead of one flat array (post-test).
 *
 * Run AFTER `cross-check-plants.ts`, whose report it reads. Standard round:
 *   seed → curate-plants → cross-check-plants → apply-sun-widening → curate-combinations
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-sun-widening.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-sun-widening.ts --dry-run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-sun-widening.ts --report reports/cross-check-2026-07-09-15-49-19.json
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'

// Canonical ordering for stored sun arrays (matches how curation drafts them)
const SUN_ORDER = ['full_sun', 'partial_sun', 'shade'] as const
type Sun = (typeof SUN_ORDER)[number]

const UNDER_REPORTED_DETAIL =
  'stored range narrower than check (under-reported tolerance)'

// ---------------------------------------------------------------------------
// Report shape (subset of what cross-check-plants.ts writes)
// ---------------------------------------------------------------------------

interface ReportFlag {
  field: string
  severity: string
  stored: unknown
  checked: unknown
  detail: string
}
interface ReportPlant {
  id: string
  common_name: string
  scientific_name: string | null
  flags: ReportFlag[]
}
interface CrossCheckReport {
  ran_at?: string
  flagged?: ReportPlant[]
}

interface Candidate {
  id: string
  label: string
  stored: Sun[]
  checked: Sun[]
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): { dryRun: boolean; reportPath: string | null } {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const idx = args.indexOf('--report')
  const reportPath = idx >= 0 ? (args[idx + 1] ?? null) : null
  if (idx >= 0 && !reportPath) {
    throw new Error('--report requires a path')
  }
  return { dryRun, reportPath }
}

function latestReport(reportsDir: string): string {
  let entries: string[]
  try {
    entries = readdirSync(reportsDir)
  } catch {
    throw new Error(
      `No reports directory at ${reportsDir} — run cross-check-plants.ts first.`
    )
  }
  const reports = entries
    .filter((f) => f.startsWith('cross-check-') && f.endsWith('.json'))
    .sort()
  const latest = reports.at(-1)
  if (!latest) {
    throw new Error(
      `No cross-check report found in ${reportsDir} — run cross-check-plants.ts first.`
    )
  }
  return join(reportsDir, latest)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asSunArray(value: unknown): Sun[] | null {
  if (!Array.isArray(value)) return null
  const out: Sun[] = []
  for (const v of value) {
    if (v !== 'full_sun' && v !== 'partial_sun' && v !== 'shade') return null
    out.push(v)
  }
  return out
}

function canonical(values: Sun[]): Sun[] {
  return SUN_ORDER.filter((s) => values.includes(s))
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((x) => setB.has(x))
}

function isStrictSubset(
  sub: readonly string[],
  sup: readonly string[]
): boolean {
  const setSup = new Set(sup)
  return sub.length < sup.length && sub.every((x) => setSup.has(x))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { dryRun, reportPath } = parseArgs()
  const reportsDir = join(__dirname, '..', 'reports')
  const path = reportPath
    ? join(process.cwd(), reportPath)
    : latestReport(reportsDir)

  console.log(`\nReading cross-check report: ${path}`)
  const report = JSON.parse(readFileSync(path, 'utf8')) as CrossCheckReport
  const flagged = report.flagged ?? []

  // Collect under-reported-sun candidates from the report
  const candidates: Candidate[] = []
  const malformed: string[] = []
  const multiValue: string[] = []
  for (const plant of flagged) {
    const flag = plant.flags.find(
      (f) =>
        f.field === 'sun_requirements' &&
        f.severity === 'disagree' &&
        f.detail === UNDER_REPORTED_DETAIL
    )
    if (!flag) continue

    const stored = asSunArray(flag.stored)
    const checked = asSunArray(flag.checked)
    const label = plant.scientific_name ?? plant.common_name
    if (!stored || !checked || !isStrictSubset(stored, checked)) {
      // Not a clean widen (unexpected for this detail string) — never guess
      malformed.push(label)
      continue
    }
    // Only widen single-value ranges — see the safety note in the header.
    if (stored.length !== 1) {
      multiValue.push(label)
      continue
    }
    candidates.push({
      id: plant.id,
      label,
      stored,
      checked: canonical(checked),
    })
  }

  console.log(
    `\n${candidates.length} single-value under-reported sun flag(s) to consider` +
      (multiValue.length
        ? `, ${multiValue.length} left as-is (already list 2+ exposures)`
        : '') +
      (malformed.length ? `, ${malformed.length} skipped as malformed` : '') +
      (dryRun ? '  [DRY RUN]' : '')
  )
  if (!candidates.length) {
    console.log('Nothing to widen — sun ranges already match the cross-check.')
    process.exit(0)
  }

  // Load live rows for the guard (is_curated + drift check)
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('plants')
    .select('id, sun_requirements, is_curated')
    .in(
      'id',
      candidates.map((c) => c.id)
    )
  if (error) throw new Error(`Failed to load plants: ${error.message}`)

  const live = new Map(
    (data ?? []).map((r) => [
      r.id as string,
      {
        sun: (r.sun_requirements ?? []) as string[],
        curated: r.is_curated as boolean,
      },
    ])
  )

  const applied: Array<{ label: string; from: Sun[]; to: Sun[] }> = []
  const skipped: Array<{ label: string; reason: string }> = []

  for (const c of candidates) {
    const row = live.get(c.id)
    if (!row) {
      skipped.push({ label: c.label, reason: 'row no longer exists' })
      continue
    }
    if (row.curated) {
      skipped.push({ label: c.label, reason: 'is_curated (frozen)' })
      continue
    }
    if (!sameSet(row.sun, c.stored)) {
      skipped.push({
        label: c.label,
        reason: `drifted since report (now ${JSON.stringify(row.sun)})`,
      })
      continue
    }

    if (dryRun) {
      applied.push({ label: c.label, from: c.stored, to: c.checked })
      continue
    }

    const { error: updErr } = await db
      .from('plants')
      .update({
        sun_requirements: c.checked,
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id)
      .eq('is_curated', false) // final guard at write time
    if (updErr) {
      skipped.push({
        label: c.label,
        reason: `update failed: ${updErr.message}`,
      })
      continue
    }
    applied.push({ label: c.label, from: c.stored, to: c.checked })
  }

  // Report
  console.log('\n─────────────────────────────────────────────────────────────')
  console.log(
    `${dryRun ? 'Would widen' : 'Widened'} ${applied.length} plant(s); ${skipped.length} skipped`
  )
  for (const a of applied) {
    console.log(
      `  ${dryRun ? '·' : '✓'} ${a.label}: ${JSON.stringify(a.from)} → ${JSON.stringify(a.to)}`
    )
  }
  if (skipped.length) {
    console.log('\nSkipped:')
    for (const s of skipped) console.log(`  – ${s.label}: ${s.reason}`)
  }

  // Log what happened (reports/ is gitignored)
  if (!dryRun) {
    mkdirSync(reportsDir, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const logPath = join(reportsDir, `sun-widening-${stamp}.json`)
    writeFileSync(
      logPath,
      JSON.stringify(
        {
          ran_at: new Date().toISOString(),
          source_report: path,
          applied,
          skipped,
        },
        null,
        2
      )
    )
    console.log(`\nLog written to ${logPath}`)
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
