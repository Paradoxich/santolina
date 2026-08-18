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
import {
  readUsageMeter,
  usageSince,
  type UsageMeter,
} from '../lib/anthropic-client'
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
  /**
   * How much the database substantiated this run's claim at finalisation.
   *
   *   confirmed    — a confirming witness supports the claim. Requires
   *                  established exclusivity, so nothing produces this today.
   *   corroborated — a stamp moved consistently with the claim, but other
   *                  writers of that column could have been running. Consistent
   *                  with the claim; not attributable to this run.
   *   bounded      — only a bounding witness was available.
   *   unverified   — nothing observable, or every observation failed.
   *   contradicted — a stamp disagrees with the claim. A corroborating witness
   *                  can produce this too; see WitnessStrength for why the
   *                  direction is deliberately asymmetric.
   *
   * Replaced an earlier `{ checked, agrees }` pair, which reported a bounding
   * witness as agreement and so overstated what the evidence said.
   */
  verification: {
    substantiation:
      | 'confirmed'
      | 'corroborated'
      | 'bounded'
      | 'unverified'
      | 'contradicted'
    /** Keyed by what each witness COVERS. */
    observed: Record<string, number>
    /** How this run established it was the only writer. Recorded, not assumed. */
    exclusivity: Exclusivity
    notes: string[]
  }
  /**
   * Tokens billed between this run's start and its finish, keyed
   * `${model}:${mode}` — see UsageMeter. Absent when the run made no API call,
   * which is most of the book-end steps, and absent from every record written
   * before 2026-08-17.
   *
   * WHY IT IS A MEASUREMENT AND NOT A COST. The record holds tokens; dollars
   * are derived at read time from a price table that belongs to whoever is
   * reading, because prices change and the run does not. Standing rule 14: the
   * derivable number does not get a second home.
   *
   * WHY IT SITS BESIDE row_count RATHER THAN INSIDE verification. It is not
   * evidence of anything. The database cannot corroborate a token count — it is
   * the run's own report of what it was told it spent, and unlike the row count
   * there is no witness that could disagree. Reading it as verified would be the
   * same mistake `{ checked, agrees }` made.
   *
   * WHY IT IS PROCESS-WIDE AND WINDOWED, not attributed call by call. The meter
   * lives in the client (lib/anthropic-client.ts) so no call site has to
   * remember it exists. The cost of that is the same ambiguity every window in
   * this file has: two runs open concurrently IN ONE PROCESS would each claim
   * the other's tokens. Nothing does that today — a step is one process, and
   * parallel work here means parallel worktrees, which are separate meters.
   */
  usage?: UsageMeter
  /**
   * The recipe named a model, rows were written, and the meter saw nothing —
   * so this run's spend happened outside its own window (trap 37). Absent on a
   * healthy run. `runs:cost` reports it rather than quietly costing the step
   * at zero.
   */
  usage_unobserved?: true
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

/**
 * A TIMESTAMP WINDOW CANNOT ESTABLISH CAUSALITY, and this is where that is
 * finally taken seriously rather than filed as a caveat.
 *
 * A stamp witness asks `stamp ∈ [started_at, finished_at]`. That is a question
 * about coincidence, not authorship. Two invocations of `cross-check-plants`
 * running in two worktrees against the one production database — the normal
 * operating model here, no global lock — overlap in time: A stamps rows 1-20, B
 * stamps 21-40, and at finalisation BOTH query the window, both see 40, both
 * satisfy `count >= rowCount`, and both record `confirmed`. Neither produced the
 * evidence it is citing.
 *
 * The random run id fixed IDENTITY. It cannot fix ATTRIBUTION, because nothing
 * writes it next to the mutation — and per-row provenance state is a documented
 * non-goal, so nothing will.
 *
 * The earlier code knew about overlap and used it in one direction only: extra
 * movement in the window was excused as "not evidence against this run", while
 * the same extra movement was still counted as evidence FOR it. That asymmetry
 * is the bug. Overlap breaks confirmation and contradiction alike.
 *
 *   confirming    — can confirm and contradict. Requires that no other writer of
 *                   this column could have run inside the window; see
 *                   `Exclusivity`. Nothing can declare this yet, deliberately.
 *   corroborating — a stamp with no established exclusivity: the honest default.
 *                   It cannot CONFIRM, because a concurrent writer of the same
 *                   column inflates the count. It can still CONTRADICT, and that
 *                   asymmetry is deliberate rather than sloppy — see below.
 *   bounding      — `updated_at`: sees any write to the row by anyone. Neither.
 *   unobservable  — declared unverifiable, with a reason.
 *
 * WHY CORROBORATING KEEPS CONTRADICTION WHEN IT IS NOT STRICTLY SOUND EITHER.
 * A concurrent CLEARER of the same column can drive the count below the claim
 * and produce a false contradiction, so the direction is not airtight. The costs
 * are not symmetric: a false `confirmed` is a silent lie in a record someone
 * will later cite as evidence, while a false `contradicted` is a loud flag that
 * sends a person to look. Keeping the loud half is worth a rare false alarm;
 * keeping the quiet half is not worth a rare silent lie. That asymmetry is
 * stated here so nobody later "fixes" the inconsistency by restoring
 * confirmation.
 */
export type WitnessStrength =
  | 'confirming'
  | 'corroborating'
  | 'bounding'
  | 'unobservable'

/**
 * How a run established that it was the only writer of a column in its window.
 *
 * There is exactly one honest value today, and that is the point: exclusivity is
 * a PREREQUISITE that must be established, not an assumption the log is allowed
 * to make. A future `{ kind: 'locked' }` earns `confirming` back.
 *
 * WHY NO LOCK YET, recorded so the next session does not re-derive it. A
 * per-step lock does not restore causality: five of the seven columns currently
 * witnessed have MORE THAN ONE writing step (`native_checked_at` has three,
 * `image_verified_at` four), so exclusivity has to be per-COLUMN, over every
 * step that writes it. And a lock cannot bind a script that does not take it —
 * six of those writers are among the 16 passes not yet on run provenance. A lock
 * added today would not lock, and would license `confirmed` while doing it.
 * Wire the remaining writers first; then the lock means something.
 */
export type Exclusivity =
  | { kind: 'none'; reason: string }
  | {
      /**
       * This run HELD a per-column lock across its whole window, re-verified at
       * finalisation. Earns `confirming`.
       */
      kind: 'locked'
      columns: string[]
    }

/**
 * The three lock calls, injectable so tests do not need a database.
 *
 * Backed by `public.stamp_locks` (migration 20260817174429). NOT
 * `pg_advisory_lock`: a session-level advisory lock lives on the CONNECTION,
 * and these scripts reach Postgres through PostgREST's pool, so it would be
 * released at a moment nothing in the script can observe.
 */
export interface LockClient {
  acquire: (
    column: string,
    runId: string,
    step: string,
    ttlSeconds: number
  ) => Promise<{
    acquired: boolean
    holder_run_id: string | null
    holder_step: string | null
    holder_expires_at: string | null
  }>
  holds: (column: string, runId: string) => Promise<boolean>
  release: (column: string, runId: string) => Promise<void>
}

export const supabaseLocks: LockClient = {
  async acquire(column, runId, step, ttlSeconds) {
    const { data, error } = await getSupabaseAdmin().rpc('acquire_stamp_lock', {
      p_column: column,
      p_run_id: runId,
      p_step: step,
      p_ttl_seconds: ttlSeconds,
    })
    if (error) throw new Error(`stamp lock acquire failed: ${error.message}`)
    const row = (data as unknown[] | null)?.[0] as
      | {
          acquired: boolean
          holder_run_id: string | null
          holder_step: string | null
          holder_expires_at: string | null
        }
      | undefined
    if (!row)
      throw new Error(`stamp lock acquire returned no row for ${column}`)
    return row
  },
  async holds(column, runId) {
    const { data, error } = await getSupabaseAdmin().rpc('holds_stamp_lock', {
      p_column: column,
      p_run_id: runId,
    })
    if (error) throw new Error(`stamp lock check failed: ${error.message}`)
    return Boolean(data)
  },
  async release(column, runId) {
    const { error } = await getSupabaseAdmin().rpc('release_stamp_lock', {
      p_column: column,
      p_run_id: runId,
    })
    if (error) throw new Error(`stamp lock release failed: ${error.message}`)
  },
}

/** Six hours. The longest real pass is a whole-catalog curation run. */
export const LOCK_TTL_SECONDS = 21600

export function strengthOf(
  witness: Witness,
  exclusivity: Exclusivity
): WitnessStrength {
  switch (witness.kind) {
    case 'stamp':
      // The prerequisite decides the strength. A stamp is only as good as the
      // guarantee that nothing else wrote the column while this run ran.
      return exclusivity.kind === 'none' ? 'corroborating' : 'confirming'
    case 'row-touched':
      return 'bounding'
    case 'none':
      return 'unobservable'
  }
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
  /**
   * How this run established it was the only writer of its stamp columns. Omit
   * it and the run records that exclusivity was not established, which downgrades
   * every stamp witness from confirming to corroborating.
   *
   * Deliberately opt-IN. The default is the truth about how this pipeline runs —
   * parallel worktrees, one production database, no lock — and a claim of
   * exclusivity has to be earned by a mechanism rather than assumed by whoever
   * wrote the caller.
   */
  exclusivity?: Exclusivity
  /**
   * How the run establishes it was the only writer of its stamp columns.
   *
   * `'lock'` (the default) takes a row lock per window-queryable write-set
   * member, and REFUSES to start if another run holds one. That refusal is the
   * mechanism: a run that proceeded anyway would break the holder's claim, and
   * two runs both proceeding is trap 29 exactly.
   *
   * `'none'` skips locking and records that exclusivity was not established,
   * which is what every run did before 2026-08-17.
   */
  lockPolicy?: 'lock' | 'none'
  /** Injected in tests. */
  locks?: LockClient
  recipe: Recipe
  scope?: string | null
  /** Injected in tests. */
  now?: () => string
  countRows?: (witness: Witness, from: string, to: string) => Promise<number>
  /** Injected in tests. Reads the process-wide token meter. */
  readUsage?: () => UsageMeter
  /** Injected in tests. Diffs the meter against a snapshot. */
  usageDelta?: (before: UsageMeter) => UsageMeter
  append?: (record: RunRecord) => string
  log?: (line: string) => void
  /** Install SIGINT/SIGTERM handlers. Off in tests. */
  trapSignals?: boolean
}

export interface RunHandle {
  runId: string
  startedAt: string
  /**
   * Take the per-column locks. Async, which is why it is not inside `beginRun`:
   * that returns synchronously and every caller reaches it through
   * `withRunRecord`, which awaits this before running the body.
   *
   * Throws if another run holds a lock, naming the holder and the exact call to
   * free it if you know that run is dead.
   */
  claimExclusivity: () => Promise<void>
  /**
   * Record a row this invocation wrote, BY ID, as it goes.
   *
   * Distinct ids, not call count. A run that writes the same row twice counts it
   * once — which is what every witness can observe, since a timestamp column
   * holds one value per row however many times it was set. Counting calls made
   * row_count incomparable with its own evidence and would have produced a false
   * "claim larger than evidence" on any double write.
   *
   * For a table whose row is not a single id (a combination is a pair), pass a
   * composite key: what matters is that it is stable and distinct.
   */
  wrote: (rowId: string) => void
  /**
   * Record a failure that is not a thrown exception — "every row errored", "the
   * decision file was stale". Lets a script use withRunRecord (which owns the
   * control flow) instead of calling finish by hand for a soft failure.
   */
  markFailed: (reason: string) => void
  /** The soft failure recorded by markFailed, if any. Read by withRunRecord. */
  softFailure: () => string | null
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
 * power loss — leaves stamps and no record. An earlier version of this note said
 * those are detectable afterwards as stamps falling inside no recorded window.
 * THAT WAS TOO STRONG, and it was too strong for the same reason confirmation
 * was: windows overlap. An orphaned stamp can land inside some other run's
 * recorded window and be indistinguishable from that run's own work. Orphan
 * detection is therefore only reliable for a stamp landing in no window at all,
 * which is a subset of the orphans — and the same exclusivity that would earn
 * `confirming` back is what would make the check complete.
 */
export function beginRun(opts: BeginRunOptions): RunHandle {
  const {
    step,
    writeSet,
    recipe,
    scope = null,
    exclusivity = {
      kind: 'none',
      reason:
        'no lock: parallel worktrees share one production database and nothing serialises steps',
    },
    lockPolicy = 'lock',
    locks = supabaseLocks,
    now = nowIso,
    countRows = countByWitness,
    readUsage = readUsageMeter,
    usageDelta = usageSince,
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
  // Taken with the start instant, so the tokens counted are the ones spent
  // inside the same window the row evidence is read over. A process that has
  // already spent tokens before opening this run — a resumed pass reading an
  // earlier batch, a script that curates then verifies — keeps them out of it.
  const usageAtStart = readUsage()
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

  // Only a window-queryable member can ever BE a stamp witness, so only those
  // are worth locking: locking a value column would serialise runs to buy
  // evidence that column can never supply.
  const lockable = writeSet.filter(isWindowQueryable)
  const held = new Set<string>()
  // Starts as the honest default and is only upgraded by claimExclusivity, then
  // re-checked at finalisation. Never assumed from the fact that we asked.
  let exclusivityNow: Exclusivity = exclusivity

  const claimExclusivity = async (): Promise<void> => {
    if (lockPolicy === 'none' || lockable.length === 0) return
    for (const column of lockable) {
      const result = await locks.acquire(column, runId, step, LOCK_TTL_SECONDS)
      if (!result.acquired) {
        // Release what we already took: a run that cannot be exclusive must not
        // sit on locks that block the run that can.
        for (const taken of held) await locks.release(taken, runId)
        throw new Error(
          `${step} cannot start: run ${result.holder_run_id} (${result.holder_step}) holds the ` +
            `write lock on ${column} until ${result.holder_expires_at}.\n\n` +
            `Two runs writing one stamp column inside overlapping windows is trap 29 — ` +
            `neither can then prove which rows it wrote. Wait for it, or run with ` +
            `lockPolicy 'none' to proceed without an exclusivity claim.\n\n` +
            `If you know that run is dead, free it:\n` +
            `  select public.release_stamp_lock('${column}', '${result.holder_run_id}');`
        )
      }
      held.add(column)
    }
    exclusivityNow = { kind: 'locked', columns: [...held] }
  }

  const writtenRows = new Set<string>()
  let settled = false
  let softFailureReason: string | null = null

  const finish = async (
    outcome: RunOutcome,
    extra: { error?: string } = {}
  ): Promise<RunRecord> => {
    const finishedAt = now()
    // Never passed in: the count is what the run observed itself writing.
    const rowCount = writtenRows.size
    // Read on EVERY terminal path, which is the point of reading it here rather
    // than in withRunRecord: an interrupted or failed run spent real money, and
    // those are exactly the runs whose cost is otherwise unrecoverable.
    const spent = usageDelta(usageAtStart)
    const observed: Record<string, number> = {}
    const notes: string[] = []
    let anyConfirming = false
    let anyCorroborating = false
    let anyBounding = false
    let contradicted = false
    let anyFailed = false

    // RE-VERIFY, DO NOT TRUST THE BOOLEAN WE SET AT THE START. A lock can
    // expire mid-run (SIGKILL elsewhere, a pass that outlived the TTL) and be
    // taken by someone else, and a run that lost it was not exclusive for the
    // part of the window after it lapsed. Asking the database is the only way
    // to know, and finalisation is the only moment the answer is still true.
    if (exclusivityNow.kind === 'locked') {
      const stillHeld: string[] = []
      const lost: string[] = []
      for (const column of exclusivityNow.columns) {
        try {
          ;(await locks.holds(column, runId))
            ? stillHeld.push(column)
            : lost.push(column)
        } catch {
          lost.push(column)
        }
      }
      if (lost.length) {
        const total = stillHeld.length + lost.length
        notes.push(
          `exclusivity DOWNGRADED: held ${stillHeld.length} of ${total} lock(s) to the end; ` +
            `lost ${lost.join(', ')}`
        )
        exclusivityNow = {
          kind: 'none',
          reason: `the lock on ${lost.join(', ')} was lost or expired before this run finished, so another writer could have moved rows inside the window`,
        }
      }
    }

    for (const witness of evidence) {
      const strength = strengthOf(witness, exclusivityNow)
      if (witness.kind === 'none') {
        notes.push(
          `${witness.covers} is not observable at finalisation: ${witness.reason}`
        )
        continue
      }
      let count: number
      try {
        count = await countRows(witness, startedAt, finishedAt)
      } catch (err) {
        anyFailed = true
        notes.push(
          `could not observe ${witness.covers}: ${(err as Error).message}`
        )
        continue
      }
      observed[witness.covers] = count

      if (strength === 'confirming' || strength === 'corroborating') {
        if (strength === 'confirming') anyConfirming = true
        else {
          anyCorroborating = true
          notes.push(
            `${witness.covers} is corroborating, not confirming: ` +
              `${exclusivity.kind === 'none' ? exclusivity.reason : 'lock lost'}, ` +
              `so another writer of this column could have moved rows inside the window`
          )
        }
        // A stamp can contradict in one direction only. Extra movement is not
        // evidence against this run — overlapping invocations are normal here.
        // A claim LARGER than its evidence is, and that is the direction worth
        // keeping even without exclusivity: see WitnessStrength on why the
        // asymmetry between a silent false confirm and a loud false alarm is
        // deliberate.
        if (count < rowCount) {
          contradicted = true
          notes.push(
            `${witness.covers}: claimed ${rowCount} row(s) and only ${count} carry a ` +
              `stamp inside the window — the claim is larger than its evidence`
          )
        }
        if (rowCount === 0 && count > 0) {
          contradicted = true
          notes.push(
            `${witness.covers}: claimed 0 rows but ${count} stamp(s) moved inside the window`
          )
        }
      } else {
        anyBounding = true
        // A bounding witness can neither confirm nor contradict: updated_at sees
        // ANY write to the row, including another invocation's, and sees one row
        // however many times this run wrote it.
        notes.push(
          `${witness.covers} is bounded, not confirmed: ${count} row(s) in ` +
            `${witness.kind === 'row-touched' ? witness.table : 'the table'} were ` +
            `touched in the window, which cannot be attributed to this run`
        )
      }
    }

    const substantiation: RunRecord['verification']['substantiation'] =
      contradicted
        ? 'contradicted'
        : anyConfirming
          ? 'confirmed'
          : anyCorroborating
            ? 'corroborated'
            : anyBounding
              ? 'bounded'
              : 'unverified'

    if (substantiation === 'unverified') {
      notes.push(
        anyFailed
          ? 'every observation failed, so the row count is recorded unverified'
          : 'no observable witness, so the row count is recorded unverified'
      )
    }
    if (outcome === 'completed' && rowCount === 0) {
      notes.push('completed with nothing to do — vacuous, not evidence of work')
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
      verification: {
        substantiation,
        observed,
        exclusivity: exclusivityNow,
        notes,
      },
      ...(Object.keys(spent).length ? { usage: spent } : {}),
      // TRAP 37, generalised. A run whose recipe NAMES A MODEL, that wrote
      // rows, and that observed no tokens at all, did not run for free: its
      // spend happened outside the meter's window — almost always because the
      // model call was made before `withRunRecord` opened, which is exactly
      // how `curate-common-names` recorded `usage: null` on a pass that cost
      // real money, and how `runs:cost` came to under-report a round.
      //
      // RECORDED RATHER THAN THROWN, and the reason is the Batch API: a batch
      // pass legitimately settles its tokens outside this process's meter, so
      // failing here would fail correct runs. A flag makes the next instance
      // announce itself in the record and in `runs:cost` instead of being
      // silently absorbed — which is the half that made this trap expensive.
      //
      // This is what a source scan could not do. One was written during round
      // 13 and thrown away: it false-positived on four scripts that meter
      // correctly, because the call sits in a helper defined early and invoked
      // from inside the record. Textual order is not runtime order; this asks
      // the runtime.
      ...(recipe.model && rowCount > 0 && !Object.keys(spent).length
        ? { usage_unobserved: true as const }
        : {}),
      ...(extra.error ? { error: extra.error } : {}),
    }

    settled = true
    // Released AFTER the record is built, so the window the record describes is
    // the window the lock actually covered.
    for (const column of held) {
      try {
        await locks.release(column, runId)
      } catch {
        // A lock we cannot release will expire. Losing the run record over it
        // would trade a real artifact for a transient one.
      }
    }
    const path = append(record)
    log(
      `\nrun ${runId} — ${outcome}, ${rowCount} row(s), recipe ${hash}, ` +
        `evidence ${substantiation}` +
        Object.entries(spent)
          .map(
            ([key, t]) =>
              `\n  ${key} — ${t.calls} call(s), ` +
              `${t.input_tokens.toLocaleString()} in / ` +
              `${t.output_tokens.toLocaleString()} out`
          )
          .join('') +
        `\n  recorded in ${path.replace(`${REPO_ROOT}/`, '')}`
    )
    if (record.usage_unobserved)
      log(
        `  ⚠ recipe names ${recipe.model} and ${rowCount} row(s) were written, ` +
          `but NO tokens were observed — the spend happened outside this run's ` +
          `window (trap 37). runs:cost will under-report this step.`
      )
    if (substantiation === 'contradicted')
      for (const n of notes) log(`  ⚠ ${n}`)
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
    claimExclusivity,
    markFailed: (reason: string) => {
      softFailureReason ??= reason
    },
    softFailure: () => softFailureReason,
    wrote: (rowId: string) => {
      writtenRows.add(rowId)
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
  // Before the body, so a refusal costs nothing and happens where the operator
  // is still watching. A failure here is NOT recorded as a failed run: nothing
  // was written, and filing a run record for an invocation that never started
  // would be the optimistic-record mistake beginRun's header warns about.
  await run.claimExclusivity()
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
