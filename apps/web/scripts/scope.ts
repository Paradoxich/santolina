/**
 * Scope flags — the shared "which plants am I touching?" argument, and the
 * refusal that fires when a script is run without one.
 *
 *   --round <label>   the ids that round's seed run recorded in its manifest
 *   --ids <a,b,c>     an explicit list
 *   --all             the whole catalog, deliberately
 *   --why "<reason>" required alongside --all, and printed in the run output
 *
 * There is no default. A catalog-wide default is what let draft-hardiness pick
 * up 177 plants during round 8 (its own 101 plus round 7's 76) while every
 * message on screen said "round 8" — recorded in docs/database-log.md and
 * waived in rounds/8/scope-allow.json. The scripts that bill Claude per row
 * have the same shape and the same exposure, so the flag is mandatory rather
 * than merely available.
 *
 * A scope selects rows. It does not replace a script's own state predicate
 * (ai_drafted_at IS NULL, hardiness_rating IS NULL, --new-only): those still
 * apply, but they narrow *within* the chosen scope instead of being the scope.
 *
 * The `at(flag)` reader is lifted from cross-check-native-region.ts, which is
 * where this pattern was written first.
 */

import { readRoundManifest } from './round-manifest'

export type Scope =
  | { kind: 'round'; label: string }
  | { kind: 'ids'; ids: string[] }
  | { kind: 'all' }

/** Read a `--flag value` pair out of an argv array. */
export function flagValue(
  flag: string,
  argv: string[] = process.argv.slice(2)
): string | undefined {
  const i = argv.indexOf(flag)
  if (i < 0) return undefined
  const value = argv[i + 1]
  // `--round --apply` means the label was forgotten, not that it is "--apply".
  if (!value || value.startsWith('--')) return undefined
  return value
}

/**
 * Returns null when no scope flag is present — callers decide whether that is
 * an error (requireScope) or acceptable.
 *
 * Throws on an ambiguous pair. Silently preferring one flag over another would
 * mean a run whose printed scope and actual scope disagree, which is the exact
 * class of bug this module exists to end.
 */
export function parseScope(
  argv: string[] = process.argv.slice(2)
): Scope | null {
  const round = flagValue('--round', argv)
  const idsRaw = flagValue('--ids', argv)
  const all = argv.includes('--all')

  const given = [
    round ? '--round' : null,
    idsRaw ? '--ids' : null,
    all ? '--all' : null,
  ].filter(Boolean)

  if (given.length > 1)
    throw new Error(
      `Ambiguous scope: ${given.join(' and ')} were both passed. Pick one.`
    )

  if (round) return { kind: 'round', label: round }
  if (idsRaw) {
    const ids = idsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!ids.length) throw new Error('--ids was passed but parsed to no ids.')
    return { kind: 'ids', ids }
  }
  if (all) return { kind: 'all' }
  return null
}

/**
 * Parse a scope or exit 1 with an explanation. `script` names the caller and
 * `cost` says what an unscoped run would actually do — the refusal is only
 * useful if it tells you why the flag is not a formality.
 */
export function requireScope(
  script: string,
  cost: string,
  argv: string[] = process.argv.slice(2)
): Scope {
  let scope: Scope | null
  try {
    scope = parseScope(argv)
  } catch (err) {
    console.error(`\n${(err as Error).message}\n`)
    process.exit(1)
  }

  if (!scope) {
    console.error(
      `\nScope required: pass --round <label>, --ids <a,b>, or --all.\n\n` +
        `There is no default. ${cost}\n\n` +
        `--round <label> reads the ids the seed run recorded in\n` +
        `rounds/<label>/manifest.json. --all is the deliberate whole-catalog\n` +
        `run — spell it out and ${script} will do it.\n`
    )
    process.exit(1)
  }
  return scope
}

/**
 * The ids a scope selects, or null for --all (meaning "do not filter by id").
 *
 * A --round whose manifest lists no ids throws rather than returning an empty
 * list. An empty selection that exits 0 is indistinguishable from success, and
 * "the run reported done having touched nothing" is how several entries in
 * docs/database-log.md begin.
 */
export function scopeIds(scope: Scope): string[] | null {
  if (scope.kind === 'all') return null
  if (scope.kind === 'ids') return scope.ids

  const manifest = readRoundManifest(scope.label)
  if (!manifest)
    throw new Error(
      `No manifest for round "${scope.label}" — expected ` +
        `rounds/${scope.label}/manifest.json. Seed rounds write it; ` +
        `check the label.`
    )
  if (!manifest.seeded_ids.length)
    throw new Error(
      `Round "${scope.label}" has a manifest but seeded no plants. ` +
        `Refusing rather than running against an empty scope.`
    )
  return manifest.seeded_ids
}

/** One line for the run log, so the scope is visible in the output. */
export function describeScope(scope: Scope, ids: string[] | null): string {
  switch (scope.kind) {
    case 'round':
      return `Scope: round ${scope.label} — ${ids?.length ?? 0} plant(s) from rounds/${scope.label}/manifest.json`
    case 'ids':
      return `Scope: ${scope.ids.length} explicit id(s)`
    case 'all':
      return 'Scope: --all (whole catalog)'
  }
}

// ---------------------------------------------------------------------------
// The freeze — a finished round is finished
// ---------------------------------------------------------------------------

/**
 * Narrow a plants query to the scope's rows.
 *
 * `--all` returns the query untouched, which is the deliberate whole-catalog
 * run and the only way to reach rows outside the current round.
 */
export function applyScope<T>(query: T, ids: string[] | null): T {
  if (!ids) return query
  // Supabase's builder is chainable; the cast keeps callers from having to
  // name PostgrestFilterBuilder's generics at every call site.
  return (query as { in: (col: string, v: string[]) => T }).in('id', ids)
}

/**
 * A per-write assertion that a plant belongs to the active scope.
 *
 * WHY BOTH THIS AND `applyScope`. The query filter decides which rows a script
 * FETCHES; this decides which rows it may WRITE. They are usually the same set
 * and the duplication is the point — every cross-round write in round 8 came
 * from a script whose selection was a state predicate ("where hardiness is
 * null") rather than a scope, and a state predicate looks exactly like a scope
 * right up until it silently matches an older round's rows. If a future edit
 * loosens a query, this still refuses.
 *
 * The refusal names the plant and the scope, because the useful question when
 * this fires is "which round did this row belong to?", not "which line threw?".
 */
export function scopeGuard(
  scope: Scope,
  ids: string[] | null
): (id: string, label?: string) => void {
  const allowed = ids ? new Set(ids) : null
  return (id, label) => {
    // --all is the deliberate whole-catalog run; it has already been spelled
    // out on the command line and justified with --why.
    if (!allowed || allowed.has(id)) return
    throw new Error(
      `Refusing to write to ${label ?? id}: it is outside ${describeScope(scope, ids).replace(/^Scope: /, '')}.\n` +
        'A finished round is frozen. If this write is genuinely meant to reach ' +
        'older rows, say so explicitly with --all --why "<reason>", which is ' +
        'recorded in the run output and reviewable, rather than widening a ' +
        'query until it happens by accident.'
    )
  }
}

/**
 * The reason a whole-catalog run is justified. Required with `--all`.
 *
 * `--all` is legitimate — the style re-tag and the region regeneration both
 * had to sweep the catalog — but it is also how a routine round quietly
 * rewrites 400 older rows. Requiring a sentence does not prevent that; it
 * makes the operator state an intention, which is the difference between a
 * decision and an accident, and it puts the reason in the run output where a
 * reader can disagree with it.
 */
export function requireReasonForAll(
  scope: Scope,
  argv: string[] = process.argv.slice(2)
): string | null {
  if (scope.kind !== 'all') return null
  const why = flagValue('--why', argv)
  if (!why) {
    console.error(
      '\n--all needs --why "<reason>".\n\n' +
        'A whole-catalog run reaches every finished round. That is sometimes ' +
        'right (the July 2026 style re-tag, the region regeneration) and is ' +
        'always worth a sentence, which is recorded in the run output.\n'
    )
    process.exit(1)
  }
  return why
}
