/**
 * What a stamp column looks like, in one place.
 *
 * WHY THIS EXISTS. Two guards had their own copy of the suffix list and neither
 * held all of it: `round-status.ts` matched `_checked_at` and `_verified_at`,
 * `check-round-scope.ts` matched `_checked_at` and `_reviewed_at`. One fact,
 * two homes, each updated when a different migration landed — and the gap is
 * how `native_to_reviewed_at` drained unnoticed for a month.
 *
 * WHAT IS SHARED AND WHAT IS NOT. The vocabulary is shared: which column NAMES
 * are operational bookkeeping rather than catalog content. The two questions
 * asked of it are NOT the same, and unifying them would be wrong:
 *
 *   · `check-round-scope` asks "is this write bookkeeping?" — because a stamp
 *     written outside the round's scope is a guard re-stamping, not a data
 *     write. Every stamp suffix qualifies, plus trigger-derived `updated_at`.
 *   · `round-status` asks "should some pipeline STEP claim this column?" —
 *     because an unclaimed step stamp means a round can skip that pass and
 *     still report complete. Not every stamp is a step's: some record a
 *     person's verdict, and `NOT_A_STEP_STAMP` below says which and why.
 *
 * So this module holds the vocabulary and the exclusions with their reasons,
 * and each caller keeps its own predicate. Collapsing them into one boolean
 * would make `verify-round` FAIL on a column that correctly has no step.
 */

/**
 * Suffixes that mark a column as operational metadata.
 *
 * `_checked_at` — a guard ran (and, where the guard says so, settled the row).
 * `_verified_at` — a person confirmed a specific artifact, e.g. image_verified_at
 * (migration 20260729083058). A suffix check looking only for the older name
 * sailed past it once already.
 * `_reviewed_at` — a person read the row and kept what it said, e.g.
 * native_to_reviewed_at (migration 20260813110500).
 */
export const STAMP_SUFFIXES = [
  '_checked_at',
  '_verified_at',
  '_reviewed_at',
] as const

/** Whether this column name is an operational stamp rather than catalog data. */
export function isStampColumn(column: string): boolean {
  return STAMP_SUFFIXES.some((suffix) => column.endsWith(suffix))
}

/**
 * Stamps that are deliberately NOT a pipeline step's, with the reason.
 *
 * Stating the omissions is the point — an omission a file did not state
 * explicitly is what trap 1b is about.
 */
export const NOT_A_STEP_STAMP: Record<string, string> = {
  native_to_reviewed_at:
    'A person read a native_to phrase against the evidence and kept it. The STEP is cross-check-native-to, which claims native_checked_at; this column records a human verdict inside that step, so no step should claim it. shouldStamp() in that script reads it as settlement.',
}

/**
 * Columns that look like a stamp to a reader but are catalog content.
 *
 * `hardiness_verified` is a BOOLEAN and editorial data: it says a person
 * checked an RHS rating, and it survives a re-seed on purpose (see
 * docs/curation.md#hardiness). It does not end in a stamp suffix, so nothing
 * matches it today — recorded here because the next person to widen
 * STAMP_SUFFIXES to `_verified` would silently reclassify editorial data as
 * bookkeeping, and a guard would stop refusing out-of-scope writes to it.
 */
export const LOOKS_LIKE_A_STAMP_BUT_IS_NOT: Record<string, string> = {
  hardiness_verified:
    'Boolean editorial data, not a timestamp stamp. Never add `_verified` to STAMP_SUFFIXES.',
}
