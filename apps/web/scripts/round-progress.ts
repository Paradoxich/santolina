/**
 * round-progress — where does this round actually stand, and what is next?
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/round-progress.ts --round 8
 *   pnpm round:progress --round 8
 *
 * It runs nothing and costs nothing: no Claude calls, no writes, two read-only
 * queries and a handful of stat() calls. Exits 1 while anything FAIL-level is
 * outstanding, 0 when the round is genuinely finished.
 *
 * WHY THIS EXISTS. Finishing a *pass* and finishing a *round* feel identical
 * and are not. A curation script prints a tidy summary and looks done, so the
 * docs/curation.md#round-runbook book-end steps — the backup, archive-round, check-round-scope, the log
 * entry — get skipped without anything going red. That is not hypothetical:
 * round 8's committed archive sat stale for six hours after two remediation
 * passes, and restoring it would have silently reverted ~200 rows *while
 * reporting success* (docs/database-log.md, July 28). The steps that get
 * skipped are the free ones, because the expensive ones announce themselves.
 *
 * TWO KINDS OF EVIDENCE, DELIBERATELY KEPT APART:
 *
 *   · Pipeline steps are read from DB state via scripts/round-status.ts.
 *     STEP_DEFS is DB-state-only on purpose — state is what survives a killed
 *     run, a re-run, or a different machine.
 *   · Round artifacts are files, checked here and nowhere else. They are the
 *     opposite kind of evidence: reports/ and backups/ are gitignored and
 *     machine-local, so an artifact check is fallible by design. Folding these
 *     into STEP_DEFS would blur the registry's one strong guarantee, and would
 *     also break catalog-state.ts, which renders that registry as a per-plant
 *     coverage table an artifact has no denominator for.
 *
 * WHAT IT DOES NOT ASSERT: that verify-round ran. There is no verify-round
 * artifact and inventing one would be weaker evidence than the DB state this
 * script already re-derives. verify-round checks catalog-wide validity;
 * round-progress checks per-round completeness. Neither substitutes for the
 * other, so a clean run points at verify-round rather than claiming its job.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { readRoundManifest, roundDir, sanitizeLabel } from './round-manifest'
import { resolveBaselineDir, catalogDir } from './catalog-snapshot'
import { roundStatus, formatStatus, type StepStatus } from './round-status'

const TSX = './node_modules/.bin/tsx --env-file=.env.local'
const DB_LOG = join(process.cwd(), '..', '..', 'docs', 'database-log.md')

// ---------------------------------------------------------------------------
// Artifact checks
// ---------------------------------------------------------------------------

interface Ctx {
  label: string
  startedAt: string
  dir: string
  /** Newest updated_at across the catalog, for the staleness check. */
  newestWrite: string | null
}

interface CheckResult {
  ok: boolean
  detail: string
  /** Downgrade a passing check to a note, or a failing one to a warning. */
  level?: 'WARN'
}

interface ArtifactCheck {
  /** Runbook position — orders the output and picks the next action. */
  runbook: string
  step: string
  level: 'FAIL' | 'WARN'
  check: (ctx: Ctx) => CheckResult
  /** The exact command that fixes it. */
  remedy: string
}

/** Paths are shown relative to apps/web — an absolute path buries the answer. */
function rel(p: string): string {
  const cwd = process.cwd()
  return p.startsWith(cwd) ? p.slice(cwd.length + 1) || '.' : p
}

function fileCount(dir: string): number {
  if (!existsSync(dir)) return 0
  return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).length
}

const ARTIFACT_CHECKS: ArtifactCheck[] = [
  {
    runbook: '0',
    step: 'backup-catalog',
    level: 'FAIL',
    remedy: `${TSX} scripts/backup-catalog.ts`,
    check: (ctx) => {
      try {
        const { dir, source } = resolveBaselineDir(ctx.label, ctx.startedAt)
        // The archive fallback means the round has a rollback point but the
        // local backup it came from is gone — worth saying, not worth failing.
        return {
          ok: true,
          detail:
            source === 'archive'
              ? `rollback point: ${rel(dir)} (from the committed archive — no local backups/ entry survives)`
              : `rollback point: ${rel(dir)} (${source})`,
        }
      } catch (err) {
        return { ok: false, detail: (err as Error).message }
      }
    },
  },
  {
    runbook: '8a',
    step: 'archive-round',
    level: 'FAIL',
    remedy: `${TSX} scripts/archive-round.ts --round <label>`,
    check: (ctx) => {
      const dir = join(ctx.dir, 'reports')
      const n = fileCount(dir)
      return n > 0
        ? { ok: true, detail: `${rel(dir)} — ${n} file(s)` }
        : {
            ok: false,
            detail: `no reports archived at ${rel(dir)}; the round's findings exist only in the gitignored reports/`,
          }
    },
  },
  {
    runbook: '8b',
    step: 'archive-round',
    level: 'FAIL',
    remedy: `${TSX} scripts/archive-round.ts --round <label> --catalog-only`,
    check: (ctx) => {
      const meta = join(catalogDir(ctx.label), 'meta.json')
      if (!existsSync(meta))
        return { ok: false, detail: `no catalog archive at ${rel(meta)}` }
      const parsed = JSON.parse(readFileSync(meta, 'utf8')) as {
        counts?: { before?: Record<string, number> }
      }
      const before = parsed.counts?.before?.plants ?? 0
      // archive-round warns but continues when the baseline can't be resolved,
      // so meta.json existing is not the same as having something to roll back
      // to. An archive holding only `after` is provenance, not recovery.
      return before > 0
        ? { ok: true, detail: `baseline archived — ${before} plants before` }
        : {
            ok: false,
            detail: `${rel(meta)} has no before-counts: the archive holds an "after" snapshot and no rollback point`,
          }
    },
  },
  {
    runbook: '8c',
    step: 'archive-round',
    level: 'WARN',
    remedy: `${TSX} scripts/archive-round.ts --round <label> --catalog-only`,
    check: (ctx) => {
      const meta = join(catalogDir(ctx.label), 'meta.json')
      if (!existsSync(meta) || !ctx.newestWrite)
        return {
          ok: true,
          detail: 'not checked (no archive or no catalog rows)',
        }
      const capturedAt = (
        JSON.parse(readFileSync(meta, 'utf8')) as { captured_at?: string }
      ).captured_at
      if (!capturedAt) return { ok: true, detail: 'archive has no captured_at' }
      // The July 28 trap, encoded: a remediation pass after the archive makes
      // the committed snapshot silently wrong, and a restore from it reports
      // success while reverting the pass.
      return Date.parse(ctx.newestWrite) <= Date.parse(capturedAt)
        ? { ok: true, detail: `archive is current (captured ${capturedAt})` }
        : {
            ok: false,
            detail: `STALE — catalog written ${ctx.newestWrite}, archived ${capturedAt}; restoring it would revert everything since`,
          }
    },
  },
  {
    runbook: '8d',
    step: 'check-round-scope',
    level: 'FAIL',
    remedy: `${TSX} scripts/check-round-scope.ts --round <label>`,
    check: (ctx) => {
      const name = `round-scope-${sanitizeLabel(ctx.label)}.json`
      const archived = join(ctx.dir, 'reports', name)
      const fresh = join(process.cwd(), 'reports', name)
      if (existsSync(archived)) return { ok: true, detail: rel(archived) }
      if (existsSync(fresh))
        return { ok: true, detail: `${rel(fresh)} (not yet archived)` }
      return {
        ok: false,
        detail: `no scope report — nothing has asked whether this round wrote outside its own batch`,
      }
    },
  },
  {
    runbook: '8e',
    step: 'log-db-session',
    level: 'FAIL',
    remedy: `${TSX} scripts/log-db-session.ts --round <label>`,
    check: (ctx) => {
      if (!existsSync(DB_LOG))
        return { ok: false, detail: `${rel(DB_LOG)} does not exist` }
      // Same shape the pre-commit hook matches, so the two agree.
      const re = new RegExp(
        `^### .* — Round ${sanitizeLabel(ctx.label)}([^0-9a-zA-Z]|$)`,
        'm'
      )
      return re.test(readFileSync(DB_LOG, 'utf8'))
        ? { ok: true, detail: 'entry present in docs/database-log.md' }
        : {
            ok: false,
            detail: `no "### <date> — Round ${sanitizeLabel(ctx.label)}" entry in docs/database-log.md`,
          }
    },
  },
]

// ---------------------------------------------------------------------------
// Evaluation — pure, so it can be tested without a database or a filesystem
// ---------------------------------------------------------------------------

export interface EvaluatedArtifact {
  runbook: string
  step: string
  level: 'FAIL' | 'WARN'
  result: CheckResult
  remedy: string
}

export interface Evaluation {
  complete: boolean
  fails: number
  warns: number
  /** The single command to run next, or null when the round is finished. */
  next: string | null
}

export function evaluateRound(
  steps: StepStatus[],
  artifacts: EvaluatedArtifact[]
): Evaluation {
  const stepFails = steps.filter((s) => !s.complete && s.level === 'FAIL')
  const stepWarns = steps.filter((s) => !s.complete && s.level === 'WARN')
  const artFails = artifacts.filter(
    (a) => !a.result.ok && a.level === 'FAIL' && a.result.level !== 'WARN'
  )
  const artWarns = artifacts.filter(
    (a) => !a.result.ok && (a.level === 'WARN' || a.result.level === 'WARN')
  )

  // One next action, in runbook order: the backup precedes the steps, every
  // other artifact follows them. A menu would reproduce the ambiguity this
  // script exists to remove.
  const backup = artFails.find((a) => a.runbook === '0')
  let next: string | null = null
  if (backup) next = backup.remedy
  else if (stepFails.length)
    next = `${TSX} scripts/${stepFails[0]!.step}.ts --round <label>`
  else if (artFails.length) next = artFails[0]!.remedy

  return {
    complete: !stepFails.length && !artFails.length,
    fails: stepFails.length + artFails.length,
    warns: stepWarns.length + artWarns.length,
    next,
  }
}

// ---------------------------------------------------------------------------

function parseRound(): string | null {
  const args = process.argv.slice(2)
  const i = args.indexOf('--round')
  if (i < 0) return null
  const v = args[i + 1]
  return !v || v.startsWith('--') ? null : v
}

async function newestCatalogWrite(): Promise<string | null> {
  const db = getSupabaseAdmin()
  // limit(1), so standing rule 5 does not apply.
  const { data, error } = await db
    .from('plants')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`Reading newest write failed: ${error.message}`)
  return (data?.[0]?.updated_at as string | undefined) ?? null
}

async function main() {
  const label = parseRound()
  if (!label) {
    console.error(
      '\nUsage: round-progress.ts --round <label>\n\n' +
        'The label is a round directory under apps/web/rounds/, written by the\n' +
        'seed run. Without one there is no batch to report on.\n'
    )
    process.exit(1)
  }

  const manifest = readRoundManifest(label)
  if (!manifest) {
    console.error(
      `\nNo manifest for round "${label}" — expected ` +
        `rounds/${sanitizeLabel(label)}/manifest.json.\n\n` +
        `Seed runs write it (seed-plants.ts --round <label>), and every guard\n` +
        `scopes by it. Rounds 1-7 predate manifests and cannot be reported on.\n`
    )
    process.exit(1)
  }

  const steps = await roundStatus(manifest.seeded_ids)
  const ctx: Ctx = {
    label,
    startedAt: manifest.started_at,
    dir: roundDir(label),
    newestWrite: await newestCatalogWrite(),
  }
  const artifacts: EvaluatedArtifact[] = ARTIFACT_CHECKS.map((c) => ({
    runbook: c.runbook,
    step: c.step,
    level: c.level,
    result: c.check(ctx),
    remedy: c.remedy.replace('<label>', label),
  }))

  const verdict = evaluateRound(steps, artifacts)

  console.log(
    `\nRound ${sanitizeLabel(label)} — ${manifest.seeded_count} seeded plant(s), ` +
      `seeded ${manifest.started_at.slice(0, 10)} (rounds/${sanitizeLabel(label)}/manifest.json)`
  )

  console.log('\nPipeline steps — DB state, via scripts/round-status.ts')
  for (const line of formatStatus(steps)) console.log(`  ${line}`)

  console.log('\nRound artifacts — files on disk')
  for (const a of artifacts) {
    const mark = a.result.ok
      ? '✓'
      : a.level === 'WARN' || a.result.level === 'WARN'
        ? '⚠'
        : '✗'
    console.log(
      `  ${mark} ${`${a.runbook}.`.padEnd(4)} ${a.step.padEnd(18)} ${a.result.detail}`
    )
  }

  const warnNote = verdict.warns ? ` (${verdict.warns} warning(s))` : ''
  if (verdict.complete) {
    console.log(
      `\n✓ Round ${sanitizeLabel(label)} is complete — ` +
        `${steps.length}/${steps.length} steps, ${artifacts.length}/${artifacts.length} artifacts${warnNote}.`
    )
    console.log(
      `\nNEXT  verify-round leaves no artifact, so it is not asserted above.\n` +
        `      Run it before calling the round done — it checks catalog-wide\n` +
        `      invariants that per-round step counts cannot see:\n` +
        `        ${TSX} scripts/verify-round.ts --round ${label}`
    )
  } else {
    console.log(
      `\n✗ Round ${sanitizeLabel(label)} is NOT complete — ` +
        `${verdict.fails} outstanding${warnNote}.`
    )
    if (verdict.next) console.log(`\nNEXT  ${verdict.next}`)
    process.exit(1)
  }
}

// Importable for tests without running main().
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
