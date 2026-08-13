/**
 * Round scope guard — did this round only touch the plants it claims?
 *
 * The other half of round-status.ts. That one asks whether every step ran for
 * the round's own plants; this asks whether any step ran on plants that were
 * not the round's. Same manifest, opposite direction: one guards against work
 * missed inside the batch, the other against work spilled outside it.
 *
 * Nothing noticed the spill before. Round 8's native_region regeneration
 * rewrote 20 settled rows because it regenerated the whole table rather than
 * the round's slice, and that surfaced only because someone read the plan
 * report by hand. Running this over round 8 finds a second case nobody had
 * spotted: draft-hardiness, which targets `hardiness_rating IS NULL`, filled
 * round 7's 76 plants at the same time (docs/curation.md#round-runbook records the count, not that those
 * rows were outside the batch).
 *
 * The check works off DB state rather than any script's own report, so it
 * covers every step of a round at once — including steps that write no report,
 * and steps nobody has written yet.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/check-round-scope.ts --round 8
 *
 * Baseline: the newest backups/ snapshot taken at or before the manifest's
 * started_at, or --baseline <dir> to name one. Step 0 of the docs/curation.md#round-runbook cadence
 * (backup-catalog.ts) is what puts it there, so a round run to the runbook
 * already has what this needs.
 *
 * THE WINDOW CAN BE CLOSED (added July 28 2026). By default it is baseline →
 * now, which is right while a round is open and rots the moment it isn't: any
 * later catalog-wide work lands inside the window and is reported as that round
 * spilling out of its batch. Round 8 showed 450 such failures, every one of
 * them the July 28 style pass — correctly detected, about a round that had been
 * finished for a day.
 *
 * Set `cleared_at` (with a `cleared_why`) in the round's scope-allow.json when
 * the round is done. Plant findings written after that moment then report as
 * ALLOWED with the timestamp that put them there, instead of failing. `--live`
 * ignores it and asks the original question.
 *
 * The archive is deliberately NOT the closing edge, though it looks like the
 * obvious candidate. It has to track the live catalog to stay restorable, so it
 * is re-captured after any later remediation and its timestamp walks forward —
 * round 8's reads hours after the round actually ended. A window that moves is
 * not a window.
 *
 * What counts as out of scope:
 *   FAIL · a data column changed on a plant the round didn't seed
 *        · a plant vanished, or appeared without being in the manifest
 *        · a companion pair between two pre-existing plants was added or removed
 *   WARN · only bookkeeping stamps changed (*_checked_at, updated_at) — guards
 *          re-stamp existing rows by design when run without --new-only
 *
 * Not every out-of-scope write is a mistake: an editorial fix to an older row
 * during a round is a real thing to do. rounds/<label>/scope-allow.json waives
 * named cases, so the answer to a legitimate one is to write down why rather
 * than to stop running the check.
 *
 * Read-only, no AI calls. Writes reports/round-scope-<label>.json so
 * archive-round.ts snapshots the result alongside the round's other guards.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readSnapshot, resolveBaselineDir } from './catalog-snapshot'
import { fetchAllRows } from '../lib/paginate'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { readRoundManifest, roundDir, sanitizeLabel } from './round-manifest'

type Row = Record<string, unknown>

// Written by guards to record "I have looked at this row", not to record a
// finding. A guard re-run without --new-only re-stamps the whole table, which
// is a legitimate whole-catalog write — worth seeing, not worth failing on.
//
// Matched by PATTERN, not by a hand-kept list. The list version had already
// rotted: `style_checked_at` shipped in migration 20260728114824 and was never
// added, so the next `curate-styles --new-only` would have been reported as an
// out-of-scope data write on every row it re-stamped. Any new bookkeeping
// column is covered the day it exists.
//
// *_reviewed_at is the verdict-stamp shape (native_to_reviewed_at, migration
// 20260813110500) — same class as editorial_checked_at, which the suffix
// pattern already covers: it records that a person read the row, never what
// the row says.
const isStampColumn = (column: string): boolean =>
  column === 'updated_at' ||
  column.endsWith('_checked_at') ||
  column.endsWith('_reviewed_at')

interface Finding {
  level: 'FAIL' | 'WARN' | 'ALLOWED'
  check: string
  plant: string
  id?: string
  detail: string
  column?: string
  before?: unknown
  after?: unknown
  why?: string
  /**
   * When the row behind this finding was written, where the row itself says so
   * (plant_combinations.created_at). Plant findings leave this unset — their
   * timestamp lives in afterPlants and is looked up by id in applyClearedAt.
   */
  writtenAt?: string
}

// rounds/<label>/scope-allow.json — the deliberate exceptions. `plant` matches
// a common name or id, `column` a plant column, `check` a whole finding kind
// (for pairings, which have no column); "*" matches any. `why` is required:
// the point of the file is the reason, not the silence.
interface AllowEntry {
  plant?: string
  column?: string
  check?: string
  why: string
}

function readAllowlist(label: string): AllowEntry[] {
  const path = join(roundDir(label), 'scope-allow.json')
  if (!existsSync(path)) return []
  const parsed = readJson<{ allow?: AllowEntry[] }>(path)
  const entries = parsed.allow ?? []
  for (const e of entries) {
    if (!e.why?.trim())
      throw new Error(
        `${path}: every entry needs a "why" (${JSON.stringify(e)})`
      )
    if (!e.column && !e.check)
      throw new Error(
        `${path}: entry needs a "column" or a "check" (${JSON.stringify(e)})`
      )
  }
  return entries
}

function matches(entry: AllowEntry, f: Finding): boolean {
  // A rename changes the name the finding reports under, so a waiver may name
  // either side of it — or the id, which never moves.
  const names = [
    f.plant,
    f.id,
    typeof f.before === 'string' ? f.before : undefined,
  ]
  const wild = (pattern: string | undefined, values: (string | undefined)[]) =>
    pattern === undefined ||
    pattern === '*' ||
    values.some((v) => v !== undefined && v === pattern)
  return (
    wild(entry.plant, names) &&
    wild(entry.column, [f.column]) &&
    wild(entry.check, [f.check]) &&
    // A column-scoped waiver must not swallow findings that have no column.
    (entry.column === undefined ||
      entry.column === '*' ||
      f.column !== undefined)
  )
}

function applyAllowlist(findings: Finding[], allow: AllowEntry[]): Finding[] {
  if (!allow.length) return findings
  return findings.map((f) => {
    if (f.level !== 'FAIL') return f
    const hit = allow.find((e) => matches(e, f))
    return hit ? { ...f, level: 'ALLOWED' as const, why: hit.why } : f
  })
}

function parseArgs(): { label: string; baseline?: string; live: boolean } {
  const args = process.argv.slice(2)
  const at = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const label = at('--round')
  if (!label) {
    console.error(
      'Usage: check-round-scope.ts --round <label> [--baseline <backup dir>] [--live]'
    )
    process.exit(1)
  }
  return { label, baseline: at('--baseline'), live: args.includes('--live') }
}

// Sets and JSON documents both round-trip through the DB with no guaranteed
// ordering, so compare them by value: string arrays as sets, objects by
// key-sorted serialization. A pure reorder is not a change anyone made.
function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) {
    const parts = value.map(canonical)
    if (value.every((v) => typeof v === 'string')) parts.sort()
    return `[${parts.join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Row)
      .map(([k, v]) => [k, canonical(v)] as const)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${v}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

/**
 * The round's declared closing edge, from `cleared_at` in scope-allow.json.
 *
 * NOT taken from the round's archive, which is the obvious-looking source and
 * the wrong one: the archive has to track the live catalog to stay restorable,
 * so it gets re-captured after any later remediation and its timestamp walks
 * forward. Round 8's read 19:46 on July 28 — the moment of a refresh, hours
 * after the round itself was done. A window that moves is not a window.
 */
function readClearedAt(label: string): { at: string; why: string } | null {
  const path = join(roundDir(label), 'scope-allow.json')
  if (!existsSync(path)) return null
  const parsed = readJson<{ cleared_at?: string; cleared_why?: string }>(path)
  if (!parsed.cleared_at) return null
  if (!parsed.cleared_why?.trim())
    throw new Error(
      `${path}: cleared_at needs a "cleared_why" saying what closed the round.`
    )
  if (!Number.isFinite(Date.parse(parsed.cleared_at)))
    throw new Error(`${path}: cleared_at is not a parseable timestamp.`)
  return { at: parsed.cleared_at, why: parsed.cleared_why }
}

/**
 * Move findings on rows written after the round closed out of FAIL.
 *
 * Without this, a closed round's check rots: any later catalog-wide work lands
 * inside a baseline → now window and is reported as that round spilling out of
 * its batch. Round 8 showed 450 such failures, every one of them the July 28
 * style pass — correctly detected, and about a round that had been finished for
 * a day.
 *
 * Plant findings are keyed on plants.updated_at, looked up by id. An
 * added-pairing finding carries its own writtenAt (plant_combinations has had
 * created_at since the initial schema — trap 16 believed otherwise, corrected
 * 2026-08-13). A REMOVED pairing still has no timestamp to judge — the row is
 * gone — so it stays where it was; waive it by name like anything else.
 *
 * This narrows what a check FAILS on. It does not hide anything: the findings
 * stay in the report under their own level, counted and labelled.
 */
function applyClearedAt(
  findings: Finding[],
  cleared: { at: string; why: string } | null,
  afterPlants: Row[]
): Finding[] {
  if (!cleared) return findings
  const closed = Date.parse(cleared.at)
  const updatedById = new Map(
    afterPlants.map((r) => [String(r.id), String(r.updated_at ?? '')])
  )
  return findings.map((f) => {
    if (f.level !== 'FAIL') return f
    const written = f.writtenAt ?? (f.id ? updatedById.get(f.id) : undefined)
    const writtenMs = Date.parse(written ?? '')
    if (!Number.isFinite(writtenMs) || writtenMs <= closed) return f
    return {
      ...f,
      level: 'ALLOWED',
      why: `written ${written}, after this round closed at ${cleared.at} — ${cleared.why}`,
    }
  })
}

function fetchAll(table: string): Promise<Row[]> {
  const db = getSupabaseAdmin()
  return fetchAllRows<Row>((from, to) =>
    db.from(table).select('*').order('id').range(from, to)
  )
}

function checkPlants(
  before: Row[],
  after: Row[],
  seeded: Set<string>
): Finding[] {
  const findings: Finding[] = []
  const beforeById = new Map(before.map((r) => [String(r.id), r]))
  const afterById = new Map(after.map((r) => [String(r.id), r]))
  const name = (r: Row) => String(r.common_name ?? r.id)

  for (const [id, old] of beforeById) {
    const now = afterById.get(id)
    if (!now) {
      findings.push({
        level: 'FAIL',
        check: 'deleted plant',
        plant: name(old),
        id,
        detail: 'present in the baseline, gone from the catalog',
      })
      continue
    }
    if (seeded.has(id)) continue // the round's own batch — in scope by definition

    const changedData: Finding[] = []
    const changedStamps: string[] = []
    for (const column of new Set([...Object.keys(old), ...Object.keys(now)])) {
      const a = canonical(old[column])
      const b = canonical(now[column])
      if (a === b) continue
      if (isStampColumn(column)) {
        changedStamps.push(column)
        continue
      }
      changedData.push({
        level: 'FAIL',
        check: `out-of-scope write: ${column}`,
        plant: name(now),
        id,
        detail: `${name(now)} — ${column} rewritten though the round never seeded it`,
        column,
        before: old[column],
        after: now[column],
      })
    }

    if (changedData.length) findings.push(...changedData)
    else if (changedStamps.length)
      findings.push({
        level: 'WARN',
        check: 'guard re-stamped an unseeded row',
        plant: name(now),
        id,
        detail: `${name(now)} — ${changedStamps.sort().join(', ')} only`,
      })
  }

  for (const [id, now] of afterById) {
    if (beforeById.has(id) || seeded.has(id)) continue
    findings.push({
      level: 'FAIL',
      check: 'unmanifested insert',
      plant: name(now),
      id,
      detail: 'new since the baseline but absent from the round manifest',
    })
  }

  return findings
}

// Companion pairs have generated ids, so identity is the endpoint pair. A pair
// is the round's business when it touches a seeded plant — curate-combinations
// pairs new plants with existing ones by design. A pair between two plants that
// both predate the round is not.
function checkCombos(
  before: Row[],
  after: Row[],
  seeded: Set<string>,
  plantNames: Map<string, string>
): Finding[] {
  const findings: Finding[] = []
  const key = (r: Row) =>
    [String(r.plant_id_a), String(r.plant_id_b)].sort().join('|')
  const label = (k: string) =>
    k
      .split('|')
      .map((id) => plantNames.get(id) ?? id)
      .join(' ↔ ')

  const beforeKeys = new Set(before.map(key))
  const afterKeys = new Set(after.map(key))
  const createdByKey = new Map(
    after.map((r) => [key(r), String(r.created_at ?? '')])
  )
  const outOfScope = (k: string) => !k.split('|').some((id) => seeded.has(id))

  for (const k of afterKeys) {
    if (beforeKeys.has(k) || !outOfScope(k)) continue
    findings.push({
      level: 'FAIL',
      check: 'out-of-scope pairing added',
      plant: label(k),
      detail: 'both plants predate the round',
      writtenAt: createdByKey.get(k) || undefined,
    })
  }
  for (const k of beforeKeys) {
    if (afterKeys.has(k) || !outOfScope(k)) continue
    findings.push({
      level: 'FAIL',
      check: 'out-of-scope pairing removed',
      plant: label(k),
      detail: 'both plants predate the round',
    })
  }

  return findings
}

const MARK = { FAIL: '✗', WARN: '⚠', ALLOWED: '·' } as const

function report(findings: Finding[], level: Finding['level']): void {
  const grouped = new Map<string, Finding[]>()
  for (const f of findings) {
    if (f.level !== level) continue
    grouped.set(f.check, [...(grouped.get(f.check) ?? []), f])
  }
  for (const [check, items] of grouped) {
    const why = level === 'ALLOWED' ? ` — waived: ${items[0]!.why}` : ''
    console.log(`\n${MARK[level]} ${check} — ${items.length}${why}`)
    // A waived group is already accounted for; the names are enough.
    if (level === 'ALLOWED') {
      console.log(`    ${items.map((f) => f.plant).join(', ')}`)
      continue
    }
    for (const f of items.slice(0, 10)) {
      console.log(`    ${f.detail}`)
      if (f.column) {
        console.log(`      before: ${format(f.before)}`)
        console.log(`      after:  ${format(f.after)}`)
      }
    }
    if (items.length > 10)
      console.log(`    … and ${items.length - 10} more (see the JSON report)`)
  }
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(empty)'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}

async function main() {
  const { label, baseline: explicitBaseline, live } = parseArgs()

  const manifest = readRoundManifest(label)
  if (!manifest) {
    console.error(
      `No manifest for round "${label}". Rounds seeded before manifests ` +
        `existed (1–7) cannot be scope-checked.`
    )
    process.exit(1)
  }
  const seeded = new Set(manifest.seeded_ids)

  const baseline = resolveBaselineDir(
    label,
    manifest.started_at,
    explicitBaseline
  )
  const baselineDir = baseline.dir
  console.log(`Round ${manifest.label} — ${seeded.size} seeded plants`)
  console.log(`Baseline: ${baselineDir} (${baseline.source})`)

  const beforePlants = readSnapshot(baselineDir, 'plants')
  const beforeCombos = readSnapshot(baselineDir, 'plant_combinations')
  if (!beforePlants || !beforeCombos)
    throw new Error(`Baseline ${baselineDir} is missing a catalog table.`)
  const clearedAt = live ? null : readClearedAt(label)
  console.log(
    clearedAt
      ? `Window: baseline → ${clearedAt.at} (cleared; later writes are reported separately)`
      : `Window: baseline → the live catalog (now)`
  )

  const [afterPlants, afterCombos] = await Promise.all([
    fetchAll('plants'),
    fetchAll('plant_combinations'),
  ])
  console.log(
    `Comparing ${beforePlants.length} → ${afterPlants.length} plants, ` +
      `${beforeCombos.length} → ${afterCombos.length} pairs.`
  )

  const plantNames = new Map(
    [...beforePlants, ...afterPlants].map((r) => [
      String(r.id),
      String(r.common_name ?? r.id),
    ])
  )
  const findings = applyClearedAt(
    applyAllowlist(
      [
        ...checkPlants(beforePlants, afterPlants, seeded),
        ...checkCombos(beforeCombos, afterCombos, seeded, plantNames),
      ],
      readAllowlist(label)
    ),
    clearedAt,
    afterPlants
  )

  report(findings, 'FAIL')
  report(findings, 'WARN')
  report(findings, 'ALLOWED')

  const fails = findings.filter((f) => f.level === 'FAIL')
  const warns = findings.filter((f) => f.level === 'WARN')
  const allowed = findings.filter((f) => f.level === 'ALLOWED')

  const reportsDir = join(process.cwd(), 'reports')
  mkdirSync(reportsDir, { recursive: true })
  const path = join(reportsDir, `round-scope-${sanitizeLabel(label)}.json`)
  writeFileSync(
    path,
    JSON.stringify(
      {
        round: manifest.label,
        baseline: baselineDir,
        // What the window closed on, so a re-run is comparable to this one.
        window: clearedAt ? 'cleared' : 'live',
        cleared_at: clearedAt?.at ?? null,
        seeded_count: seeded.size,
        plants_before: beforePlants.length,
        plants_after: afterPlants.length,
        counts: {
          fail: fails.length,
          allowed: allowed.length,
          warn: warns.length,
        },
        findings,
      },
      null,
      2
    ) + '\n'
  )

  console.log(
    `\n${fails.length ? '✗' : '✓'} ${fails.length} out-of-scope change(s), ` +
      `${allowed.length} waived, ${warns.length} warning(s). Report → ${path}`
  )
  if (fails.length) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
