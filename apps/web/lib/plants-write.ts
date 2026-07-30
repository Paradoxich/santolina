/**
 * The one place that knows how a write to `plants` interacts with the
 * editorial verdict.
 *
 * WHY THIS EXISTS. The rule "this verdict is about these fields" was stated in
 * a migration comment, and three scripts missed it. It was then moved into the
 * database as the `invalidate_editorial_verdict` trigger, which stopped rows
 * carrying approvals they had not earned. But the trigger only ever takes the
 * verdict AWAY. Everything a caller has to do to keep or re-earn one is still
 * hand-written in each script, and on 2026-07-29 four of them were each
 * remembering it independently:
 *
 *   - stamp the criterion in the SAME statement, or the change you just made
 *     withdraws the approval you were trying to record
 *   - writing the OLD stamp back is not a claim and never can be
 *   - so preserving a verdict across a change takes TWO statements
 *   - and `is_curated` is the AND of the three criterion stamps, which nothing
 *     recomputes, so a row can clear all three and stay unapproved
 *
 * That last one is not hypothetical either: a row held on its image alone (33
 * of round 8's 40 holds) has its description and tag stamps already set, so
 * confirming the photograph clears the third criterion and `is_curated` stays
 * false until the editorial pass is paid for again. The flag is mechanically
 * derivable from three columns already in the row.
 *
 * The trigger is the floor and this is the ceiling: the database refuses to
 * let a verdict outlive what it was about, and this module is how a caller
 * says what it is claiming. The decision logic below is pure and unit-tested
 * (`plants-write.test.ts`); the trigger's own behaviour is asserted separately
 * against a real Postgres by `scripts/test-editorial-trigger.ts`, because none
 * of it can be established by reading.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** The three editorial criteria (docs/architecture.md#curation-layer, `lib/editorial-standard.ts`). */
export type Criterion = 'image' | 'description' | 'tags'

export const CRITERIA: readonly Criterion[] = ['image', 'description', 'tags']

/**
 * The columns each criterion rests on, and the stamp that records it.
 *
 * This is the same mapping the trigger holds, and the duplication is real: one
 * home per fact would say delete one of them. It stays because the two answer
 * different questions — the trigger decides when a verdict DIES, this decides
 * what a caller may CLAIM — and because a caller cannot ask Postgres what the
 * trigger watches.
 *
 * NOTHING CHECKS THAT THE TWO AGREE. Stated plainly because an earlier draft of
 * this comment claimed the contract test kept them honest, and it does not: that
 * test exercises five hand-written columns, so it cannot see a sixth column
 * added to the trigger and not to this map. If that happens, a script writing
 * that column loses its verdict silently and this module never knows.
 *
 * Left unguarded on purpose. The guard would cost two mechanisms — generating
 * the test's cases from this map, and parsing the trigger's SQL out of
 * `supabase/migrations/` — to protect against a column nobody has proposed. It
 * is written down here instead, which is what to do with a risk you are choosing
 * to carry. Build the guard the day a sixth column is actually added.
 */
export const CRITERION_FIELDS: Record<Criterion, readonly string[]> = {
  image: ['image_url_curated', 'image_pick_confidence'],
  description: ['description'],
  tags: ['style_tags', 'space_types'],
}

export const CRITERION_STAMP: Record<Criterion, string> = {
  image: 'editorial_image_at',
  description: 'editorial_description_at',
  tags: 'editorial_tags_at',
}

export type Stamps = {
  editorial_image_at: string | null
  editorial_description_at: string | null
  editorial_tags_at: string | null
}

/**
 * Which criteria a patch would re-open, if the caller claims nothing.
 *
 * Presence in the patch, not a value comparison: the trigger compares values
 * and this cannot, because the old row is not necessarily in hand. It is
 * therefore deliberately pessimistic — it names what MIGHT be re-opened, which
 * is the right side to err on when the answer decides whether to stamp.
 */
export function criteriaTouchedBy(patch: Record<string, unknown>): Criterion[] {
  return CRITERIA.filter((c) =>
    CRITERION_FIELDS[c].some((field) => field in patch)
  )
}

/**
 * `is_curated` is true exactly when all three criteria are cleared.
 *
 * The trigger enforces one direction of this (any criterion re-opening clears
 * the flag) and nothing enforced the other until this function.
 */
export function isCurated(stamps: Stamps): boolean {
  return CRITERIA.every((c) => stamps[CRITERION_STAMP[c] as keyof Stamps])
}

/**
 * What the second statement of a preserving write has to contain.
 *
 * Only the criteria that were cleared AND had a stamp worth restoring. Passing
 * a stamp that was already null would assert a criterion nobody judged.
 */
export function verdictToRestore(
  before: Stamps & { is_curated: boolean; editorial_checked_at: string | null },
  reopened: Criterion[]
): Record<string, unknown> | null {
  const restore: Record<string, unknown> = {}
  for (const c of reopened) {
    const key = CRITERION_STAMP[c] as keyof Stamps
    if (before[key]) restore[key] = before[key]
  }
  if (Object.keys(restore).length === 0) return null

  if (before.editorial_checked_at) {
    restore['editorial_checked_at'] = before.editorial_checked_at
  }
  if (before.is_curated) restore['is_curated'] = true
  return restore
}

const STAMP_COLUMNS =
  'is_curated, editorial_checked_at, editorial_image_at, editorial_description_at, editorial_tags_at'

type VerdictRow = Stamps & {
  is_curated: boolean
  editorial_checked_at: string | null
}

export type WritePlantOptions = {
  /**
   * Criteria this write takes responsibility for. Their stamps are set to
   * `now` in the same statement, which is what makes the trigger treat them as
   * claimed rather than re-opened.
   *
   * Use when the write IS the judgment — a reviewer confirming a species, the
   * editorial pass signing off a rewrite it just made.
   */
  claim?: Criterion[]
  /**
   * Keep the existing verdict across a change that is not an editorial event.
   *
   * Costs a second statement, and there is no way around that: the trigger
   * compares values, so writing the old stamp back inside the same update is
   * indistinguishable from not writing it. Against the now-cleared stamp the
   * same write is a change, and a change is a claim.
   *
   * An exception, so say why at the call site — a smaller rendition of the
   * same photograph is one, a different photograph is not.
   */
  preserveVerdict?: boolean
}

/**
 * Update a plant and leave its editorial verdict in a coherent state.
 *
 * Returns the row's verdict after the write, so a caller can report what it
 * actually did rather than what it intended.
 */
export async function writePlant(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  options: WritePlantOptions = {}
): Promise<VerdictRow> {
  const { claim = [], preserveVerdict = false } = options

  if (claim.length && preserveVerdict) {
    throw new Error(
      'writePlant: claim and preserveVerdict are opposites — either this write ' +
        'is the judgment, or it is a change the existing judgment survives.'
    )
  }

  const reopened = criteriaTouchedBy(patch)

  let before: VerdictRow | null = null
  if (preserveVerdict && reopened.length) {
    const { data, error } = await supabase
      .from('plants')
      .select(STAMP_COLUMNS)
      .eq('id', id)
      .single()
    if (error)
      throw new Error(`writePlant: could not read verdict: ${error.message}`)
    before = data as unknown as VerdictRow
  }

  const now = new Date().toISOString()
  const body = { ...patch }
  for (const c of claim) body[CRITERION_STAMP[c]] = now

  const { error: writeErr } = await supabase
    .from('plants')
    .update(body)
    .eq('id', id)
  if (writeErr)
    throw new Error(`writePlant: update failed: ${writeErr.message}`)

  if (before) {
    const restore = verdictToRestore(before, reopened)
    if (restore) {
      const { error } = await supabase
        .from('plants')
        .update(restore)
        .eq('id', id)
      if (error) {
        throw new Error(
          `writePlant: the change was written but the verdict was NOT restored ` +
            `(${error.message}). Row ${id} is now unapproved; re-run the ` +
            `editorial pass for it or re-apply the verdict by hand.`
        )
      }
    }
  }

  return reconcileIsCurated(supabase, id)
}

/**
 * Bring `is_curated` in line with the three criterion stamps.
 *
 * Safe to call on any row: it touches no criterion column, so it cannot itself
 * re-open anything, and it writes only when the flag actually disagrees.
 */
export async function reconcileIsCurated(
  supabase: SupabaseClient,
  id: string
): Promise<VerdictRow> {
  const { data, error } = await supabase
    .from('plants')
    .select(STAMP_COLUMNS)
    .eq('id', id)
    .single()
  if (error) {
    throw new Error(
      `reconcileIsCurated: could not read verdict: ${error.message}`
    )
  }
  const row = data as unknown as VerdictRow

  const should = isCurated(row)
  if (should === row.is_curated) return row

  const { error: flagErr } = await supabase
    .from('plants')
    .update({ is_curated: should })
    .eq('id', id)
  if (flagErr) {
    throw new Error(
      `reconcileIsCurated: could not set is_curated=${should}: ${flagErr.message}`
    )
  }
  return { ...row, is_curated: should }
}
