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
 * Shape 1. Places a not-null column is compared to null, allowed on inspection.
 * A comparison against an AI RESPONSE field is not the trap-26 shape: the
 * response is parsed JSON where the key really can be absent.
 */
export const NULL_COMPARISONS_ALLOWED: Record<string, string> = {}

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
      /add column\s+(?:if not exists\s+)?([a-z_]+_(?:checked|verified|reviewed|drafted)_at)\b/g
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
    // A WRITE is the column as an object key whose value is a timestamp or an
    // explicit null (clearing a stamp is a write). `x: row.x` is a read-through
    // into a report row, which is what native_to_reviewed_at has and why it
    // looked written for months.
    const writeRe = new RegExp(
      `${stamp}\\s*:\\s*(?:new Date\\(|null\\b|[\\w.]*(?:nowIso|timestamp|stampedAt|isoNow)\\b)`,
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
// Run
// ---------------------------------------------------------------------------

checkUnreachablePredicates()
checkStampWriters()
checkStampSelectors()
const traps = checkTrapsPinned()
const pendingArchive = checkScriptReachability()
checkNoForkedSynonymTables()
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
console.log(
  '  Runbook and registry drift is checked by round-rehearsal.test.ts, not here.\n'
)
