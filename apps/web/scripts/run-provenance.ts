/**
 * Write provenance: which invocation produced the value that is in the row now.
 *
 * WHAT THIS IS FOR. The pipeline already records where a plant ENTERED the
 * catalog — `rounds/<label>/manifest.json` is batch membership. It records
 * nothing about where a VALUE came from. Those are different axes and they
 * cannot be collapsed, because the interesting writes do not happen in the
 * round that seeded the row: `curate-styles --round 9` re-judged 100 rows on
 * 2026-08-15, months outside round 9's manifest window; a full-catalog region
 * sweep once rewrote 20 settled rows alongside round 8's 101; and
 * `apply-native-to-fixes` rewrites prose from a committed decision file at any
 * time, across rounds. Round provenance answers membership. Run provenance
 * answers mutation.
 *
 * THE CHAIN. A value's stamp is the observable an invocation leaves behind:
 *
 *   value → its stamp → candidate runs → run id → declared write-set → recipe
 *
 * Note that it does NOT go stamp → step. Column-to-writer is many-to-many by
 * design: `style_checked_at` is written by both `curate-plants` and
 * `curate-styles`; `native_checked_at` has four writers, three of which CLEAR
 * it as a cascade. So the run record declares its write-set explicitly and the
 * step is never inferred from the column.
 *
 * WHY A COMMITTED LOG AND NOT A TABLE. The log is deliberately NOT
 * authoritative. The database stamps are the evidence; this is the runner's
 * recorded interpretation of them, so verification can ask whether the two
 * agree. That argues for the same home as round provenance — committed, diffable,
 * immutable by convention, no RLS, no backup semantics of its own, and it
 * travels with the code that produced it.
 *
 * THE SHELF LIFE, WHICH IS THE PROPERTY THAT SHAPES THE DESIGN. The log is
 * append-only; its database witnesses are not. Stamps and `updated_at` are
 * overwritten in place, so `declared write-set ↔ observed changes ↔ row count`
 * is checkable only while that invocation's evidence is still the most recent
 * thing to have touched those columns. Verification therefore happens at
 * FINALISATION, inside the run, not in a later reconciliation job. A provenance
 * log verified when someone thinks to ask is verified after its evidence has
 * decayed.
 *
 * WHAT A CLEARED STAMP MEANS. Three writers express "this value is no longer
 * certified" by nulling the stamp. That is intentional and intentionally lossy:
 * the stamp is CURRENT CERTIFICATION STATE, not an audit trail. So this chain
 * answers "what produced the currently certified value?" and does not answer
 * "what has ever happened to this value?". The run log answers the second
 * question at run granularity, and nothing associates a cleared row with the
 * run that once certified it. That is a boundary of the design, not a defect in
 * it — fixing it would turn the stamp into two things at once.
 *
 * WHAT IS NOT HERE, deliberately: no per-row provenance column, no `stale`
 * flag (staleness is a query over provenance and policy, not row state), no
 * database table, and no human-maintained prompt version number.
 */

import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { REPO_ROOT } from './token-source'

export const RUNS_DIR = join(REPO_ROOT, 'apps/web/runs')

/** How an invocation ended. Never inferred — always one of these three. */
export type RunOutcome = 'completed' | 'interrupted' | 'failed'

export interface RunRecord {
  run_id: string
  step: string
  started_at: string
  finished_at: string
  outcome: RunOutcome
  /** Free-form scope description, for reading. NOT the provenance key. */
  scope: string | null
  model: string | null
  recipe_hash: string
  /** Columns this invocation declared it may MUTATE. An assertion. */
  write_set: string[]
  /** How that mutation was observed at finalisation. See Witness. */
  evidence: Witness[]
  /**
   * Rows this invocation VERIFIED it affected. Never the intended scope: an
   * interrupted run's honest count is what it actually got through.
   */
  row_count: number
  /** Finalisation-time comparison of the claim against the evidence. */
  verification: {
    checked: boolean
    agrees: boolean
    /** Per column in the write-set: rows whose stamp lands inside the window. */
    observed: Record<string, number>
    notes: string[]
  }
  /** Present only when outcome is 'failed'. */
  error?: string
}

// ---------------------------------------------------------------------------
// The recipe
// ---------------------------------------------------------------------------

/**
 * Everything that is constant ACROSS ROWS within one invocation: the model, the
 * assembled prompt template, the shared vocabularies and standards it embeds,
 * and any decoding parameters.
 *
 * The per-row subject and its evidence are deliberately excluded. They are what
 * the recipe was applied TO, not the recipe — including them would produce one
 * hash per plant and destroy the cohort identity that makes the hash useful.
 *
 * WHY A HASH AND NOT A VERSION NUMBER. A `prompt_version = 7` maintained by a
 * person is another piece of state whose correctness depends on somebody
 * remembering to increment it, and every hand-maintained fact in this repo has
 * rotted at least once. A hash of the assembled input is content identity for
 * free and cannot disagree with the thing it describes. It tells you THAT the
 * recipe changed, not what changed — and it does not need to, because the
 * ingredients are constants in tracked files, so git already holds the text and
 * the hash is a deterministic pointer into it.
 *
 * WHY "ASSEMBLED" AND NOT THE PROMPT CONSTANT. Five scripts embed shared
 * vocabulary into their prompts — the style tag list, the WGSRPD Level 2 region
 * vocabulary, the voice and tag standards. In July the region vocabulary was
 * replaced wholesale (`mediterranean/balkans/croatia` gave way to WGSRPD L2). A
 * hash over the prompt constant alone would have been blind to that, and it is
 * exactly the change that should invalidate a cohort. The dangerous failure is
 * not the prompt changing; it is the effective recipe changing while the
 * apparent prompt identity holds still.
 *
 * DECODING PARAMETERS ARE PART OF THE RECIPE, and they are not hypothetical:
 * every calling script already sets `max_tokens`, and they all set it
 * differently — 16 for the hardiness rating, 256 for a style verdict, 2048 for
 * a full draft. `draft-hardiness` at 16 tokens is a materially different
 * operation from the same model at 2048, and a truncated response is a
 * different output rather than a worse one.
 *
 * So pass decoding parameters through from the start. Nothing sets
 * `temperature` today, and "nothing is configured today" is not a stable
 * contract: the day someone sets it, the recipe must change automatically
 * rather than depending on that person remembering that temperature is part of
 * the recipe.
 */
export interface Recipe {
  model?: string | null
  /** The prompt template(s) as assembled, before per-row substitution. */
  template: string | string[]
  /** Shared vocabularies and standards the template embeds. */
  ingredients?: Record<string, unknown>
  /** Decoding parameters, if any are ever set. */
  decoding?: Record<string, unknown>
}

/** Stable JSON: object keys sorted at every depth, so key order cannot move the hash. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`
    )
    .join(',')}}`
}

export function recipeHash(recipe: Recipe): string {
  const payload = canonical({
    model: recipe.model ?? null,
    template: Array.isArray(recipe.template)
      ? recipe.template
      : [recipe.template],
    ingredients: recipe.ingredients ?? {},
    decoding: recipe.decoding ?? {},
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------

/** One file per month, so the log stays readable and diffs stay small. */
export function logPathFor(iso: string): string {
  return join(RUNS_DIR, `${iso.slice(0, 7)}.jsonl`)
}

export function appendRunRecord(record: RunRecord): string {
  mkdirSync(RUNS_DIR, { recursive: true })
  const path = logPathFor(record.started_at)
  appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8')
  return path
}

export function readRunRecords(month: string): RunRecord[] {
  const path = join(RUNS_DIR, `${month}.jsonl`)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunRecord)
}

// ---------------------------------------------------------------------------
// Evidence: how a mutation can be OBSERVED, which is not the same question as
// what the invocation is allowed to change.
//
// The first version of this module had one list doing both jobs, and it broke on
// the second script it would have touched. `finish()` verified every write-set
// member with `gte(column, startedAt).lte(column, finishedAt)`, which is only
// meaningful for a timestamp column — but the contract allowed the write-set to
// name value columns (`seasonal_care`, `native_region`, `image_candidates`), and
// `curate-combinations` does not write to `plants` at all.
//
// Measured, rather than assumed: that query against `seasonal_care` returns
// `count = null` with an EMPTY error message. So verification would not have
// cried wolf — it would have quietly degraded to `checked: false` with a note
// reading like a transient database failure, on every non-stamp script, forever.
// A check that stops working and looks like bad luck is the worst of the three
// possible failure modes, and it is the same shape as trap 1.
//
// So the two are separate:
//
//   writeSet  — DECLARED MUTATION. What this invocation is allowed to change.
//               An assertion, reviewable in the record, never inferred.
//   evidence  — VERIFICATION WITNESS. How that mutation can be independently
//               observed at finalisation, which differs by column and by table.
//
// For a stamp-producing pass the two nearly coincide, which is why the default
// derives stamp witnesses from the write-set and most callers pass no evidence at
// all. For everything else the caller must say how its write is observable — or
// say that it is not, and why. "I cannot verify this" is an acceptable answer;
// "I verified this" when the query is meaningless is not.
// ---------------------------------------------------------------------------

/**
 * Column suffixes that are timestamps, and therefore window-queryable.
 *
 * NOT `stamp-columns.ts`'s vocabulary, deliberately, and the difference is the
 * same lesson that file already carries: two consumers can ask different
 * questions of one word. There, "is this a stamp?" is about a column's ROLE —
 * widening it to include `_drafted_at` would make `check-round-scope` treat
 * `ai_drafted_at` as bookkeeping and let an out-of-scope drafting write pass.
 * Here the question is about a column's TYPE: can I compare it to an instant.
 * `ai_drafted_at` answers yes to the second and no to the first.
 */
const WINDOW_QUERYABLE_SUFFIXES = [
  '_checked_at',
  '_verified_at',
  '_reviewed_at',
  '_drafted_at',
] as const

export function isWindowQueryable(column: string): boolean {
  return WINDOW_QUERYABLE_SUFFIXES.some((suffix) => column.endsWith(suffix))
}

export type Witness =
  /** A timestamp column on `plants`: count rows whose value lands in the window. */
  | { kind: 'stamp'; covers: string; column: string }
  /**
   * The row's own mutation timestamp. `plants.updated_at` is trigger-maintained;
   * `plant_combinations` rows carry `created_at` and are inserted, never updated.
   * Weaker than a stamp — it sees ANY write to the row, including another
   * invocation's — so it bounds the claim rather than confirming it.
   */
  | {
      kind: 'row-touched'
      covers: string
      table: 'plants' | 'plant_combinations'
      column: string
    }
  /** Declared unobservable at finalisation, with the reason recorded. */
  | { kind: 'none'; covers: string; reason: string }

/**
 * The default: every window-queryable member of the write-set witnesses itself.
 *
 * `covers` names the write-set member; `column` names what is actually queried.
 * They coincide for a stamp and diverge everywhere else — `curate-combinations`
 * declares it mutates `plant_combinations` (a TABLE, not a column) and is
 * witnessed by that table's `created_at`. A write-set member is "what was
 * mutated", which is not always a column, and conflating the two is what this
 * field exists to prevent.
 */
export function defaultEvidence(writeSet: string[]): Witness[] {
  return writeSet
    .filter(isWindowQueryable)
    .map((column) => ({ kind: 'stamp' as const, covers: column, column }))
}

// ---------------------------------------------------------------------------
// The invocation handle
// ---------------------------------------------------------------------------

export interface BeginRunOptions {
  /** The step name, matching round-status.ts's STEP_DEFS where one exists. */
  step: string
  /**
   * Columns this invocation may MUTATE. Declared, never inferred from the column
   * name, because column-to-writer is many-to-many.
   */
  writeSet: string[]
  /**
   * How the mutation can be observed. Omit it and every window-queryable member
   * of the write-set witnesses itself, which is right for a stamp-producing
   * pass. A write-set member that is NOT window-queryable must appear here, or
   * beginRun throws — a value column cannot be verified by comparing it to an
   * instant, and pretending otherwise is how verification dies quietly.
   */
  evidence?: Witness[]
  recipe: Recipe
  scope?: string | null
  /** Injected in tests. */
  now?: () => string
  countRows?: (witness: Witness, from: string, to: string) => Promise<number>
  append?: (record: RunRecord) => string
  log?: (line: string) => void
  /** Install SIGINT/SIGTERM handlers. Off in tests. */
  trapSignals?: boolean
}

export interface RunHandle {
  runId: string
  startedAt: string
  /**
   * Record a failure that is not a thrown exception — "every row errored", "the
   * decision file was stale". Lets a script use withRunRecord (which owns the
   * control flow) instead of calling finish by hand for a soft failure.
   */
  markFailed: (reason: string) => void
  /** The soft failure recorded by markFailed, if any. Read by withRunRecord. */
  softFailure: () => string | null
  /** Count a row this invocation actually wrote. Call it as you go. */
  countWritten: (n?: number) => void
  /** Terminal path: verify the claim against the evidence, then record it. */
  finish: (
    outcome: RunOutcome,
    extra?: { error?: string; rowCount?: number }
  ) => Promise<RunRecord>
}

const nowIso = () => new Date().toISOString()

/**
 * Rows whose `column` timestamp lands inside the window. The second witness for
 * a claimed write is the stamp itself; `updated_at` is a third, and has the same
 * in-place-overwrite shelf life.
 */
async function countByWitness(
  witness: Witness,
  from: string,
  to: string
): Promise<number> {
  if (witness.kind === 'none') return 0
  const table = witness.kind === 'stamp' ? 'plants' : witness.table
  const db = getSupabaseAdmin()
  const { count, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte(witness.column, from)
    .lte(witness.column, to)
  if (error) {
    throw new Error(
      `Provenance count failed for ${table}.${witness.column}: ` +
        `${error.message || `${error.code ?? 'no message'} — is that column a timestamp?`}`
    )
  }
  return count ?? 0
}

/**
 * Open an invocation.
 *
 * EVERY INVOCATION PRODUCES A RECORD, including the ugly ones — Ctrl-C at row
 * 279, an API failure at row 400, a repair pass outside any round. Those are
 * exactly the cases where intent cannot reconstruct provenance later, so they
 * are first-class history rather than gaps. Steps here are resumable by design
 * (this pipeline has had a guard killed at 279 of 494 and resumed from the
 * stamp), and a resumed invocation is a SEPARATE run with its own id: it may
 * have had a different recipe, and one id spanning both halves would be a lie.
 *
 * The record is written at FINALISATION, never optimistically at startup. A
 * record written on the way in would recreate the exact "the timestamp proves
 * the work happened" ambiguity this exists to remove.
 *
 * Honest limit: a process that dies without running its handler — SIGKILL,
 * power loss — leaves stamps and no record. Those are detectable afterwards as
 * stamps that fall inside no recorded window, which is the log-versus-evidence
 * check run in the other direction.
 */
export function beginRun(opts: BeginRunOptions): RunHandle {
  const {
    step,
    writeSet,
    recipe,
    scope = null,
    now = nowIso,
    countRows = countByWitness,
    append = appendRunRecord,
    log = console.log,
    trapSignals = true,
  } = opts

  if (!writeSet.length) {
    throw new Error(
      `beginRun("${step}") declared an empty write-set. A step that writes no ` +
        `stamp does not need a run record; a step that does must say which.`
    )
  }

  const evidence = opts.evidence ?? defaultEvidence(writeSet)

  // Fail HERE, not at finalisation. A write-set member with no witness is a
  // programming error, and the whole point of the fix is that it must not present
  // itself later as an unlucky database read.
  const unwitnessed = writeSet.filter(
    (member) => !evidence.some((w) => w.covers === member)
  )
  if (unwitnessed.length) {
    throw new Error(
      `beginRun("${step}") declares ${unwitnessed.join(', ')} in its write-set ` +
        `with no evidence witness. A value column cannot be verified by comparing ` +
        `it to an instant. Pass evidence: either a { kind: 'row-touched' } witness ` +
        `naming the table's own mutation timestamp, or { kind: 'none', reason } to ` +
        `record that this write is not observable at finalisation and why.`
    )
  }

  const startedAt = now()
  const hash = recipeHash(recipe)
  // The id is the IDENTITY of the provenance event, so it carries a random
  // component and is not derived from the step, the instant and the recipe.
  // Deriving it would reintroduce the collision it exists to prevent: two
  // invocations of the same step, same recipe, same millisecond produce the same
  // derived label — and overlapping invocations are a normal operating condition
  // here, because there is no global lock and the worktree workflow encourages
  // parallel sessions against one database. The first version of this function
  // did derive it, and its own test collided on the first run.
  //
  // The timestamp and step stay in the string for grepping and sorting; the
  // randomness is what makes it an identity.
  const runId = `${step}-${startedAt.replace(/[:.]/g, '').slice(0, 15)}-${randomBytes(4).toString('hex')}`

  let written = 0
  let settled = false
  let softFailureReason: string | null = null

  const finish = async (
    outcome: RunOutcome,
    extra: { error?: string; rowCount?: number } = {}
  ): Promise<RunRecord> => {
    const finishedAt = now()
    const rowCount = extra.rowCount ?? written
    const observed: Record<string, number> = {}
    const notes: string[] = []
    let checked = true
    let agrees = true

    for (const witness of evidence) {
      if (witness.kind === 'none') {
        notes.push(
          `${witness.covers} is not observable at finalisation: ${witness.reason}`
        )
        continue
      }
      try {
        observed[witness.covers] = await countRows(
          witness,
          startedAt,
          finishedAt
        )
      } catch (err) {
        checked = false
        notes.push(
          `could not observe ${witness.covers}: ${(err as Error).message}`
        )
      }
    }

    // Nothing observable means nothing was verified. Say so rather than letting
    // an empty comparison read as agreement.
    if (!Object.keys(observed).length) {
      checked = false
      notes.push(
        'no observable witness in this run, so the row count is recorded unverified'
      )
    }

    if (checked) {
      const maxObserved = Math.max(0, ...Object.values(observed))
      // The claim is about THIS invocation's work. A column can legitimately
      // show more than row_count when another invocation touched it inside the
      // same window — overlapping runs are possible — so a disagreement is
      // recorded and read, never thrown.
      if (maxObserved < rowCount) {
        agrees = false
        notes.push(
          `claimed ${rowCount} row(s) but no declared column shows more than ` +
            `${maxObserved} stamped inside the window — the claim is larger than its evidence`
        )
      }
      if (rowCount === 0 && maxObserved > 0) {
        agrees = false
        notes.push(
          `claimed 0 rows but ${maxObserved} stamp(s) moved inside the window`
        )
      }
      if (outcome === 'completed' && rowCount === 0) {
        notes.push(
          'completed with nothing to do — vacuous, not evidence of work'
        )
      }
    }

    const record: RunRecord = {
      run_id: runId,
      step,
      started_at: startedAt,
      finished_at: finishedAt,
      outcome,
      scope,
      model: recipe.model ?? null,
      recipe_hash: hash,
      write_set: [...writeSet].sort(),
      evidence,
      row_count: rowCount,
      verification: { checked, agrees, observed, notes },
      ...(extra.error ? { error: extra.error } : {}),
    }

    settled = true
    const path = append(record)
    log(
      `\nrun ${runId} — ${outcome}, ${rowCount} row(s), recipe ${hash}` +
        (checked && !agrees ? '  ⚠ claim disagrees with evidence' : '') +
        `\n  recorded in ${path.replace(`${REPO_ROOT}/`, '')}`
    )
    if (checked && !agrees) for (const n of notes) log(`  ⚠ ${n}`)
    return record
  }

  if (trapSignals) {
    // Ctrl-C at row 279 must leave a truthful partial record, not a gap.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        if (settled) process.exit(130)
        finish('interrupted', { error: `received ${signal}` })
          .catch((err) =>
            console.error(`Provenance record failed: ${err.message}`)
          )
          .finally(() => process.exit(130))
      })
    }
  }

  return {
    runId,
    startedAt,
    markFailed: (reason: string) => {
      softFailureReason ??= reason
    },
    softFailure: () => softFailureReason,
    countWritten: (n = 1) => {
      written += n
    },
    finish,
  }
}

/**
 * THE CANONICAL PATTERN. Wrap a step's body so every terminal path records
 * exactly once, without the script keeping track.
 *
 * Prefer this over calling `beginRun` and `finish` by hand. The reason is not
 * tidiness: a source scan can prove that a file which opens a run also contains
 * a `finish` call somewhere, and it CANNOT prove that finalisation happens on
 * every control-flow path. This wrapper makes that guarantee structurally, so the
 * guarantee stops depending on each script's author getting the bookkeeping
 * right. Raw `beginRun` is for a script that genuinely needs to own the terminal
 * paths — resume logic, its own signal handling — and that choice should be
 * visible in the diff.
 *
 * Outcomes: the body returning records `completed`; the body throwing records
 * `failed` and re-throws, so the caller's exit code is unchanged; and
 * `run.markFailed(reason)` records `failed` without an exception, which is the
 * shape of "the pass ran and every row errored".
 */
export async function withRunRecord<T>(
  opts: BeginRunOptions,
  body: (run: RunHandle) => Promise<T>
): Promise<T> {
  const run = beginRun(opts)
  try {
    const result = await body(run)
    const soft = run.softFailure()
    await run.finish(soft ? 'failed' : 'completed', {
      ...(soft ? { error: soft } : {}),
    })
    return result
  } catch (err) {
    await run.finish('failed', { error: (err as Error).message })
    throw err
  }
}
