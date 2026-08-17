/**
 * A guarded write to a row that carries an editorial verdict.
 *
 * WHICH RUNBOOK STEP RUNS THIS: none. It is a library, not a script — the
 * shared half of six scripts that each hand-rolled the same guard. WHAT ENDS
 * IT: nothing; it is the permanent home for "write this column, but only if
 * the value is still what my decision was made about".
 *
 * WHAT WAS DUPLICATED. `from: string // expected current value — drift guard`
 * appears verbatim in `fix-round8-names.ts`, `fix-round11-names.ts`,
 * `fix-round12-names.ts` and `fix-round12-tags.ts`; `apply-native-to-fixes.ts`
 * spells it `expect` and `apply-sun-widening.ts` spells it `stored`. Six copies
 * of one idea is the third-script rule in CLAUDE.md twice over.
 *
 * IT IS STANDALONE, NOT A WRAPPER AROUND `lib/plants-write.ts`. The two operate
 * on disjoint column sets today, which is why none of the six imports it:
 * `plants-write` is how a caller CLAIMS a verdict it has earned (it stamps
 * criteria in the same statement), and this is how a caller writes a column
 * knowing it may LOSE one. Folding them together would make every mechanical
 * name correction look like an editorial act.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PROPERTY THIS EXISTS FOR, AND WHY IT READS THE ROW ITSELF
 *
 * Trap 31: on 2026-08-15 a re-tag changed `style_tags` on 86 rows, printed
 * "86 tagged", and could not print "86 un-curated" — because
 * `invalidate_editorial_verdict` clears `is_curated` inside the database, and
 * the script never selected the column. Nobody noticed for two days.
 *
 * So the session does its own read, before and after, rather than trusting a
 * row the caller hands it. A caller that assembles its own row can forget
 * `is_curated`, and that forgetting is the entire incident. The safety
 * property has to live somewhere a caller cannot skip.
 *
 * THE AFTER-READ IS A WITNESS, NOT A FORMALITY. `verdict_retired` could be
 * inferred from the before-state alone — "it was curated, we wrote a watched
 * column, therefore the trigger fired". That inference depends on knowing what
 * the trigger watches, and `lib/plants-write.ts` says in its own header that
 * NOTHING checks that its column map and the trigger's agree. So this reads
 * `is_curated` back for the rows it wrote and reports what actually happened.
 * When the observed count differs from the predicted one, that disagreement is
 * printed loudly: it is the only signal in the repo that the trigger's watch
 * set is not what a caller believes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PROVENANCE-SHAPED, NOT PROVENANCE-WIRED
 *
 * `apply` takes an optional `run` handle and calls `run.wrote(id)` for every
 * row it writes. Nothing here opens a run record: `withRunRecord` owns control
 * flow and belongs at the call site, which is also where the write-set, the
 * recipe and the evidence witnesses are known. Wiring provenance into the six
 * callers later is therefore a call-site change and not a second refactor
 * through this file. See docs/write-provenance.md.
 */

/** The narrow slice of the Supabase client this needs. Injected in tests. */
export interface MutationDb {
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: string[]
      ): PromiseLike<{
        data: unknown[] | null
        error: { message: string } | null
      }>
    }
    update(patch: Record<string, unknown>): {
      eq(
        column: string,
        value: string
      ): PromiseLike<{ error: { message: string } | null }>
    }
  }
}

/**
 * Narrow a Supabase client to the slice above.
 *
 * The cast is here, once, rather than at each of the callers this is being
 * extracted for. `@supabase/supabase-js`'s builder types are deeply generic in
 * the row shape, and structurally matching them against `MutationDb` makes
 * tsc give up with TS2589 ("type instantiation is excessively deep"). Nothing
 * is lost that the client was checking: this module names its own columns as
 * strings and reads results as `Record<string, unknown>` regardless.
 */
export function asMutationDb(client: unknown): MutationDb {
  return client as MutationDb
}

/** The provenance handle's one method this uses. See scripts/run-provenance.ts. */
export interface RunWriter {
  wrote: (rowId: string) => void
}

export interface MutationIntent {
  /** The row to write. Always an id: a name is a value and values drift. */
  id: string
  /** How this row is named in output. Usually the scientific name. */
  label: string
  /**
   * The stored values this decision was made ABOUT. The drift guard: a row
   * holding anything else is skipped, never overwritten, because a decision
   * made about older data is not a decision about this row.
   */
  from: Record<string, unknown>
  /** The values to write. Compared to `from` by normalised JSON. */
  to: Record<string, unknown>
  /**
   * Columns written in the SAME statement but NOT guarded — stamps.
   *
   * A stamp's prior value is not what the decision was about; guarding it would
   * make every second run report drift. Kept separate from `to` rather than
   * exempted by name, so "this column is a claim, not a correction" is stated by
   * the caller instead of inferred from a suffix.
   *
   * SAME STATEMENT IS THE POINT, not a convenience: a stamp set in a second
   * statement is written back AFTER the trigger has already fired on the first,
   * which is how a row comes to carry an approval it did not earn
   * (lib/plants-write.ts). It is also trap 28 — a stamp landing on only some of
   * the counted rows cannot confirm the run — which is why a row whose value is
   * already correct is still STAMPED rather than skipped.
   */
  alsoWrite?: Record<string, unknown>
  /** Why the stored value was wrong. Required — see the validation below. */
  why: string
}

export type Disposition =
  /** Written. */
  | 'written'
  /**
   * Already holds `to`, and the intent carries stamps — so the stamps were
   * written and nothing else was. Counts as a write for provenance (trap 28)
   * and as "unchanged" for the caller's own reporting.
   */
  | 'stamped'
  /** Already holds `to` and there was nothing else to write. */
  | 'noop'
  /** Holds neither `from` nor `to`. Skipped. */
  | 'drift'
  /** `is_curated` and the policy is `skip`. */
  | 'frozen'
  /** No such row. */
  | 'missing'

export interface MutationOutcome {
  intent: MutationIntent
  disposition: Disposition
  /** Human detail for the skips: what was found instead. */
  detail?: string
}

/**
 * What the caller gets back instead of a log line.
 *
 * COLLATERAL REPORTING IS A RETURNED FACT. Every one of the six printed its
 * counts and returned nothing, so a caller could not act on them and a test
 * could not assert them. Trap 31 was a missing SENTENCE; a count nobody can
 * read programmatically is the same defect with better manners.
 */
export interface MutationReport {
  /** Intents that found a row. */
  matched: number
  /** Rows whose guarded VALUE changed. */
  written: number
  /** Rows whose value was already correct and that were stamped anyway. */
  stamped: number
  skipped_drift: number
  skipped_frozen: number
  skipped_noop: number
  missing: number
  /**
   * Rows that HELD an editorial verdict before this write and no longer do.
   *
   * Observed by reading `is_curated` back, not inferred. Zero under the `skip`
   * policy by construction, since that policy never writes a curated row.
   */
  verdict_retired: number
  /** Labels of the rows in `verdict_retired`, for the re-judge instruction. */
  retired: string[]
  /**
   * Rows that were curated, were written, and CAME BACK still curated — so the
   * trigger does not watch a column this write touched. Empty is the expected
   * state; anything else means `lib/plants-write.ts`'s unguarded assumption has
   * started to be wrong.
   */
  verdict_survived: string[]
  outcomes: MutationOutcome[]
}

export type CuratedPolicy =
  /**
   * A curated row is frozen and skipped. The six name/tag corrections: a
   * mechanical fix does not overrule a human sign-off.
   */
  | 'skip'
  /**
   * A curated row is written and the retirement is reported. `curate-styles`:
   * re-tagging is exactly the judgment the verdict was partly about, so the
   * verdict SHOULD fall — silently was the problem, not at all.
   */
  | 'retire'

export interface SessionOptions {
  db: MutationDb
  table: string
  /** Columns the guard reads. Derived from the intents if omitted. */
  guardedColumns?: string[]
  onCurated: CuratedPolicy
  /** No write is issued; every applicable intent reports `written`. */
  dryRun?: boolean
}

/** Normalised so an array and its JSON text compare the same either way. */
function normalise(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function validate(intent: MutationIntent): void {
  if (!intent.id?.trim())
    throw new Error(`reviewed-mutation: an intent has no id (${intent.label})`)
  if (!intent.why?.trim())
    throw new Error(
      `reviewed-mutation: ${intent.label} has no \`why\`. A mutation with no ` +
        `reasoning is not reviewable, and the reasoning is the only record of ` +
        `why a value reads as it does.`
    )
  const columns = Object.keys(intent.to)
  // A STAMP-ONLY INTENT IS LEGITIMATE, and this check used to deny it (trap 35,
  // round 13). A judging pass that examines a row and AGREES with the stored
  // value writes no column and one `*_checked_at` stamp — that is the whole
  // shape of a guard, and `curate-common-names`' `keep` verdict is exactly it.
  //
  // The rule the check is really for is "an intent that does nothing", and ten
  // lines below, the from-equals-to check already tells those apart the right
  // way: by whether a stamp is written. This one predated that reasoning and
  // never got it, so it rejected the case its neighbour was written to allow.
  //
  // It survived because a dry run never reaches here — the write path is gated
  // behind --apply, so six dry runs across two batches exercised none of it.
  const hasStampsToWrite = Object.keys(intent.alsoWrite ?? {}).length > 0
  if (columns.length === 0 && !hasStampsToWrite)
    throw new Error(
      `reviewed-mutation: ${intent.label} writes no column and no stamp, so ` +
        `this entry does nothing.`
    )
  for (const column of columns) {
    if (!(column in intent.from))
      throw new Error(
        `reviewed-mutation: ${intent.label} writes ${column} without an ` +
          `expected prior value. Every written column needs one, or the drift ` +
          `guard has a hole exactly where the caller was least sure.`
      )
  }
  // An entry that writes the value it expects to find is an authoring error in
  // a hand-written decision file, and NORMAL for a computed intent: a judging
  // pass that agrees with the stored value still has a stamp to write. The
  // presence of stamps is what tells the two apart.
  const hasStamps = Object.keys(intent.alsoWrite ?? {}).length > 0
  if (!hasStamps && normalise(intent.from) === normalise(intent.to))
    throw new Error(
      `reviewed-mutation: ${intent.label}'s \`from\` equals its \`to\` and it ` +
        `writes no stamp, so this entry does nothing.`
    )
}

interface LiveRow {
  id: string
  is_curated: boolean
  values: Record<string, unknown>
}

/**
 * Classify one intent against the row as it stands.
 *
 * ORDER MATTERS AND IS THE SAME MISTAKE `apply-description-fixes` made once:
 * already-applied is checked BEFORE drift. A decision file is committed and
 * stays in the tree, so "already applied" is the normal steady state; calling
 * it drift makes the default invocation fail forever, and a script that always
 * fails is a script people stop reading.
 */
export function classify(
  intent: MutationIntent,
  row: LiveRow | undefined,
  onCurated: CuratedPolicy
): MutationOutcome {
  if (!row)
    return { intent, disposition: 'missing', detail: `no row ${intent.id}` }

  const columns = Object.keys(intent.to)
  const live = Object.fromEntries(
    columns.map((c) => [c, row.values[c] ?? null])
  )

  if (normalise(live) === normalise(intent.to)) {
    if (!intent.alsoWrite || Object.keys(intent.alsoWrite).length === 0)
      return { intent, disposition: 'noop' }
    // A curated row is frozen before it is stamped: writing a stamp onto a row
    // the policy says not to touch is still touching it.
    if (row.is_curated && onCurated === 'skip')
      return { intent, disposition: 'frozen', detail: 'is_curated' }
    return { intent, disposition: 'stamped' }
  }

  const expected = Object.fromEntries(
    columns.map((c) => [c, intent.from[c] ?? null])
  )
  if (normalise(live) !== normalise(expected))
    return {
      intent,
      disposition: 'drift',
      detail: `expected ${normalise(expected)}, found ${normalise(live)}`,
    }

  if (row.is_curated && onCurated === 'skip')
    return { intent, disposition: 'frozen', detail: 'is_curated' }

  return { intent, disposition: 'written' }
}

export interface MutationSession {
  /**
   * True when this session observes and reports verdict retirement.
   *
   * Read by `curate-styles`, whose write gate is conditional on the capability
   * rather than on a dated flag. Always true here; it exists so the gate is an
   * assertion about the writer rather than a boolean somebody has to remember
   * to flip.
   */
  readonly reportsVerdictRetirement: true
  apply(intents: MutationIntent[], run?: RunWriter): Promise<MutationReport>
}

export function openReviewedMutation(opts: SessionOptions): MutationSession {
  const { db, table, onCurated, dryRun = false } = opts

  async function readRows(
    ids: string[],
    columns: string[]
  ): Promise<Map<string, LiveRow>> {
    if (ids.length === 0) return new Map()
    const select = ['id', 'is_curated', ...columns].join(', ')
    const { data, error } = await db.from(table).select(select).in('id', ids)
    if (error)
      throw new Error(`reviewed-mutation: read failed — ${error.message}`)
    const rows = new Map<string, LiveRow>()
    for (const raw of data ?? []) {
      const record = raw as Record<string, unknown>
      rows.set(record['id'] as string, {
        id: record['id'] as string,
        is_curated: Boolean(record['is_curated']),
        values: record,
      })
    }
    return rows
  }

  return {
    reportsVerdictRetirement: true,

    async apply(intents, run) {
      for (const intent of intents) validate(intent)

      const columns = opts.guardedColumns ?? [
        ...new Set(intents.flatMap((i) => Object.keys(i.to))),
      ]

      const before = await readRows(
        intents.map((i) => i.id),
        columns
      )

      const outcomes: MutationOutcome[] = []
      // Curated BEFORE the write, which is what makes a retirement THIS run's
      // doing rather than an observation about a row that was already unjudged.
      const curatedBefore = new Set<string>()

      for (const intent of intents) {
        const row = before.get(intent.id)
        const outcome = classify(intent, row, onCurated)
        outcomes.push(outcome)
        const writes =
          outcome.disposition === 'written' || outcome.disposition === 'stamped'
        if (!writes) continue

        // ONLY a value change can retire a verdict, so only a `written` row is
        // examined for survival. A `stamped` row moves a stamp the trigger does
        // not watch, so it keeps its verdict by definition — and counting it
        // here made the survival warning fire on 26 rows the first time this
        // ran catalog-wide (step D, 2026-08-17), every one of which had
        // identical tags before and after. A warning that cries wolf is trap 31
        // inverted: the report was wrong in the direction that gets reports
        // ignored.
        if (row?.is_curated && outcome.disposition === 'written')
          curatedBefore.add(intent.id)
        if (dryRun) continue

        // One statement. A stamp split into a second one is written back after
        // the trigger has already fired — see MutationIntent.alsoWrite.
        const patch =
          outcome.disposition === 'stamped'
            ? { ...intent.alsoWrite }
            : { ...intent.to, ...intent.alsoWrite }

        const { error } = await db.from(table).update(patch).eq('id', intent.id)
        if (error)
          throw new Error(
            `reviewed-mutation: ${intent.label} write failed — ${error.message}`
          )
        run?.wrote(intent.id)
      }

      // The after-read, over the curated rows only: a row that held no verdict
      // cannot have lost one, so there is nothing to observe on it.
      const retired: string[] = []
      const survived: string[] = []
      if (!dryRun && curatedBefore.size > 0) {
        const after = await readRows([...curatedBefore], [])
        for (const outcome of outcomes) {
          if (!curatedBefore.has(outcome.intent.id)) continue
          const row = after.get(outcome.intent.id)
          // A row that vanished between the two reads is not a survivor. Left
          // out of both lists rather than guessed at.
          if (!row) continue
          ;(row.is_curated ? survived : retired).push(outcome.intent.label)
        }
      }

      const count = (d: Disposition) =>
        outcomes.filter((o) => o.disposition === d).length

      return {
        matched: outcomes.length - count('missing'),
        written: count('written'),
        stamped: count('stamped'),
        skipped_drift: count('drift'),
        skipped_frozen: count('frozen'),
        skipped_noop: count('noop'),
        missing: count('missing'),
        verdict_retired: retired.length,
        retired,
        verdict_survived: survived,
        outcomes,
      }
    },
  }
}

/**
 * Add up reports from repeated `apply` calls.
 *
 * A pass whose `to` is only known one row at a time — `curate-styles` asks a
 * model per plant — applies per row so that an interrupted run has written what
 * it judged. That gives it N reports where the caller wants one. Summing them
 * by hand at each call site is how the six came to differ in the first place.
 */
export function mergeReports(reports: MutationReport[]): MutationReport {
  const sum = (pick: (r: MutationReport) => number) =>
    reports.reduce((n, r) => n + pick(r), 0)
  return {
    matched: sum((r) => r.matched),
    written: sum((r) => r.written),
    stamped: sum((r) => r.stamped),
    skipped_drift: sum((r) => r.skipped_drift),
    skipped_frozen: sum((r) => r.skipped_frozen),
    skipped_noop: sum((r) => r.skipped_noop),
    missing: sum((r) => r.missing),
    verdict_retired: sum((r) => r.verdict_retired),
    retired: reports.flatMap((r) => r.retired),
    verdict_survived: reports.flatMap((r) => r.verdict_survived),
    outcomes: reports.flatMap((r) => r.outcomes),
  }
}

/**
 * The lines a caller prints. Here so six callers do not each invent a format,
 * and so the retirement sentence — the one trap 31 was missing — cannot be the
 * line somebody trims to make output tidier.
 */
export function formatReport(
  report: MutationReport,
  opts: { dryRun?: boolean; reJudgeWith?: string } = {}
): string {
  const verb = opts.dryRun ? 'Would write' : 'Wrote'
  const lines = [
    `${verb} ${report.written} of ${report.matched} matched` +
      (report.stamped ? ` · stamped only ${report.stamped}` : '') +
      ` · drift ${report.skipped_drift}` +
      ` · already correct ${report.skipped_noop}` +
      ` · frozen ${report.skipped_frozen}` +
      ` · no row ${report.missing}`,
  ]

  for (const o of report.outcomes) {
    if (o.disposition === 'drift')
      lines.push(`  !!  ${o.intent.label} — ${o.detail} — skipped`)
    if (o.disposition === 'missing')
      lines.push(`  ??  ${o.intent.label} — ${o.detail}`)
    if (o.disposition === 'frozen')
      lines.push(`  --  ${o.intent.label} — is_curated, frozen`)
  }

  if (report.verdict_retired > 0) {
    lines.push(
      ``,
      `${report.verdict_retired} row(s) lost an editorial verdict, which is the trigger working:`,
      `  ${report.retired.join('\n  ')}`
    )
    if (opts.reJudgeWith) lines.push(`Re-run: ${opts.reJudgeWith}`)
  }

  if (report.verdict_survived.length > 0) {
    lines.push(
      ``,
      `WARNING — ${report.verdict_survived.length} curated row(s) were written and KEPT their verdict:`,
      `  ${report.verdict_survived.join('\n  ')}`,
      `invalidate_editorial_verdict does not watch a column this write touched.`,
      `Check the trigger's watch set against CRITERION_FIELDS in lib/plants-write.ts,`,
      `whose header says plainly that nothing verifies the two agree.`
    )
  }

  return lines.join('\n')
}
