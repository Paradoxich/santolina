/**
 * The editorial report's data model and its merge rules.
 *
 * Split out of `curate-editorial.ts` so it can be tested: that script calls
 * `requireScope()` and `main()` at module load, so importing it from a test
 * exits the process. Same reason `computeStatus` was split out of
 * `roundStatus` for the round rehearsal — the pure half of a script is the
 * half worth asserting on.
 *
 * WHY THIS FILE EXISTS AT ALL, rather than the merge living inline: the report
 * is the ARTEFACT, not a log. The database records a row's verdict but never
 * the reasoning behind it, so `reports/editorial-<n>.md` is the only durable
 * record of WHY a row was held and WHAT a rewrite changed. Two separate bugs
 * have now destroyed parts of it, both by writing a partial run's view over a
 * whole round's history. The rules below are what stop that, and they are
 * subtle enough to deserve tests.
 */

/** One criterion's outcome. `open` means unresolved, which blocks approval. */
export type CriterionVerdict = 'pass' | 'fail' | 'open'

/**
 * The reason a criterion carries when THIS run did not judge it, because an
 * earlier run already cleared it and its stamp is still set.
 *
 * A constant rather than five string literals: `carryDescriptionProvenance`
 * keys off it to tell "not re-judged" from "judged and passed", so a typo in
 * one copy would silently drop a rewrite record instead of failing.
 */
export const CLEARED_PREVIOUSLY = 'cleared previously'

export interface Finding {
  id: string
  common_name: string
  scientific_name: string | null
  image: { verdict: CriterionVerdict; reason: string }
  description: {
    verdict: CriterionVerdict
    reason: string
    rewritten: boolean
    before?: string | null
    after?: string | null
    blind_verdict?: string
    blind_reason?: string
  }
  tags: { verdict: CriterionVerdict; reason: string }
  approved: boolean
  blockers: string[]
}

/**
 * Merge this run's findings over whatever the report already held.
 *
 * A partial re-run must not destroy the queue. `--new-only` and `--ids` runs
 * are the NORMAL way this pass is used — re-judging the handful of rows whose
 * image confidence just moved — and a plain overwrite meant a 9-row run
 * replaced a 101-row report, taking with it the recorded blockers for every
 * row still held. That happened on 2026-07-29: six flagged tag errors were
 * only recoverable because someone had summarised three of them in a handoff.
 *
 * This is the same failure `writeReviewReport` in pick-plant-images was fixed
 * for ("retrying four transient failures replaced a 490-plant review file with
 * a 4-plant one"), arrived at independently in a second script. The blockers
 * are the only durable record of WHY a row was held — the database keeps the
 * verdict but not the reasoning — so the file is the artefact, not a log.
 *
 * Newest wins per plant id, and a row this run did not touch is carried
 * forward untouched.
 */
export function mergeFindings(
  previous: Finding[],
  current: Finding[]
): Finding[] {
  const byId = new Map(previous.map((f) => [f.id, f]))
  for (const f of current) {
    const prior = byId.get(f.id)
    byId.set(f.id, prior ? carryDescriptionProvenance(prior, f) : f)
  }
  return [...byId.values()].sort((a, b) =>
    a.common_name.localeCompare(b.common_name)
  )
}

/**
 * Keep the newest VERDICT, but keep the newest real DESCRIPTION RECORD.
 *
 * A run only judges the criteria a row still has open, so a row whose
 * description was cleared in an earlier run comes back carrying
 * `reason: CLEARED_PREVIOUSLY` and no rewrite detail. Letting that overwrite
 * the prior finding wholesale drops the before/after text of a rewrite that
 * really happened: round 10's report went from "29 rewritten" to "0" that way,
 * because a later run re-stated 42 already-clear rows and each one flattened
 * its own history.
 *
 * That before/after is not recoverable from anywhere else for a freshly seeded
 * plant. The round's `before` catalog snapshot is taken BEFORE the seed, so a
 * new plant does not appear in it (verified for round 10: 0 of 50), and both
 * the draft and the rewrite happen inside the same round. The report is the
 * only copy.
 *
 * The verdict and reason still come from `next` — it is the current truth
 * about whether the row is held. Only the provenance fields, which `next`
 * has no opinion about because it did not re-judge, are carried.
 */
export function carryDescriptionProvenance(
  prior: Finding,
  next: Finding
): Finding {
  if (next.description.reason !== CLEARED_PREVIOUSLY) return next
  const { rewritten, before, after, blind_verdict, blind_reason } =
    prior.description
  if (!rewritten && blind_verdict === undefined) return next
  return {
    ...next,
    description: {
      ...next.description,
      rewritten,
      before,
      after,
      blind_verdict,
      blind_reason,
    },
  }
}
