/**
 * The pipeline's mechanical invariants. Run by `pnpm invariants:check` and CI.
 *
 * WHY THIS EXISTS. The 2026-08-14 audit found nine confirmed findings and not
 * one of them was a hard bug: they were all a shape that had been allowed to
 * repeat. A stamp column with no writer. A stamp written before its finding was
 * acted on. A guard predicate that could never fire against a NOT NULL DEFAULT
 * column. Seven copies of one resolver, six identical and the seventh missing
 * twelve synonym groups. A trap described in prose with nothing executable
 * behind it. Each was cheap to find once named, and each had been sitting there
 * for rounds because nothing looked for it on the way in.
 *
 * WHERE THIS LIVES, AND WHY IT IS NOT A VITEST FILE. Decided 2026-08-16, after
 * the review recorded a genuine dissent. The rule:
 *
 *   · a check that CALLS code is a test — vitest. `round-rehearsal.test.ts`
 *     owns runbook and registry drift by importing RUNBOOK and comparing it to
 *     the step registry. Do not duplicate that here.
 *   · a check that READS FILES AS TEXT is a source scan — this script, next to
 *     `check-tokens.ts`, `generate-runbook-doc.ts` and `check-doc-links.ts`.
 *
 * Those are two mechanisms, not one fact in two homes. This file therefore
 * imports nothing from the modules it checks: it parses migration SQL, markdown
 * and TypeScript source as text. The reason is not purity, it is that a scan
 * must be able to see code that would not compile or would not run.
 *
 * WHY A SCRIPT AND NOT A TEST, CONCRETELY. Two things a passing test cannot do.
 * A failure here carries the remedy, the way `check-doc-links.ts` prints "link
 * the section's anchor instead" rather than an array diff. And a GREEN run still
 * prints its backlog — the traps-unpinned count and the three hatch lists —
 * because every escape hatch below is a ratchet that is supposed to shrink, and
 * a silent ratchet is how an allowlist quietly becomes permanent. That is the
 * same shape as everything the audit found. The counts are printed rather than
 * written down here, because a number in a comment is the thing this whole
 * session was about.
 *
 * THE RATCHET RULE. Every escape hatch is an exported record with a reason
 * string, so it is diffable and the reasons are reviewable. An entry that no
 * longer describes a violation is itself a FAILURE — delete it. That is what
 * stops the lists from growing quietly.
 *
 * WIRING, WHICH BIT ONCE ALREADY. CI runs these checks from the REPO ROOT, so a
 * new one needs three edits, not one: the script in `apps/web/package.json`, a
 * passthrough in the root `package.json`, and a `turbo.json` task with
 * `cache: false`. This file's own first CI run failed with "Command
 * invariants:check not found" because only the first was done and it had been
 * verified by running it from `apps/web`. A green local run is not evidence
 * about CI, which is the same class of mistake this file exists to catch.
 *
 * WHAT A GREEN RUN DOES NOT MEAN. Nothing here proves a stamp is written at the
 * right moment, that a trap's test asserts the right thing, or that a script
 * does what its runbook step claims. These are shape checks on text. The
 * semantics live in the tests, in `verify-round.ts`, and in a person reading the
 * round report.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { REPO_ROOT } from './token-source'
// Imported rather than restated: the suffix list that decides "can this column
// be compared to an instant" has one home, in the module that queries it.
import { isWindowQueryable } from './run-provenance'
// STEP_DEFS is a plain const and getSupabaseAdmin is lazy, so this import costs
// no env and no connection — checked before adding it, because this script runs
// in CI without .env.local.
import { STEP_DEFS } from './round-status'

// ---------------------------------------------------------------------------
// Escape hatches. Each entry: subject → why it is allowed, today.
// Deleting an entry is the goal. Adding one needs a reason a reviewer can read.
// ---------------------------------------------------------------------------

/** Shape 2. Stamp columns that exist in the schema with no TypeScript writer. */
export const STAMPS_WITHOUT_WRITERS: Record<string, string> = {
  native_to_reviewed_at:
    'Written only by migration 20260813110500, backfilling 151 reviewed-and-kept rows from reference/native-to-review-2026-07-30.json. NOW LOAD-BEARING: since 2026-08-16 shouldStamp() in cross-check-native-to.ts treats this column as the record that a person read a phrase and kept it, which is the only way a gross/contradicts row settles without a rewrite. With no writer, a NEW kept row cannot be recorded and will fail round close until the phrase is rewritten instead. The --review-keep writer (audit F5) is what deletes this entry.',
}

/** Shape 3. `stampChecked` callers with no finding-aware selector (trap 24). */
export const REPORT_ONLY_STAMPS: Record<string, string> = {
  'cross-check-plants.ts':
    'Stamps botanical_checked_at per row as the pass walks the catalog, so the stamp records that the check ran, not that a disagreement was acted on. Report-only by design today: it never edits catalog data. Fix is the rowsToStamp shape from cross-check-native-region.ts.',
}

/**
 * Shape 4. Traps with no test naming them.
 *
 * Pinned as of 2026-08-16: 3, 7, 13, 14, 24, 26, 27 — seven, not the three the
 * schema review counted. `migration-drift.test.ts`'s header already named traps
 * 13 and 14 before this check existed; the review's "25 of 28" was reasoning
 * about the three traps fixed that day and did not scan for the rest. This is
 * the first thing the mechanism bought: it disagreed with the document that
 * asked for it.
 *
 * Everything below is the backlog. The reason field says what a test would have
 * to get hold of, because that is what decides whether a trap is cheap or
 * expensive to close — and several have no callable seam at all, which is why
 * the rule allows a source scan as the alternative.
 */
export const TRAPS_NOT_PINNED: Record<string, string> = {
  '1': 'Rate-limit fallback. The fix removed the fallback; a test needs a fake fetch that 429s and an assertion that the error propagates. Cheap, and worth doing next.',
  '1b': 'Trigger semantics. Only observable against a live or replayed Postgres; pnpm trigger:contract is the existing home and would need to become a checked artifact.',
  '2': '--new-only scoping. Now state-based (*_checked_at IS NULL); the seam is each script argument parser, and the honest witness is a query, not a unit.',
  '4': 'Steps silently not running. round-rehearsal.test.ts covers the registry half; the remaining half is run-round.ts skip logic.',
  '5': 'Unmapped colour values. lib/explore-filters.test.ts covers the filter side; the seam for the write side is check-bloom-colors.ts.',
  '6': 'Trefle common names are botanical. No code defect to pin: the remedy is a human name pass. A scan could assert the name pass ran per round manifest.',
  '8': 'reports/ is gitignored. Environmental; a scan could assert no script treats a cache miss as an empty result.',
  '9': 'Trefle field names. Would be caught by generated API types, not by a scan.',
  '10': 'Trefle native[] includes introduced range. Open by design; the witness is WCVP disagreement counts, which is data, not code.',
  '11': 'GBIF matches upward into a genus. Seam is lib/wcvp-lookup.ts; scripts/wcvp-lookup.test.ts exists but names no trap.',
  '12': 'Manifest records names before the name pass. Seam is round-manifest.ts plus the name pass order in RUNBOOK.',
  '15': 'WCVP cache mixes GBIF checklists. Open by design. wcvp-lookup.test.ts names it inside a case, which is a useful comment and not a closure — moving that line into the header would pin it.',
  '16': 'Pairing check rots without a timestamp. Premise was false and the entry records the correction; the fix is pinned by scripts/scope.test.ts, which names no trap.',
  '17': 'A written-down blocker outlives the blocker. This is a documentation-claim trap; the doc rules queued for handoff step 3 are its remedy, not a test.',
  '18': 'RLS block and empty table look identical. Needs a live anon client.',
  '19': 'A test that cannot fail. Meta; the closest mechanism is this file.',
  '20': 'A judge can cite a fault that cannot exist. Prompt-level; the seam is the judge schema.',
  '21': 'listUsers 500s above the user count. Seam is the purge script; needs a live auth admin.',
  '22': 'A corrected field leaves its prose sibling stale. Seam exists (curate-editorial withdrawal); listed in the review as can-wait.',
  '23': 'Fuzzy prose against an exact vocabulary. Seam is the style-tag vocabulary in lib/style-tags.ts.',
  '25': 'Grants lived outside the repo. Only observable on a fresh replay; the migration-replay job the review sketched is the home.',
}

/** Shape 5. Scripts with no runbook step and no end condition, not yet archived. */
export const SCRIPTS_PENDING_ARCHIVE: Record<string, string> = {
  'wikimedia-image-proof.ts':
    'Proved Wikimedia CC-BY/BY-SA sourcing before the July 22 image pass. Decision shipped; resolveP18/fetchCommonsImage now live in lib/wikimedia.ts. Archive per artifact (c/1).',
  'repair-combinations.ts':
    'One-off repair. The only archive candidate with no record anywhere, so archiving it needs a database-log line naming what it repaired and when, in the same change.',
  'backfill-legacy-editorial.ts':
    'One-off. Archive as a WRONG-SHAPE example: it stamps all four editorial stamps and writes is_curated directly, against standing rule 6 and migration 20260728220852 own column comment.',
}

/**
 * Shapes 8-11. Stamp-writing scripts not yet participating in write provenance.
 *
 * Every one of these writes a stamp with no run record, so the value it produces
 * has no recoverable production context — no model, no recipe, no outcome. The
 * mechanism landed 2026-08-16 wired into curate-plants; the rest is mechanical,
 * about five lines each, and this list is what stops it being forgotten.
 *
 * DELETING AN ENTRY IS THE WORK. Round 12 should not run until this is empty:
 * the point of the infrastructure is to stop accumulating provenance debt, and a
 * round that runs half-wired creates exactly the historical boundary it exists
 * to prevent.
 */
export const RUNS_WITHOUT_PROVENANCE: Record<string, string> = {
  // --- round steps: EMPTY as of 2026-08-16, and the gate round 12 waited on.
  //     Every step the runbook runs now opens a run. Do not add one back here
  //     without saying why a round step may write without a record. ---

  // --- outside the round cadence ---
  'apply-native-to-fixes.ts':
    'Applies committed decisions and NULLS native_checked_at. A clearing write is still a write.',
  'apply-seasonal-care-fixes.ts': 'Same generate-then-apply shape.',
  'apply-image-confirmations.ts':
    'Writes image_verified_at from a review file.',
  'apply-image-reverts.ts': 'Clears a curated hero and its stamps.',
  'set-plant-hero.ts':
    'Manual hero override. Writes image_url_curated and stamps.',
  'feed-wikimedia-candidates.ts':
    'Appends candidates and CLEARS image_checked_at so the pass re-picks.',
  'backfill-guard-stamps.ts':
    'Report-derived stamping. Its state-derived half was deleted 2026-08-14 after it fabricated 100 stamps, so this is the script whose provenance matters most and has none.',
  'fix-round8-names.ts':
    'One-off name pass, kept as the apply-script template.',
  'fix-round11-names.ts': 'One-off name pass.',
  'fix-round12-names.ts':
    'One-off name pass, round 12. Same category as rounds 8 and 11 above.',
  'fix-oversized-heroes.ts':
    'One-off image repair. Found by this scan rather than by the list, which is the scan doing its job.',

  // --- archive candidates: these leave scripts/ rather than get wired ---
  'apply-sun-widening.ts':
    'Neutralized by a trigger; queued for archive (artifact c/1).',
  'backfill-legacy-editorial.ts': 'Wrong-shape example; queued for archive.',
  'repair-combinations.ts': 'One-off repair; queued for archive.',
}

/**
 * Shape 1. Places a not-null column is compared to null, allowed on inspection.
 * A comparison against an AI RESPONSE field is not the trap-26 shape: the
 * response is parsed JSON where the key really can be absent.
 */
export const NULL_COMPARISONS_ALLOWED: Record<string, string> = {}

/** Shape 13. Files that page a table without lib/paginate.ts (standing rule 5). */
export const HAND_ROLLED_PAGINATION: Record<string, string> = {
  'backup-catalog.ts':
    'Third copy of the page loop. Its own pageSize, its own from/to arithmetic. Correct today — it does paginate — so this is duplication, not a cap bug. Named by the 2026-08-14 audit section 4.',
  'restore-catalog.ts':
    'Fourth copy, same shape as backup-catalog. The pair is the reason this check exists rather than a note in a report: CLAUDE.md already says that the third script working around a thing means the transport is wrong, not that the problem is hard.',
}

/**
 * Shape 17. A write conditioned on editorial state, hand-rolled.
 *
 * THE DUPLICATION. `from: string // expected current value — drift guard`
 * appears verbatim in four scripts; two more spell the same field `expect` and
 * `stored`. Each then re-derives the same three decisions: is the stored value
 * still what my decision was about, is this row curated, and what do I print.
 * `scripts/reviewed-mutation.ts` is the one home.
 *
 * ONE AT A TIME, WHICH IS WHY THIS IS A LIST AND NOT A SWEEP. Every entry here
 * is also in `RUNS_WITHOUT_PROVENANCE`, so migrating one is a natural moment to
 * wire its run record too — but the two were deliberately not done together
 * (plan step C's scope decision, 2026-08-17): safety machinery that does not
 * exist yet cannot check the refactor that introduces it.
 *
 * `apply-native-to-fixes.ts` IS NOT HERE, and the reason is the shape rather
 * than an oversight. It hand-rolls the drift guard, so it reads like the other
 * six — but `native_to` is not a column any editorial verdict is about, so it
 * never conditions its write on `is_curated` and the scan does not see it. It
 * should still migrate; nothing forces it, and a hatch entry the scan cannot
 * produce would only fail as a stale hatch.
 */
export const HAND_ROLLED_REVIEWED_MUTATION: Record<string, string> = {
  'apply-description-fixes.ts':
    'The closest to migrated already: it reports the verdicts it retires, which is where the primitive got that half from. Its `expect` guard covers a single column and its run record is wired, so it is the lowest-value migration of the six and goes last.',
  'apply-sun-widening.ts':
    'Guards on `stored` read out of a cross-check report rather than a hand-authored decision, and re-checks `is_curated` a second time at the write with `.eq("is_curated", false)`. That belt-and-braces has no equivalent in the primitive; decide whether to add it or drop it when this one moves.',
  'fix-round8-names.ts':
    'Round 8. Matches by `scientific_name`, not id, so migrating it means resolving names to ids first — the primitive takes ids on purpose, because a name is a value and values drift.',
  'fix-round11-names.ts': 'Round 11. Same shape as fix-round8-names.',
  'fix-round12-names.ts': 'Round 12. Same shape as fix-round8-names.',
}

/**
 * Shape 16. A `forward` step whose data became something a reader can see.
 *
 * WHAT `forward` CLAIMS. `StepDef.obligation` (round-status.ts, 2026-08-17) lets
 * a step say that rows seeded before it existed are DONE rather than owed. That
 * is the only thing in the repo that shrinks a backlog by ruling rather than by
 * work, so it is the one that must not rot quietly. The claim is always the same
 * negative: *no reader can tell that this check never ran on this row.* An
 * asserted negative closes only by becoming a ratchet entry (standing rule 14),
 * and this is that entry.
 *
 * EVERY `forward` STEP MUST APPEAR HERE. A step declaring `forward` with no
 * witness fails, because "nobody can see it" with nothing naming HOW that stops
 * being true is the 277-row ruling again — a decision with no mechanism, which a
 * later session reversed without noticing it was reversing anything.
 *
 * TWO ASSERTIONS PER ENTRY, and the second is the one that matters:
 *
 *   `columns`  — the names must not be READ in code under app/, components/,
 *                hooks/ or lib/. Comment-only lines are stripped and `allowedIn`
 *                names the files where an appearance is not a read. Coarse on
 *                purpose: a trailing comment or a same-named local will raise a
 *                false alarm, which costs an allowlist line, where a false
 *                silence costs the policy.
 *   `module`   — the formatter or helper that WOULD render it must have no
 *                importer. This is what a column scan cannot see: a module can
 *                sit fully written, naming its columns only in prose, one import
 *                away from being live.
 *
 * WHY THE SECOND ASSERTION EXISTS, in full, because it corrected the plan this
 * work came from. That plan justified hardiness as `forward` on the August audit's
 * "hardiness_verified has zero writers, so the display gate is permanently
 * false". Checked 2026-08-17: **false.** `catalog-state.ts:185` counts 267 rows
 * at `hardiness_verified = true` from the July verification pass. The
 * classification survived only because of something nobody had looked at — that
 * `lib/hardiness.ts` has no importer anywhere, and the survive-winter bullet that
 * does render (`lib/good-for-your-garden.ts:59-72`) reads `hardiness_zone_min` /
 * `hardiness_zone_max`, USDA columns, not the RHS pair at all. A witness written
 * against the stated reason would have been asserting a falsehood.
 */
export const FORWARD_STEP_WITNESSES: Record<
  string,
  { columns: string[]; module?: string; allowedIn?: string[]; reason: string }
> = {
  'draft-hardiness': {
    columns: ['hardiness_rating', 'hardiness_verified'],
    module: 'apps/web/lib/hardiness.ts',
    allowedIn: ['apps/web/lib/plants-db.ts'],
    reason:
      'The RHS hardiness track is parked (docs/curation.md#hardiness). lib/hardiness.ts formats a rating and NOTHING imports it; the live survive-winter bullet reads hardiness_zone_min/max instead. plants-db.ts carries the columns on the DbPlant row type, which is the shape of a row and not a read of one. This flips to catalog the day that module gains an importer.',
  },
}

/**
 * A confirmed defect that no shape above detects, kept honest by a witness.
 *
 * WHY THIS EXISTS. Ratchets only hold work that some check can already see. A
 * one-off defect — `checkCombos` reading two columns where it needs five — is
 * not a shape, so before this list its only home was a dated audit report, and a
 * report cannot tell you whether its findings are still true. That is failure
 * (b) from the other direction: a session reads a 2026-08-14 document and treats
 * a fixed finding as open, or an open one as fixed, with nothing to check
 * against.
 *
 * THE WITNESS IS THE WHOLE MECHANISM. Every entry names a regex that MATCHES
 * WHILE THE DEFECT IS PRESENT. So:
 *
 *   · the witness still matches  → the finding is genuinely open, and the count
 *     prints on every green run
 *   · the witness stops matching → the code was fixed, and THIS CHECK FAILS
 *     telling you to delete the entry
 *
 * That is the same contract as every list above, and it is what makes "is the
 * backlog stale?" answerable: an entry cannot survive its own fix, so an empty
 * list means empty and never means forgotten. Prose could not do that, which is
 * why the audit reports could not be deleted while they were the only home.
 *
 * WHAT DOES NOT BELONG HERE, so this does not become a second backlog:
 *
 *   · a DEFERRED SCHEMA CHANGE → standing rule 11's list in database-log.md,
 *     which already says a deferral recorded only at the blocked site is
 *     invisible when the block lifts (trap 17)
 *   · a DESIGN PROPOSAL or a feature → the Notion Build Backlog. Code cannot
 *     compute whether the product still wants a thing, and a witness for
 *     "we never built X" is just an absence that stays true forever
 *
 * A finding here is a defect in code that exists, that someone confirmed, and
 * that a regex can see.
 */
export interface OpenFinding {
  /** One line: what is wrong. */
  what: string
  /** Where it was confirmed, so the reasoning is recoverable after the report goes. */
  source: string
  /** Repo-relative file the witness reads. */
  file: string
  /** Matches while the defect is present. */
  witness: RegExp
  /** What closing it looks like. */
  remedy: string
}

export const OPEN_FINDINGS: Record<string, OpenFinding> = {
  // 'demo-purge-swallows-storage-failure' CLOSED 2026-08-16. The decision it
  // was blocked on was made — a storage failure does NOT block the account
  // deletion — and the silence was fixed instead: paths and error land on
  // PurgeResult.orphanedPhotos while the rows still exist, and both callers
  // print them. Pinned by lib/purge-demo-users.test.ts, which asserts the
  // record, the ordering against deleteUser, and that the account still goes.
  'editorial-approval-never-withdrawn': {
    what: 'curate-editorial has no path that withdraws an approval. `if (approved) patch.is_curated = true` is its only is_curated write and the criterion stamps are set only on pass, so re-judging an approved row to hold prints "hold" while the database still records approval and keeps the old stamps. The trigger cannot cover it: it clears only when the criterion FIELD changes, and a hold changes no field.',
    source:
      'Schema design review 2026-08-14, section 6b — its single-analyst list, so the review is not the evidence. Confirmed 2026-08-16 by reading curate-editorial.ts: the write has moved since, its shape has not, and grep shows it is still the only is_curated write in the file. The review also records (section 6a) that the resulting state is undetectable by query, being indistinguishable from a genuine approval.',
    file: 'apps/web/scripts/curate-editorial.ts',
    witness: /if \(approved\) patch\.is_curated = true/,
    remedy:
      'The two one-line fixes the review names: write `patch.is_curated = approved` unconditionally, and null the stamp for each non-pass criterion. This closes forward only — because the state is query-undetectable, no sweep can find the rows it has already produced.',
  },
  'sun-audit-targets-a-derived-column': {
    what: 'cross-check-plants raises `disagree` flags on sun_requirements, a BEFORE-trigger-derived mirror of sun_thrives/sun_tolerates (migration 20260709220000). Nothing can act on them: a write to that column is recomputed away, and the only consumer that ever tried is apply-sun-widening, which is non-convergent for exactly that reason and is queued for archive.',
    source:
      'Pipeline audit 2026-08-14 section 4 and schema design review section 6b, both unverified passes. Confirmed 2026-08-16 by reading cross-check-plants.ts against migration 20260709220000, which is where the derive trigger is declared.',
    file: 'apps/web/scripts/cross-check-plants.ts',
    witness: /field: 'sun_requirements',\s*\n\s*severity: 'disagree'/,
    remedy:
      "Either retarget the comparison at sun_thrives/sun_tolerates, the columns a person can actually change, or downgrade it to `minor` and let it be a read-only signal. The witness clears on either, because both stop the pass calling a derived column's value a disagreement.",
  },
  'combo-fields-unchecked': {
    what: 'verify-round checkCombos selects only the two plant ids, so a plant_combinations row with a null combination_type, strength or notes passes round close while the companion card has nothing to render.',
    source:
      'Pipeline audit 2026-08-14, section 5 (pass-through, confirmed 2026-08-16 against scripts/verify-round.ts:77 and :169).',
    file: 'apps/web/scripts/verify-round.ts',
    witness: /\.select\('plant_id_a, plant_id_b'\)/,
    remedy:
      'Add combination_type, strength and notes to ComboRow and its select, and FAIL on a null in any of them.',
  },
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

interface Failure {
  shape: string
  subject: string
  detail: string
  remedy: string
}

const failures: Failure[] = []
const fail = (f: Failure) => failures.push(f)

/** Escape-hatch entries that never matched a violation this run. */
const staleHatches: Array<{ list: string; key: string }> = []

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
}

const ALL = trackedFiles()
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8')

const MIGRATIONS = ALL.filter(
  (f) => f.startsWith('supabase/migrations/') && f.endsWith('.sql')
).sort()

/** Non-test TypeScript under apps/web, excluding this file and archived scripts. */
const SOURCE_TS = ALL.filter(
  (f) =>
    f.startsWith('apps/web/') &&
    f.endsWith('.ts') &&
    !f.endsWith('.test.ts') &&
    !f.includes('/scripts/archive/') &&
    basename(f) !== 'check-pipeline-invariants.ts'
)

const TEST_FILES = ALL.filter(
  (f) => f.startsWith('apps/web/') && f.endsWith('.test.ts')
)

const PIPELINE_SCRIPTS = ALL.filter(
  (f) =>
    f.startsWith('apps/web/scripts/') &&
    f.endsWith('.ts') &&
    !f.endsWith('.test.ts') &&
    !f.includes('/archive/')
).map((f) => basename(f))

/** Strip line comments and block-comment bodies, so prose never triggers a scan. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => {
      const i = line.indexOf('//')
      if (i === -1) return line
      // Not a comment if the // sits inside a string or a URL.
      const before = line.slice(0, i)
      const quotes = (before.match(/['"`]/g) ?? []).length
      if (quotes % 2 === 1 || before.endsWith(':')) return line
      return before
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// Shape 1. A guard predicate that can never fire (trap 26)
//
// A column declared NOT NULL DEFAULT is never null, so `column === null` is a
// dead branch that reads like a guard. curate-plants.ts asked the style question
// and wrote nothing for three weeks behind exactly this.
//
// HONEST LIMIT: this reads column facts off `not null default` in migration
// text and subtracts later `drop not null`. It does not replay ALTERs in order
// — a real SQL parser is machinery for a fact `supabase gen types` generates,
// and once generated row types land, this shape becomes a compiler concern.
// Until then the scan is load-bearing: TypeScript exempts null from its
// no-overlap check, so the trap-26 comparison compiles clean even against
// non-nullable types.
// ---------------------------------------------------------------------------
function notNullDefaultColumns(): Set<string> {
  const declared = new Set<string>()
  const dropped = new Set<string>()
  for (const file of MIGRATIONS) {
    const sql = read(file).toLowerCase()
    for (const m of sql.matchAll(
      /(?:add column\s+(?:if not exists\s+)?)?\b([a-z_]{3,})\s+(?:boolean|text|integer|int|numeric|jsonb|uuid|timestamptz|text\[\]|integer\[\])(?:\[\])?\s+not null\s+default/g
    )) {
      if (m[1]) declared.add(m[1])
    }
    for (const m of sql.matchAll(
      /alter column\s+"?([a-z_]+)"?\s+drop not null/g
    )) {
      if (m[1]) dropped.add(m[1])
    }
  }
  for (const d of dropped) declared.delete(d)
  return declared
}

function checkUnreachablePredicates(): void {
  const columns = notNullDefaultColumns()
  const seen = new Set<string>()

  for (const file of SOURCE_TS) {
    const src = stripComments(read(file))
    src.split('\n').forEach((line, i) => {
      for (const col of columns) {
        const re = new RegExp(
          `(^|[^\\w.])((?:[\\w$]+\\.)?)${col}\\s*[!=]==?\\s*null`,
          'g'
        )
        for (const m of line.matchAll(re)) {
          const receiver = (m[2] ?? '').replace(/\.$/, '')
          const where = `${file}:${i + 1}`
          // An AI response is parsed JSON: its keys really can be absent, so a
          // null check there is not the trap-26 shape.
          if (/response|payload|parsed|raw|json/i.test(receiver)) {
            continue
          }
          const key = `${basename(file)}:${col}`
          if (NULL_COMPARISONS_ALLOWED[key]) {
            seen.add(key)
            continue
          }
          fail({
            shape: 'unreachable predicate vs DB default (trap 26)',
            subject: where,
            detail: `\`${m[0].trim()}\` — \`${col}\` is NOT NULL DEFAULT in the schema, so this branch can never be taken.`,
            remedy:
              'A defaulted column cannot witness whether the question was ever asked. Guard on the stamp instead (`x_checked_at === null`), the way curate-plants.ts buildPatch does.',
          })
        }
      }
    })
  }

  for (const key of Object.keys(NULL_COMPARISONS_ALLOWED)) {
    if (!seen.has(key))
      staleHatches.push({ list: 'NULL_COMPARISONS_ALLOWED', key })
  }
}

// ---------------------------------------------------------------------------
// Shape 2. A stamp column with no writer
//
// A stamp nobody writes drains silently: every consumer reads null and concludes
// "never checked", which is indistinguishable from "the writer was deleted".
// ---------------------------------------------------------------------------
const STAMP_RE = /\b([a-z_]+_(?:checked|verified|reviewed|drafted)_at)\b/

function stampColumns(): string[] {
  const found = new Set<string>()
  for (const file of MIGRATIONS) {
    const sql = read(file).toLowerCase()
    for (const m of sql.matchAll(
      /add column\s+(?:if not exists\s+)?([a-z_]+_(?:checked|verified|reviewed|drafted)_at|editorial_[a-z]+_at)\b/g
    )) {
      if (m[1]) found.add(m[1])
    }
  }
  return [...found].sort()
}

function checkStampWriters(): void {
  const stamps = stampColumns()
  const withoutWriter: string[] = []

  for (const stamp of stamps) {
    // A WRITE is the column set to a timestamp or an explicit null (clearing a
    // stamp is a write). What is NOT a write is a read-through — `x: row.x`
    // copying a value into a report row, which is what native_to_reviewed_at
    // has and why it looked written for months. So the VALUE side is what
    // decides, and the assignment operator is not: `patch.editorial_image_at =
    // now` is as much a write as `{ editorial_image_at: now }`.
    //
    // Both halves of this were widened on 2026-08-16, and the three editorial
    // criterion stamps needed both. They are declared by migration
    // 20260729112046, they end `_at` without one of the four vocabulary
    // suffixes, AND curate-editorial builds them onto a patch object by
    // assignment — so the scan had never seen them from either direction, and
    // reported a clean run for a column it was not looking at.
    const writeRe = new RegExp(
      `${stamp}\\s*[:=]\\s*(?:new Date\\(|null\\b|[\\w.]*(?:now|nowIso|timestamp|stampedAt|isoNow)\\b)`,
      'i'
    )
    const writers = SOURCE_TS.filter((f) =>
      writeRe.test(stripComments(read(f)))
    )
    if (writers.length) continue

    if (STAMPS_WITHOUT_WRITERS[stamp]) {
      withoutWriter.push(stamp)
      continue
    }
    fail({
      shape: 'stamp column with 0 writers',
      subject: stamp,
      detail:
        'Declared by a migration, but no non-test source writes it as an object key with a timestamp value.',
      remedy: `Either give it a writer in a runbook-reachable script, or record it in STAMPS_WITHOUT_WRITERS in ${basename(__filename)} with the reason it is read-only.`,
    })
  }

  for (const key of Object.keys(STAMPS_WITHOUT_WRITERS)) {
    if (!withoutWriter.includes(key)) {
      staleHatches.push({ list: 'STAMPS_WITHOUT_WRITERS', key })
    }
  }
}

// ---------------------------------------------------------------------------
// Shape 3. The stamp outruns the write (trap 24)
//
// A guard stamp records that the check RAN. Stamping every row a pass walked,
// including rows whose finding nobody acted on, turns "checked" into "seen" —
// and later passes skip them as settled. The fixed shape is a selector that
// takes the findings and the run flags and returns only the rows that earned a
// stamp: `rowsToStamp` in cross-check-native-region.ts.
// ---------------------------------------------------------------------------
function checkStampSelectors(): void {
  const callers = SOURCE_TS.filter((f) => {
    const src = stripComments(read(f))
    return /\bstampChecked\s*\(/.test(src)
  })
  const excused: string[] = []

  for (const file of callers) {
    const name = basename(file)
    const src = stripComments(read(file))
    // The selector seam: an exported decision function, because a trap you
    // cannot call is a trap you cannot pin. TWO shapes are accepted, and the
    // difference is not cosmetic — it follows from whether the guard writes its
    // own corrections. cross-check-native-region applies them in the same run,
    // so its decision is a batch selector keyed on the run flags
    // (`rowsToStamp(findings, apply, allowEmpty)`). cross-check-native-to never
    // writes the phrase, so there is no flag to key on and its decision is a
    // per-row predicate (`shouldStamp(row)`). Requiring one name would have
    // forced the second guard into a shape its verdict set does not have.
    const hasSelector =
      /export function \w*(?:rowsToStamp|ToStamp|stampTargets|shouldStamp)\w*\s*\(/.test(
        src
      ) && /\b(?:findings|verdict)\b/.test(src)

    if (hasSelector) continue
    if (REPORT_ONLY_STAMPS[name]) {
      excused.push(name)
      continue
    }
    fail({
      shape: 'stamp outruns the write (trap 24)',
      subject: file,
      detail:
        'Calls stampChecked with no exported findings-aware selector, so every row the pass walked is stamped whether or not its finding was acted on.',
      remedy:
        'Extract a `rowsToStamp(findings, apply, allowEmpty)` selector and export it, as cross-check-native-region.ts:461 does, then pin it with a test naming the trap.',
    })
  }

  for (const key of Object.keys(REPORT_ONLY_STAMPS)) {
    if (!excused.includes(key)) {
      staleHatches.push({ list: 'REPORT_ONLY_STAMPS', key })
    }
  }
}

// ---------------------------------------------------------------------------
// Shape 4. A trap with no test
//
// Fixing the code closes the incident; the trap stays open until something
// executable names it. See CLAUDE.md, "A trap is not closed until a test pins
// it". This half is the enforcement.
// ---------------------------------------------------------------------------
function checkTrapsPinned(): { total: number; unpinned: number } {
  const log = read('docs/database-log.md')
  const traps = [...log.matchAll(/^#### (\d+b?)\./gm)].map((m) => m[1]!)

  // A citation is the trap number named in the test file's HEADER, which is
  // where the rule requires it — the leading block comment, not a mention
  // somewhere in a case. The difference is deliberate: a header is a claim
  // about what the file is for, and it is what a person scanning the directory
  // reads. wcvp-lookup.test.ts names trap 15 inside a case; that is a useful
  // comment and not a closure.
  const pinned = new Set<string>()
  for (const file of TEST_FILES) {
    const src = read(file)
    const end = src.indexOf('*/')
    if (!src.trimStart().startsWith('/**') || end === -1) continue
    for (const m of src.slice(0, end).matchAll(/\btraps?\s+(\d+b?)\b/gi)) {
      pinned.add(m[1]!)
    }
  }

  const unpinned: string[] = []
  for (const trap of traps) {
    if (pinned.has(trap)) {
      if (TRAPS_NOT_PINNED[trap]) {
        staleHatches.push({ list: 'TRAPS_NOT_PINNED', key: trap })
      }
      continue
    }
    if (TRAPS_NOT_PINNED[trap]) {
      unpinned.push(trap)
      continue
    }
    fail({
      shape: 'trap with no test',
      subject: `trap ${trap}`,
      detail: `docs/database-log.md documents trap ${trap} and no *.test.ts header names it.`,
      remedy:
        'Pin it: assert the defect own witness through a callable seam, name the trap number in the test header, and cite the test file in the trap entry. If the shape has no callable seam, add a scan here instead. Otherwise record it in TRAPS_NOT_PINNED with what a test would need to get hold of.',
    })
  }

  for (const key of Object.keys(TRAPS_NOT_PINNED)) {
    if (!traps.includes(key)) {
      staleHatches.push({ list: 'TRAPS_NOT_PINNED', key })
    }
  }

  return { total: traps.length, unpinned: unpinned.length }
}

// ---------------------------------------------------------------------------
// Shape 5. A script nothing references
//
// Nothing in scripts/ may be reachable only from someone memory. A one-off that
// stays in scripts/ becomes a template: three live scripts cite
// apply-sun-widening.ts as the pattern to follow, and it has been a no-op since
// a trigger replaced it.
// ---------------------------------------------------------------------------
function checkScriptReachability(): number {
  const runbook = read('apps/web/scripts/runbook.ts')
  const pkg = read('apps/web/package.json')
  // A dated audit or review report records what one run found; it is not a
  // reason a script is live. Naming the archive candidates is exactly what
  // those reports did, so counting them as reachability would make every
  // finding self-excusing. Same FROZEN set as check-doc-links.ts.
  const docs = ALL.filter(
    (f) =>
      (f.startsWith('docs/') || f === 'README.md') &&
      !/^docs\/(pipeline-audit|schema-design-review)-\d{4}-\d{2}-\d{2}\.md$/.test(
        f
      )
  )
    .map(read)
    .join('\n')
  const importers = ALL.filter(
    (f) =>
      f.startsWith('apps/web/') && (f.endsWith('.ts') || f.endsWith('.tsx'))
  ).map((f) => ({ name: basename(f), src: read(f) }))

  const unreferenced: string[] = []

  for (const script of PIPELINE_SCRIPTS) {
    // A round seeder is per-round provenance, like rounds/<n>/ itself: the step
    // that ran it is step 1 of that round, and what ended it is the round
    // closing. The review looked at these and said keep — the fork problem they
    // had was the synonym table, fixed by species-resolver.ts, not their
    // existence. This is a CATEGORY with a standing answer to both header
    // questions, not an escape hatch, so it carries no ratchet entry. What it
    // accepts: a one-off could hide behind the naming convention. Bounded,
    // because the convention names a round and a round leaves a manifest.
    if (
      /^seed-round\d+\.ts$/.test(script) ||
      script === 'seed-regional-natives.ts'
    ) {
      continue
    }

    const stem = script.replace(/\.ts$/, '')
    const inRunbook = runbook.includes(script) || runbook.includes(stem)
    const inPkg = pkg.includes(script)
    const inDocs = docs.includes(script)
    const imported = importers.some(
      (f) =>
        f.name !== script &&
        new RegExp(`from '\\.{1,2}/(?:[\\w./-]*/)?${stem}'`).test(f.src)
    )

    if (inRunbook || inPkg || inDocs || imported) continue
    if (SCRIPTS_PENDING_ARCHIVE[script]) {
      unreferenced.push(script)
      continue
    }
    fail({
      shape: 'script nothing references',
      subject: `apps/web/scripts/${script}`,
      detail:
        'No runbook step, no package.json script, no docs mention, and nothing imports it.',
      remedy:
        'Answer both questions in its header: which runbook step runs this, and what ends it. If the honest answer is "it was a one-off", move it to scripts/archive/ with its README row in the same PR.',
    })
  }

  for (const key of Object.keys(SCRIPTS_PENDING_ARCHIVE)) {
    if (!unreferenced.includes(key)) {
      staleHatches.push({ list: 'SCRIPTS_PENDING_ARCHIVE', key })
    }
  }

  return unreferenced.length
}

// ---------------------------------------------------------------------------
// Shape 6. A seeder that declares its own synonym table
//
// No escape hatch, deliberately. The hand-carry is what lost round 6 seven
// groups by round 7 and left round 11 missing twelve — and a lost group seeds a
// DUPLICATE species, which no later pass can undo.
// ---------------------------------------------------------------------------
function checkNoForkedSynonymTables(): void {
  for (const file of SOURCE_TS) {
    const name = basename(file)
    if (!name.startsWith('seed-')) continue
    const src = stripComments(read(file))
    if (/\b(?:const|let|var)\s+SYNONYM_GENERA\b/.test(src)) {
      fail({
        shape: 'seeder declares its own synonym table',
        subject: file,
        detail:
          'Declares SYNONYM_GENERA. Every fork of this table has lost groups from the one before it.',
        remedy:
          "Import { resolve, fetchCatalogIndex } from './species-resolver' and add any new genus group to the one table there. It is append-only.",
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Shapes 8-11. Write provenance
//
// A stamp says a value is certified. It does not say what produced it, and
// round membership cannot answer that either — repair passes write to rows
// seeded rounds earlier. run-provenance.ts records the invocation; these shapes
// are what stop it becoming another good pattern living in one file.
// ---------------------------------------------------------------------------
function checkWriteProvenance(): number {
  const stamps = new Set(stampColumns())
  const participating: string[] = []

  for (const file of SOURCE_TS) {
    const name = basename(file)
    if (name === 'run-provenance.ts') continue

    // A LIBRARY IS NOT AN INVOCATION. lib/plants-write.ts and lib/demo-garden.ts
    // perform writes, but a run belongs to the process that called them, so
    // flagging the library would demand a record from something with no
    // lifecycle. Provenance is per invocation, and invocations live in scripts/.
    if (!file.startsWith('apps/web/scripts/')) continue

    // A SEEDER ALREADY HAS ITS WRITE RECORD, and it is a better one: the round
    // manifest names every row the invocation inserted, by id. Seed values come
    // from Trefle rather than from a recipe, so there is no model or prompt to
    // record — membership provenance IS mutation provenance for an insert.
    if (name.startsWith('seed-')) continue

    // The trigger contract test writes and rolls back inside one transaction, so
    // it certifies nothing and leaves no value behind to explain.
    if (name === 'test-editorial-trigger.ts') continue

    const src = stripComments(read(file))

    // WHAT COUNTS AS NEEDING PROVENANCE: any invocation that MUTATES the
    // catalog. Not "contains a stamp column key" — the first version of this
    // check looked for that and missed curate-editorial, which assigns the stamp
    // onto a patch object, and curate-seasonal-care, which uses a shorthand
    // property. A detector that depends on how the patch literal is written
    // claims coverage it does not have, which is the exact shape this file
    // exists to catch. The unit of provenance is the invocation, so the question
    // is whether the script writes to the catalog at all.
    const touchesCatalog =
      /\.from\(\s*'(?:plants|plant_combinations)'\s*\)/.test(src) ||
      /from '\.\.\/lib\/plants-(?:db|write)'/.test(src)
    // A write delegated to the shared helper is still this invocation's write.
    // apply-image-reverts.ts, apply-image-confirmations.ts and set-plant-hero.ts
    // all call writePlant and contain no .update() of their own — a rule that
    // only looked for the query builder called all three clean.
    const delegatesWrite =
      /\b(?:writePlant|upsertPlant|patchPlant)\s*\(/.test(src) ||
      /from '\.\.\/lib\/plants-write'/.test(src)
    const mutates =
      /\.(?:update|upsert|insert|delete)\s*\(/.test(src) || delegatesWrite
    if (!touchesCatalog || !mutates) continue

    const opensRun = /\bbeginRun\s*\(|\bwithRunRecord\s*\(/.test(src)

    // Shape 8. Every stamp-writing step opens a run.
    if (!opensRun) {
      if (RUNS_WITHOUT_PROVENANCE[name]) {
        participating.push(name)
        continue
      }
      fail({
        shape: 'stamp write with no run record',
        subject: file,
        detail:
          'Writes a stamp column but never calls beginRun/withRunRecord, so the value it produces has no recoverable model, recipe or outcome.',
        remedy:
          'Open a run before the first write with a declared writeSet and a recipe, count each verified write, and finalise on every terminal path. curate-plants.ts is the worked example. Or record it in RUNS_WITHOUT_PROVENANCE with the reason.',
      })
      continue
    }

    // Shape 9. A declared write-set names real stamp columns, not guesses.
    for (const m of src.matchAll(/writeSet:\s*\[([^\]]*)\]/g)) {
      const declared = [...(m[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(
        (x) => x[1]!
      )
      if (!declared.length) {
        fail({
          shape: 'empty declared write-set',
          subject: file,
          detail: 'writeSet is empty, so the record claims to produce nothing.',
          remedy: 'Declare the columns this invocation may write.',
        })
      }
      for (const column of declared) {
        // is_curated is a real declared write that is not a stamp; allow the
        // known non-stamp value columns the pipeline writes deliberately, and
        // the tables a write-set may name instead of a column.
        if (
          stamps.has(column) ||
          NON_STAMP_WRITES.has(column) ||
          NON_COLUMN_WRITE_SETS.has(column)
        )
          continue
        fail({
          shape: 'declared write-set names an unknown column',
          subject: `${file} → ${column}`,
          detail:
            'No migration declares this stamp column, and it is not one of the recorded non-stamp writes.',
          remedy: `Fix the spelling, or add it to NON_STAMP_WRITES in ${basename(__filename)} if it is a deliberate value write.`,
        })
      }
    }

    // Shape 12. A CLEARING WRITE MUST NOT TAKE THE DEFAULT WITNESS.
    //
    // `defaultEvidence` gives every window-queryable write-set member a stamp
    // witness: count the rows whose stamp lands inside the run's window. That is
    // right for a column the run SETS and exactly wrong for one it CLEARS. A
    // nulled row holds NULL and matches no window, so a run that correctly
    // cleared 20 stamps observes 0 against a claim of 20 and records itself
    // CONTRADICTED — a correct run filing a report that says it was caught
    // lying. A clearing write is invisible to its own column by construction,
    // and no query run afterwards can tell "this run nulled it" from "it was
    // never set".
    //
    // Loud rather than silent, so it is not trap 1's shape. But a log nobody
    // trusts is a log nobody reads, and three of the nine round steps clear a
    // stamp as a cross-field cascade — this is a road already travelled three
    // times, not a hypothetical.
    //
    // WHAT THIS ASKS FOR is an explicit `evidence:`, not a particular witness.
    // Checking for a witness naming the column would tie the scan to how the
    // literal is written — cross-check-native-region and pick-plant-images both
    // build theirs through a helper — and a detector that depends on the shape
    // of a literal claims coverage it does not have, which is the mistake shape
    // 8 was rewritten to avoid. Once evidence is explicit, beginRun already
    // throws for an unwitnessed member, so the author cannot quietly do nothing.
    const declaredMembers = [
      ...src.matchAll(/writeSet:\s*\[([^\]]*)\]/g),
    ].flatMap((m) =>
      [...(m[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!)
    )
    const clearsOwnMember = declaredMembers.filter(
      (member) =>
        isWindowQueryable(member) &&
        new RegExp(`${member}\\s*[:=]\\s*null\\b`).test(src)
    )
    // `evidence:` OR the shorthand `evidence,` — cross-check-native-region
    // computes both fields together and spreads them in, and a check that only
    // knew the colon form would have called it a violation while it was doing
    // exactly the right thing.
    const passesEvidence = /\bevidence\s*[:,]/.test(src)
    if (clearsOwnMember.length && !passesEvidence) {
      fail({
        shape: 'clearing write left on the default witness',
        subject: `${file} → ${[...new Set(clearsOwnMember)].join(', ')}`,
        detail:
          'Sets a declared write-set member to null and passes no evidence, so the default gives that column a stamp witness. A cleared row matches no window, so the run would observe 0 against its own claim and record itself contradicted.',
        remedy:
          "Pass an explicit evidence array. A cleared stamp cannot witness itself: use { kind: 'row-touched' } on the table's own mutation timestamp, or { kind: 'none', reason } to record that the write is not observable at finalisation.",
      })
    }

    // Shape 10. withRunRecord is the canonical pattern, and this scan is why.
    //
    // WHAT THIS PROVES, EXACTLY: that a file opening a run with raw beginRun
    // contains an explicit finalisation call. It does NOT prove finalisation on
    // every control-flow path — that needs real analysis, and a scan claiming
    // otherwise would be the repository asserting a guarantee it cannot make.
    //
    // So the guarantee is moved into the code instead of the checker:
    // withRunRecord owns the terminal paths structurally. Raw beginRun is for a
    // script that genuinely needs to own them, and needs a recorded reason.
    if (/\bbeginRun\s*\(/.test(src)) {
      if (!RAW_BEGIN_RUN_ALLOWED[name]) {
        fail({
          shape: 'raw beginRun instead of withRunRecord',
          subject: file,
          detail:
            "Opens a run with beginRun. A scan can only see that a finish call exists somewhere in the file, not that it runs on every path, so this shape puts the guarantee in the author's hands.",
          remedy: `Wrap the body in withRunRecord, which finalises on return, on throw, and on run.markFailed(). If this script must own its terminal paths (resume logic, its own signal handling), record it in RAW_BEGIN_RUN_ALLOWED in ${basename(__filename)} with the reason.`,
        })
      } else if (!/\.finish\s*\(/.test(src)) {
        fail({
          shape: 'run opened with no finalisation call',
          subject: file,
          detail:
            'Calls beginRun and contains no finish call at all, so the invocation leaves stamps and no record — the gap the log exists to close.',
          remedy: 'Call run.finish(outcome), or use withRunRecord.',
        })
      }
    }
  }

  // Shape 11. row_count is observed, never authored.
  for (const file of SOURCE_TS) {
    if (basename(file) === 'run-provenance.ts') continue
    const src = stripComments(read(file))
    if (/row_count\s*:/.test(src)) {
      fail({
        shape: 'hand-authored row count',
        subject: file,
        detail:
          'Sets row_count directly. The count must come from what the run verified it wrote, not from a number someone typed.',
        remedy:
          'Call run.countWritten() at the write site and let the run record derive the count.',
      })
    }
  }

  for (const key of Object.keys(RAW_BEGIN_RUN_ALLOWED)) {
    const file = `apps/web/scripts/${key}`
    if (
      !SOURCE_TS.includes(file) ||
      !/\bbeginRun\s*\(/.test(stripComments(read(file)))
    ) {
      staleHatches.push({ list: 'RAW_BEGIN_RUN_ALLOWED', key })
    }
  }

  for (const key of Object.keys(RUNS_WITHOUT_PROVENANCE)) {
    if (!participating.includes(key)) {
      staleHatches.push({ list: 'RUNS_WITHOUT_PROVENANCE', key })
    }
  }

  return participating.length
}

/** Scripts allowed to own their own terminal paths instead of using withRunRecord. */
export const RAW_BEGIN_RUN_ALLOWED: Record<string, string> = {}

/**
 * Write-set entries that name a TABLE rather than a column.
 *
 * Kept apart from NON_STAMP_WRITES rather than folded into it, for the reason
 * run-provenance.ts gives at the `covers` field: a write-set member is "what was
 * mutated", and that is not always a column. curate-combinations inserts rows
 * into plant_combinations — there is no column to name, and no per-column
 * witness either, so it is witnessed by that table's own created_at. A checker
 * that accepted a table name out of the column list would be re-conflating the
 * two things the evidence split exists to keep separate.
 */
const NON_COLUMN_WRITE_SETS = new Set(['plant_combinations'])

/** Declared write-set entries that are real writes but not stamp columns. */
const NON_STAMP_WRITES = new Set([
  'is_curated',
  // The vision pass's verdict and its prose. Written together by the pick and
  // rewritten by --verify, which is why neither can be inferred from a stamp.
  'image_pick_confidence',
  'image_pick_reason',
  // Rewritten by the editorial pass, and only after a blind second call
  // approved the replacement.
  'description',
  'native_region',
  // The user-facing range phrase. Hand-owned, voice-passed copy: no guard drafts
  // it, and the only writer is an --apply pass working from a committed decision
  // file (cross-check-native-to, apply-native-to-fixes).
  'native_to',
  'seasonal_care',
  'image_url_curated',
  'image_attribution',
  'image_candidates',
  // The browse axes. Each is re-judged blind by its own repair pass, which
  // OVERWRITES rather than fills, so the value and its stamp move together in
  // one statement (curate-styles, curate-greenery).
  'style_tags',
  'is_greenery',
  // Fill-only, never overwritten: curate-greenery writes it on the subset of
  // rows that had none, which is why it takes a bounding witness and not a
  // confirming one.
  'foliage_color',
  // Editorial-owned state with a hardiness_verified flag rather than a
  // *_checked_at column beside it, so draft-hardiness writes no stamp at all.
  'hardiness_rating',
])

// ---------------------------------------------------------------------------
// Shape 13. Pagination hand-rolled instead of lib/paginate.ts
//
// Standing rule 5 exists because a bare read caps at 1000 rows in silence, and
// `fetchAllRows` is the one home for the loop. THE SIGNAL IS NOT `.range(`:
// nearly forty call sites use it, and almost all are the callback FetchAllRows
// takes, which is the correct pattern. Flagging those would have been thirty-odd
// false positives — a check that starts full of escape hatches teaches people to
// add more. The discriminator is a file that pages a table and never mentions
// `fetchAllRows` at all, which as of 2026-08-16 is exactly the two the audit
// named and nothing else.
// ---------------------------------------------------------------------------
function checkPagination(): number {
  const excused: string[] = []

  for (const file of SOURCE_TS) {
    const name = basename(file)
    if (file.endsWith('lib/paginate.ts')) continue
    const src = stripComments(read(file))
    if (!/\.range\s*\(/.test(src)) continue
    if (/\bfetchAllRows\b/.test(src)) continue

    if (HAND_ROLLED_PAGINATION[name]) {
      excused.push(name)
      continue
    }
    fail({
      shape: 'pagination hand-rolled (standing rule 5)',
      subject: file,
      detail:
        'Pages a table with its own .range() arithmetic and never calls fetchAllRows, so the cap-dodging loop lib/paginate.ts exists to be has been written again.',
      remedy: `Call fetchAllRows from lib/paginate.ts, ordered by id. If this read genuinely cannot use it, record it in HAND_ROLLED_PAGINATION in ${basename(__filename)} with the reason.`,
    })
  }

  for (const key of Object.keys(HAND_ROLLED_PAGINATION)) {
    if (!excused.includes(key)) {
      staleHatches.push({ list: 'HAND_ROLLED_PAGINATION', key })
    }
  }
  return excused.length
}

// ---------------------------------------------------------------------------
// Shape 17. A write conditioned on editorial state, hand-rolled
//
// THE SIGNAL IS THE PAIR, not either half. A declared prior-value field
// (`from` / `expect` / `expected` / `stored`) says the write is guarded against
// drift; a per-row branch on `is_curated` says it is conditioned on an editorial
// verdict. Either alone is common and usually fine — `cross-check-plants` has
// the first, `curate-plants` has the second — and flagging either alone put six
// false positives on the list when this was drafted. Together they are the shape
// `scripts/reviewed-mutation.ts` exists to hold, and as of 2026-08-17 they catch
// exactly the six the plan named and nothing else.
//
// WHY THIS SHAPE AT ALL. Trap 31: the copy in `curate-styles` did NOT read
// is_curated, so it re-tagged 86 rows, retired 86 verdicts inside the database
// and reported neither. Six near-identical copies of a guard is six places for
// the next omission to hide.
// ---------------------------------------------------------------------------
function checkReviewedMutation(): number {
  const excused: string[] = []
  const PRIOR_VALUE_FIELD = /^ +(from|expect|expected|stored)\??: /m
  const CURATED_BRANCH =
    /if \(!?[a-zA-Z]+([.]|\['|\.)is_curated'?\]?\)|if \([a-zA-Z]+\.curated\)|\.eq\('is_curated', false\)/

  for (const file of SOURCE_TS) {
    const name = basename(file)
    // The primitive and the provenance module are the machinery, not callers.
    if (name === 'reviewed-mutation.ts' || name === 'run-provenance.ts')
      continue
    const raw = read(file)
    // NOT stripComments: the drift-guard field is recognised by its declaration,
    // and three of the six declare it on a line that carries the explaining
    // comment. Stripping first would still match the declaration, but the
    // `stored`/`expect` spellings are only legible with the comment beside them.
    if (!/\.update\s*\(/.test(raw)) continue
    if (!PRIOR_VALUE_FIELD.test(raw)) continue
    if (!CURATED_BRANCH.test(raw)) continue
    if (/\bopenReviewedMutation\b/.test(raw)) continue

    if (HAND_ROLLED_REVIEWED_MUTATION[name]) {
      excused.push(name)
      continue
    }
    fail({
      shape: 'reviewed mutation hand-rolled',
      subject: file,
      detail:
        'Guards a write with a declared prior value AND branches on is_curated, which is the drift-guard-plus-verdict shape scripts/reviewed-mutation.ts holds. Trap 31 is what a copy of it missing the is_curated half costs.',
      remedy: `Write through openReviewedMutation from scripts/reviewed-mutation.ts. If this one genuinely cannot, record it in HAND_ROLLED_REVIEWED_MUTATION in ${basename(__filename)} with the reason.`,
    })
  }

  for (const key of Object.keys(HAND_ROLLED_REVIEWED_MUTATION)) {
    if (!excused.includes(key)) {
      staleHatches.push({ list: 'HAND_ROLLED_REVIEWED_MUTATION', key })
    }
  }
  return excused.length
}

// ---------------------------------------------------------------------------
// Shape 14. A recorded open finding must still be true
//
// The inverse of every check above: these fail when the defect is GONE. A
// finding that outlives its fix is how a dated report turns into a list nobody
// trusts, and an untrustworthy list is indistinguishable from an empty one.
// ---------------------------------------------------------------------------
function checkOpenFindings(): number {
  let open = 0
  for (const [id, finding] of Object.entries(OPEN_FINDINGS)) {
    if (!ALL.includes(finding.file)) {
      fail({
        shape: 'open finding points at a file that is gone',
        subject: id,
        detail: `Its witness reads ${finding.file}, which is not tracked.`,
        remedy: `If the file was archived or deleted, the finding went with it — delete the entry from OPEN_FINDINGS in ${basename(__filename)}.`,
      })
      continue
    }
    if (finding.witness.test(read(finding.file))) {
      open++
      continue
    }
    fail({
      shape: 'open finding no longer reproduces',
      subject: id,
      detail: `Its witness (${finding.witness}) no longer matches ${finding.file}, so the defect it records has been fixed.`,
      remedy: `Delete the entry from OPEN_FINDINGS in ${basename(__filename)}. The list only shrinks — an entry that outlives its fix is what makes a backlog stop being believed.`,
    })
  }
  return open
}

// ---------------------------------------------------------------------------
// Shape 15. A decision parked on a person must be dated, owned, and must rot
//
// WHAT WENT WRONG. `.claude/handoff.md` carried a paragraph beginning
// "**Waiting on Ana:**" that was copied WORD FOR WORD through six consecutive
// handoffs (4006b7e → a5301e2). On 2026-08-17 it was read back to her and
// three of its six items turned out never to have been hers: the `Cenolophium`
// region correction is a botanical fact question answerable against WCVP, and
// the rounds 1-6 editorial pass and the `modern` re-tag both contradict
// standing rule 6, which records HER OWN 2026-07-28 ruling that an agent owns
// the editorial pass. A fourth item, two round-12 photo holds, described rows
// that already had photographs. Nobody re-derived ownership because the
// paragraph read as settled: it had been there last time.
//
// WHY THE PROSE PARAGRAPH IS THE DEFECT, not the deferring. A comma-separated
// sentence has no items, so nothing can count them, date them, or ask who owes
// the answer. It is the same failure standing rule 14 names — a claim with no
// command behind it — applied to work instead of to numbers, and it is exactly
// what CLAUDE.md means by work remaining living in a document. The list form
// below is the whole fix: an item that must name its date and its owner is an
// item somebody has to think about again.
//
// THIS CHECK IS DESIGNED TO GO RED WITH NO CODE CHANGE. That is normally a
// smell and here it is the mechanism. A parked decision has a shelf life; when
// it expires CI stops the next PR and forces one of two things, both good — get
// the ruling, or route the item to its real home (the Notion Build Backlog for
// a product decision, standing rule 11's list for a deferred schema change).
// Routing removes it from this file, which is why there is deliberately NO
// escape hatch: a hatch here would be a way to park an item permanently, and
// permanently parked is the state this exists to prevent.
//
// THE THRESHOLD IS A ROUND, NOT A SPRINT. Rounds run every few days, so 14 days
// is long enough that a genuine deferral survives one and short enough that
// nothing survives two in silence. Ana's rule, 2026-08-17: raise it in the
// round that found it, especially the small things, rather than closing the
// round and leaving maintenance for a future session.
// ---------------------------------------------------------------------------
const HANDOFF = '.claude/handoff.md'
const PARKED_DECISION_MAX_DAYS = 14

/** `- (raised YYYY-MM-DD, Owner) the question` */
const PARKED_ITEM = /^-\s*\(raised (\d{4}-\d{2}-\d{2}),\s*([^)]+)\)\s*(\S.*)$/

function checkParkedDecisions(): number {
  if (!ALL.includes(HANDOFF)) return 0
  const src = read(HANDOFF)

  // The old shape, killed by name. Its whole problem was being unitemizable.
  const prose = src.match(/^.*\*\*(Waiting on|Blocked on)\b.*$/im)
  if (prose) {
    fail({
      shape: 'parked decisions written as prose',
      subject: HANDOFF,
      detail: `"${prose[0].trim().slice(0, 72)}…" is the paragraph form that was copied verbatim through six handoffs, three of whose items were never the named person's to decide.`,
      remedy:
        'Rewrite it as a "**Parked decisions.**" list, one `- (raised YYYY-MM-DD, Owner) the question` per line. An item that cannot be phrased as a question somebody owes an answer to is not parked, it is unrouted work.',
    })
    return 0
  }

  const start = src.search(/^\*\*Parked decisions\b/im)
  if (start === -1) return 0

  const today = new Date()
  let parked = 0

  // Two things this loop got wrong before it was watched, both of which made
  // it report ZERO while looking at a real item — the trap-19 shape, a check
  // that passes because it sees nothing rather than because nothing is wrong.
  // The lead-in paragraph wraps across lines, so the list does not start at
  // start + 1; and an item wraps too, so an indented line is a continuation
  // and not the end of the block.
  let seenItem = false
  for (const line of src.slice(start).split('\n').slice(1)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (!trimmed.startsWith('-')) {
      if (!seenItem) continue // still in the lead-in paragraph
      if (/^\s/.test(line)) continue // wrapped continuation of an item
      break // a new paragraph: the block is over
    }
    seenItem = true

    const item = PARKED_ITEM.exec(trimmed)
    if (!item) {
      fail({
        shape: 'parked decision is undated or unowned',
        subject: `${HANDOFF}: ${trimmed.slice(0, 60)}…`,
        detail:
          'Every parked item states when it was raised and who owes the answer. Without both, nobody can tell a fresh question from one that has been sitting for a month.',
        remedy:
          'Write it as `- (raised YYYY-MM-DD, Owner) the question`, dated when it was FIRST raised — not when this handoff was written, which is how an old item looks new.',
      })
      continue
    }

    const raised = item[1] ?? ''
    const owner = (item[2] ?? '').trim()
    const question = item[3] ?? ''
    const days = Math.floor(
      (today.getTime() - new Date(`${raised}T00:00:00Z`).getTime()) / 86_400_000
    )
    if (days > PARKED_DECISION_MAX_DAYS) {
      fail({
        shape: 'parked decision has gone stale',
        subject: `${HANDOFF}: ${question.slice(0, 60)}…`,
        detail: `Parked on ${owner} since ${raised}, ${days} days — past the ${PARKED_DECISION_MAX_DAYS}-day limit, so it has now outlived the round that raised it.`,
        remedy: `Ask ${owner} for the ruling now, or move it to its real home — the Notion Build Backlog for a product decision, standing rule 11's list for a deferred schema change — and delete the line. Re-dating it is not a resolution. First check the item is still ${owner}'s at all: three of the six that motivated this check were not.`,
      })
      continue
    }
    parked++
  }
  return parked
}

// ---------------------------------------------------------------------------
// Shape 16. A `forward` step whose data became visible.
//
// See FORWARD_STEP_WITNESSES above for what the classification claims and why
// the module half of the assertion exists.
// ---------------------------------------------------------------------------

/** Source lines with comment-only lines removed, so prose is not read as a read. */
function codeLines(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !(
        t.startsWith('//') ||
        t.startsWith('*') ||
        t.startsWith('/*') ||
        t.startsWith('*/')
      )
    })
    .join('\n')
}

function checkForwardStepsStayInvisible(): number {
  // Files a reader's page is built from. `server/` is included: a server action
  // is as capable of putting a value on screen as a component is.
  const APP_SURFACE = ALL.filter(
    (f) =>
      (f.startsWith('apps/web/app/') ||
        f.startsWith('apps/web/components/') ||
        f.startsWith('apps/web/hooks/') ||
        f.startsWith('apps/web/lib/') ||
        f.startsWith('apps/web/server/')) &&
      (f.endsWith('.ts') || f.endsWith('.tsx')) &&
      !f.endsWith('.test.ts') &&
      !f.endsWith('.test.tsx')
  )

  const forwardSteps = STEP_DEFS.filter((d) => d.obligation === 'forward')

  for (const def of forwardSteps) {
    const witness = FORWARD_STEP_WITNESSES[def.step]
    if (!witness) {
      fail({
        shape: 'forward step with no witness',
        subject: def.step,
        detail:
          'Declares obligation: "forward" — that rows predating it are done — with nothing naming how that would stop being true.',
        remedy: `Add an entry to FORWARD_STEP_WITNESSES in ${basename(__filename)} naming the columns that must stay unread and, if one exists, the module that would render them. A ruling with no mechanism is the 277-row ruling again.`,
      })
      continue
    }

    const allowed = new Set(witness.allowedIn ?? [])

    for (const file of APP_SURFACE) {
      if (allowed.has(file)) continue
      const code = codeLines(read(file))
      for (const col of witness.columns) {
        if (new RegExp(`\\b${col}\\b`).test(code)) {
          fail({
            shape: 'forward step is readable after all',
            subject: `${def.step} — ${col} read in ${file}`,
            detail:
              'A column this step is excused from backfilling is now read on a surface a user sees, so older rows are silently wrong rather than done.',
            remedy: `Either promote ${def.step} to obligation: "catalog" and backfill it, or, if this appearance is not a read, add ${file} to allowedIn.`,
          })
        }
      }
    }

    if (witness.module) {
      const stem = basename(witness.module).replace(/\.tsx?$/, '')
      const importers = APP_SURFACE.filter(
        (f) =>
          f !== witness.module &&
          new RegExp(`from '[^']*/${stem}'`).test(codeLines(read(f)))
      )
      if (importers.length > 0) {
        fail({
          shape: 'forward step is readable after all',
          subject: `${def.step} — ${witness.module} is imported by ${importers.join(', ')}`,
          detail:
            'The module that renders this step\'s data has an importer, so the parked feature is wired up and rows predating the step are no longer "done".',
          remedy: `Promote ${def.step} to obligation: "catalog", backfill it, and delete its FORWARD_STEP_WITNESSES entry.`,
        })
      }
    }
  }

  for (const step of Object.keys(FORWARD_STEP_WITNESSES)) {
    if (!forwardSteps.some((d) => d.step === step)) {
      staleHatches.push({ list: 'FORWARD_STEP_WITNESSES', key: step })
    }
  }

  return forwardSteps.length
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

checkUnreachablePredicates()
checkStampWriters()
checkStampSelectors()
const traps = checkTrapsPinned()
const pendingArchive = checkScriptReachability()
checkNoForkedSynonymTables()
const unwiredProvenance = checkWriteProvenance()
const handRolledPaging = checkPagination()
const handRolledMutation = checkReviewedMutation()
const openFindings = checkOpenFindings()
const parkedDecisions = checkParkedDecisions()
const forwardSteps = checkForwardStepsStayInvisible()
// Shape 7, runbook / registry drift, is round-rehearsal.test.ts. It imports
// RUNBOOK and the step registry, so it is a test, not a scan. Do not add it here.

for (const { list, key } of staleHatches) {
  fail({
    shape: 'stale escape hatch',
    subject: `${list}["${key}"]`,
    detail:
      'This entry no longer describes a violation, so it is now a licence nobody needs.',
    remedy: `Delete it from ${list} in ${basename(__filename)}. The lists are ratchets; they only shrink.`,
  })
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} pipeline invariant violation(s):\n`)
  for (const f of failures) {
    console.error(`  [${f.shape}]  ${f.subject}`)
    console.error(`    ${f.detail}`)
    console.error(`    → ${f.remedy}\n`)
  }
  process.exit(1)
}

console.log('✓ pipeline invariants hold. Remaining, all recorded with reasons:')
const row = (label: string, count: string, list: string) =>
  console.log(`    ${label.padEnd(24)}${count.padStart(8)}   (${list})`)
row('traps unpinned', `${traps.unpinned} of ${traps.total}`, 'TRAPS_NOT_PINNED')
row(
  'stamps with no writer',
  String(Object.keys(STAMPS_WITHOUT_WRITERS).length),
  'STAMPS_WITHOUT_WRITERS'
)
row(
  'report-only stamps',
  String(Object.keys(REPORT_ONLY_STAMPS).length),
  'REPORT_ONLY_STAMPS'
)
row(
  'scripts pending archive',
  String(pendingArchive),
  'SCRIPTS_PENDING_ARCHIVE'
)
row(
  'steps without provenance',
  String(unwiredProvenance),
  'RUNS_WITHOUT_PROVENANCE'
)
row('hand-rolled paging', String(handRolledPaging), 'HAND_ROLLED_PAGINATION')
row(
  'hand-rolled mutation',
  String(handRolledMutation),
  'HAND_ROLLED_REVIEWED_MUTATION'
)
row('open findings', String(openFindings), 'OPEN_FINDINGS')
row('parked decisions', String(parkedDecisions), HANDOFF)
row('forward-obligation steps', String(forwardSteps), 'FORWARD_STEP_WITNESSES')
console.log(
  '  Runbook and registry drift is checked by round-rehearsal.test.ts, not here.\n'
)
