/**
 * Standing rule 14, made executable. Run by `pnpm docs:claims` and CI.
 *
 * WHY THIS EXISTS. Rule 14 — "write the command, not the claim; the test is
 * tense, not topic" — is the rule against a doc asserting a state that rots. It
 * was itself an unchecked claim, and it failed twice in the observable record:
 *
 *   · `docs/database-log.md`'s trap prose said "Twenty-seven traps" when there
 *     were 28. The 2026-08-14 schema review found it and wrote it down.
 *   · Someone fixed the first number to "Twenty-nine" and left "all twenty-four
 *     descriptions" beside it. By 2026-08-16 there were 30 traps and the family
 *     table had never listed trap 24 at all, so the inventory a reader uses to
 *     find a trap was missing an entry and nothing said so.
 *
 * An audit found it, a person fixed half of it, and it was stale again in two
 * days. That is the whole argument for a scan: prose cannot notice the world
 * moving, and a rule asking people to notice is the same prose one level up.
 *
 * THE THREE CLASSES, AND WHICH ONE THIS OWNS. A sentence in the docs is one of:
 *
 *   · DERIVABLE — a count, an inventory, a step order. The repo can compute it,
 *     so a claim about it is checkable. THIS FILE.
 *   · AN ASSERTED NEGATIVE — "nothing writes X", "no script reads Y". Not
 *     computable from a number; it closes by becoming a ratchet entry in
 *     `check-pipeline-invariants.ts`, which fails when the negative stops
 *     holding. NOT THIS FILE, and a scan claiming to cover it would be lying.
 *   · REASONING — why a thing is shaped the way it is. Does not rot, stays prose.
 *
 * WHAT COUNTS AS LIVING PROSE. Everything tracked and markdown, minus three
 * kinds of file that are not claims about today:
 *
 *   · GENERATED (`catalog-state.md`, `round-runbook.md`) — already guarded by
 *     their own `git diff --exit-code` jobs. Checking them here would be a
 *     second home for one fact.
 *   · FROZEN (migrations, `rounds/<n>/`, dated reports) — a record of what was
 *     true on its date, never revised. Same FROZEN set as `check-doc-links.ts`.
 *   · `database-log.md` BELOW ITS `## Sessions` HEADING — the file says why at
 *     its top: "a dated session entry records what was true at that moment,
 *     which is an event, not a state". "Round 8 took the catalog 494 → 595"
 *     never goes stale. That is rule 14's own tense test, and this is the one
 *     place in the repo where it is structural enough to encode.
 *
 * `.claude/handoff.md` is deliberately NOT exempt. Its dated heading looks like
 * a record and is not one: the file describes what is in flight right now and is
 * rewritten every session, so "21 of 30 traps are unpinned" in it is a state
 * claim like any other. It is also the single most-read file at session start,
 * which makes it the worst place for a stale number.
 *
 * WHY A NUMBER MAY APPEAR IN PROSE AT ALL, given rule 14 says to delete the
 * prose answer where a status line prints it. The two-homes failure (trap family
 * C) is two homes and NO check. A restatement this file verifies has one home —
 * the counter — and an echo that cannot drift from it, because the echo fails CI
 * the day it does. Where the number carries no weight, delete it anyway; that is
 * cheaper than checking it and it is what happened to the trap prose above.
 *
 * WHAT A GREEN RUN DOES NOT MEAN. Only the counters below are checked. A doc can
 * still state a wrong number this file has no counter for, describe behaviour
 * that does not exist, or point a reader at a step that was reordered. Prose
 * about the catalog's contents is not checked here at all and must not be:
 * live catalog numbers have one home, `docs/catalog-state.md`, which is
 * generated.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from './token-source'

// Same FROZEN set as check-doc-links.ts, and for the same reason: an applied
// migration is history, an archived round report is one run's record, and a
// dated audit is one run's findings filed under the date it ran.
const FROZEN = [
  /^supabase\/migrations\//,
  /^apps\/web\/rounds\/\d+\//,
  /^docs\/[a-z-]+-\d{4}-\d{2}-\d{2}\.md$/,
]

/** Generated docs, guarded by their own diff jobs. */
const GENERATED = new Set(['docs/catalog-state.md', 'docs/round-runbook.md'])

interface Failure {
  where: string
  detail: string
  remedy: string
}

const failures: Failure[] = []
const fail = (f: Failure) => failures.push(f)

function trackedFiles(): string[] {
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
    .split('\0')
    .filter(Boolean)
}

const ALL = trackedFiles()
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8')

// ---------------------------------------------------------------------------
// The counters. Each is a fact the repo can compute from its own files.
// ---------------------------------------------------------------------------

const LOG = 'docs/database-log.md'

/** Trap numbers, in heading order. The heading is the trap's definition. */
function trapNumbers(): string[] {
  return [...read(LOG).matchAll(/^#### (\d+b?)\./gm)].map((m) => m[1]!)
}

/**
 * Traps with no test naming them in a test file's HEADER.
 *
 * Deliberately the same rule as `check-pipeline-invariants.ts` shape 4, and
 * deliberately recomputed rather than imported: that file runs its checks at
 * module scope, so importing it would run the whole suite as a side effect. The
 * duplication is a header comment's worth of risk, and the alternative — a
 * shared module — would separate each escape hatch from the check that reads it,
 * which is the property that makes those lists reviewable.
 */
function unpinnedTrapCount(): number {
  const pinned = new Set<string>()
  for (const file of ALL.filter(
    (f) => f.startsWith('apps/web/') && f.endsWith('.test.ts')
  )) {
    const src = read(file)
    const end = src.indexOf('*/')
    if (!src.trimStart().startsWith('/**') || end === -1) continue
    for (const m of src.slice(0, end).matchAll(/\btraps?\s+(\d+b?)\b/gi)) {
      pinned.add(m[1]!)
    }
  }
  return trapNumbers().filter((t) => !pinned.has(t)).length
}

function publicTables(): number {
  const names = new Set<string>()
  for (const file of ALL.filter(
    (f) => f.startsWith('supabase/migrations/') && f.endsWith('.sql')
  )) {
    for (const m of read(file)
      .toLowerCase()
      .matchAll(
        /create table\s+(?:if not exists\s+)?(?:public\.)?([a-z_]+)/g
      )) {
      names.add(m[1]!)
    }
  }
  return names.size
}

const liveScripts = () =>
  ALL.filter(
    (f) =>
      f.startsWith('apps/web/scripts/') &&
      f.endsWith('.ts') &&
      !f.endsWith('.test.ts') &&
      !f.includes('/archive/')
  ).length

const migrationCount = () =>
  ALL.filter((f) => f.startsWith('supabase/migrations/') && f.endsWith('.sql'))
    .length

const testFileCount = () =>
  ALL.filter((f) => f.startsWith('apps/web/') && f.endsWith('.test.ts')).length

/**
 * A counter, and the subsets of it prose is allowed to state.
 *
 * WHY THIS DOES NOT MATCH A BARE "N traps". The first version did, and on its
 * first run it produced nine false positives against two real findings. Every
 * false one was the same shape — "three scripts cite `apply-sun-widening`",
 * "the four scripts that still selected that way", "26 migrations" in a dated
 * observation — a count of a SUBSET, which is the ordinary way to write a
 * sentence and says nothing about the population. `N <plural>` cannot separate
 * "there are N of them" from "N of them did something", because the difference
 * is the verb.
 *
 * Shipping that would have meant nine escape hatches on day one, and a ratchet
 * that starts full is a ratchet people learn to add to. So a claim is only read
 * as a TOTAL when the sentence marks it as one — the forms in TOTAL_FORMS
 * below. That is a convention the docs have to follow to get the check, and it
 * is stated in the failure message so the next person meets it at the moment it
 * matters.
 *
 * WHAT THIS GIVES UP, SAID PLAINLY: an unmarked total still slips through.
 * "Twenty-nine traps are really four shapes" — the sentence that rotted twice —
 * is exactly that shape, and the honest fix was to delete its number rather than
 * to widen a pattern until it guessed. The load for traps is carried by the
 * partition check below, which needs no pattern at all.
 */
interface Counter {
  /** What a stated total would have to equal. */
  actual: () => number
  /** Plural nouns that name this population. */
  nouns: string[]
  /** Where the real number lives, for the failure message. */
  home: string
  /**
   * Subsets the repo can also compute, keyed by a word that must appear on the
   * same line. Read from the `N of M` form, where N is the subset and M the
   * total — the one phrasing that is unambiguous without a marker, because
   * "N of M" asserts M is the whole of something.
   */
  subsets?: Record<string, () => number>
}

const COUNTERS: Record<string, Counter> = {
  traps: {
    actual: () => trapNumbers().length,
    nouns: ['traps'],
    home: `the \`#### N.\` headings in ${LOG}`,
    // The handoff states this every session and it is the first number a new
    // session reads. It has already been wrong once: commit d7842f9 is a
    // hand-fix of the denominator, found by a person and not by anything here.
    subsets: {
      unpinned: unpinnedTrapCount,
      pinned: () => trapNumbers().length - unpinnedTrapCount(),
    },
  },
  tables: {
    actual: publicTables,
    nouns: ['tables'],
    home: 'create table statements in supabase/migrations/',
  },
  migrations: {
    actual: migrationCount,
    nouns: ['migrations'],
    home: 'supabase/migrations/',
  },
  scripts: {
    actual: liveScripts,
    nouns: ['scripts'],
    home: 'apps/web/scripts/, excluding archive/ and tests',
  },
  tests: {
    actual: testFileCount,
    nouns: ['test files'],
    home: 'apps/web/**/*.test.ts',
  },
}

// ---------------------------------------------------------------------------
// Number words, because the prose uses them
//
// "Twenty-nine traps" is the claim that actually rotted, so a digits-only scan
// would have watched the exact sentence it exists for and said nothing.
// ---------------------------------------------------------------------------

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

/** A number word, or null if the token is an ordinary word. */
function wordToNumber(raw: string): number | null {
  const word = raw.toLowerCase()
  if (/^\d+$/.test(word)) return Number(word)
  if (UNITS[word] !== undefined) return UNITS[word]!
  if (TENS[word] !== undefined) return TENS[word]!
  const [tens, units] = word.split('-')
  if (tens && units && TENS[tens] !== undefined && UNITS[units] !== undefined) {
    return TENS[tens]! + UNITS[units]!
  }
  return null
}

const NUMBER = String.raw`([A-Za-z][A-Za-z-]*|\d+)`

// ---------------------------------------------------------------------------
// Check A. A restated count must equal the counter
// ---------------------------------------------------------------------------

/**
 * The phrasings that can only mean "this is the whole population".
 *
 * `%N` is the number, `%W` the noun. Anything not in this list is read as a
 * subset count and left alone — see the Counter comment for why that
 * concession is deliberate rather than a gap someone forgot to close.
 */
const TOTAL_FORMS = [
  String.raw`\ball\s+(?:of\s+)?(?:the\s+)?%N\s+%W\b`,
  String.raw`\bthere\s+are\s+%N\s+%W\b`,
  String.raw`\ba\s+total\s+of\s+%N\s+%W\b`,
  String.raw`\b%N\s+%W\s+in\s+total\b`,
]

function checkCounts(relPath: string, lines: string[]): void {
  for (const [name, counter] of Object.entries(COUNTERS)) {
    const actual = counter.actual()
    for (const noun of counter.nouns) {
      // replaceAll, not replace: the `N of M` form carries two `%N`, and
      // String.replace with a STRING pattern substitutes only the first. That
      // left the second one literal, so the regex looked for the characters
      // "%N" and the subset check silently matched nothing. It passed a green
      // run against a handoff whose denominator had been hand-corrected two
      // commits earlier — trap 19, in the file written to enforce against it,
      // found by mutating the doc rather than by rereading the code.
      const build = (form: string) =>
        new RegExp(form.replaceAll('%N', NUMBER).replaceAll('%W', noun), 'gi')
      const totals = TOTAL_FORMS.map(build)
      // "N of M <noun>" asserts M is the whole of something by construction, so
      // it needs no marker. N is checked only when the line names a subset the
      // repo can compute; otherwise it is somebody's own tally and not ours.
      const ofForm = build(String.raw`\b%N\s+of\s+%N\s+%W\b`)

      lines.forEach((line, i) => {
        const where = `${relPath}:${i + 1}`

        for (const re of totals) {
          for (const m of line.matchAll(re)) {
            const stated = wordToNumber(m[1]!)
            if (stated === null || stated === actual) continue
            fail({
              where,
              detail: `"${m[0].trim()}" — there are ${actual} ${noun}, not ${stated}.`,
              remedy: `The count lives in ${counter.home}. Correct it, or drop the number (rule 14: ${name} is derivable, so prose restating it is a second home for one fact).`,
            })
          }
        }

        for (const m of line.matchAll(ofForm)) {
          const total = wordToNumber(m[2]!)
          if (total !== null && total !== actual) {
            fail({
              where,
              detail: `"${m[0].trim()}" — there are ${actual} ${noun}, not ${total}.`,
              remedy: `The count lives in ${counter.home}. Correct the denominator, or drop the number.`,
            })
          }
          const stated = wordToNumber(m[1]!)
          if (stated === null) continue
          for (const [word, count] of Object.entries(counter.subsets ?? {})) {
            if (!new RegExp(`\\b${word}\\b`, 'i').test(line)) continue
            const real = count()
            if (stated === real) continue
            fail({
              where,
              detail: `"${m[0].trim()}" on a line about ${word} ${noun} — ${real} are ${word}, not ${stated}.`,
              remedy: `\`pnpm invariants:check\` prints this number on every green run. Take it from there, or drop the sentence and cite the command.`,
            })
          }
        }
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Check B. The trap family table is a partition of the traps
//
// The table is how a reader finds a trap by shape, so a trap missing from it is
// invisible to the only index the file has. Trap 24 was missing from 2026-07-30
// until this check was written: it has a full entry in family B's section and
// appears in no row of the table above it. A count alone would not have caught
// that — 24 went missing in the same edit that added another trap.
// ---------------------------------------------------------------------------

function checkTrapFamilies(): void {
  const log = read(LOG)
  const listed = new Map<string, string>()

  for (const m of log.matchAll(
    /^\|\s*\*\*([A-D])\*\*\s*\|[^|]*\|\s*([\d,\sb]+?)\s*\|/gm
  )) {
    const family = m[1]!
    for (const trap of m[2]!.split(',').map((s) => s.trim())) {
      if (!trap) continue
      const already = listed.get(trap)
      if (already && already !== family) {
        fail({
          where: LOG,
          detail: `trap ${trap} is listed in both family ${already} and family ${family}.`,
          remedy:
            'A trap has exactly one shape. Pick the family whose rule actually describes it and remove the other row entry.',
        })
      }
      listed.set(trap, family)
    }
  }

  if (listed.size === 0) {
    fail({
      where: LOG,
      detail:
        'the trap family table parsed as empty, so this check is silently passing.',
      remedy:
        'The table rows are `| **A** | <rule> | 1, 1b, 10 |`. If the shape changed, update the pattern in check-doc-claims.ts rather than leaving a check that cannot fail (trap 19).',
    })
    return
  }

  const defined = trapNumbers()
  for (const trap of defined) {
    if (!listed.has(trap)) {
      fail({
        where: LOG,
        detail: `trap ${trap} has a \`#### ${trap}.\` entry but appears in no family row.`,
        remedy:
          "Add it to the family whose rule describes it. The table is the file's only index by shape, so a trap missing from it is one a reader looking for that shape will not find.",
      })
    }
  }
  for (const trap of listed.keys()) {
    if (!defined.includes(trap)) {
      fail({
        where: LOG,
        detail: `the family table lists trap ${trap}, which has no \`#### ${trap}.\` entry.`,
        remedy:
          'Trap numbers are permanent IDs and are never reused. Either the entry was deleted (it should have been struck and annotated instead, standing rule 13) or the number is a typo.',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Check C. The handoff is at least as new as the log
//
// Both are written at session end, so the log holding a session the handoff has
// never heard of means the handoff was not rewritten. This is the one question
// prose genuinely cannot answer about itself: an empty next-steps list and an
// abandoned file read identically, and the difference is the whole reason
// nobody trusts the backlog.
//
// One-directional on purpose. A docs-only session rewrites the handoff and
// writes no log entry (standing rule 9 asks for one for DATABASE work), so a
// handoff NEWER than the log is the normal state and not a finding.
// ---------------------------------------------------------------------------

const HANDOFF = '.claude/handoff.md'

/** The newest `YYYY-MM-DD` in a heading, or null if the file has none. */
function newestHeadingDate(relPath: string): string | null {
  const dates = [...read(relPath).matchAll(/^#{2,3}\s+(\d{4}-\d{2}-\d{2})\b/gm)]
    .map((m) => m[1]!)
    .sort()
  return dates.length ? dates[dates.length - 1]! : null
}

function checkHandoffFreshness(): void {
  if (!ALL.includes(HANDOFF)) return
  const handoffDate = newestHeadingDate(HANDOFF)
  const logDate = newestHeadingDate(LOG)
  if (!handoffDate) {
    fail({
      where: HANDOFF,
      detail: 'no dated `## YYYY-MM-DD` heading, so its age cannot be read.',
      remedy:
        'Head the entry with its date. Without one, a reader cannot tell a finished backlog from an abandoned file.',
    })
    return
  }
  if (logDate && handoffDate < logDate) {
    fail({
      where: HANDOFF,
      detail: `newest entry is ${handoffDate}, but ${LOG} records a session on ${logDate}.`,
      remedy:
        'Rewrite the handoff for the session that wrote that log entry. A handoff older than the log is not "no next steps", it is a file nobody updated — and every session reads it first.',
    })
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const livingDocs = ALL.filter(
  (f) =>
    f.endsWith('.md') &&
    !GENERATED.has(f) &&
    !FROZEN.some((re) => re.test(f)) &&
    !f.includes('node_modules/')
)

for (const relPath of livingDocs) {
  const lines = read(relPath).split('\n')
  // database-log.md's session entries are event records by the file's own rule.
  const sessions =
    relPath === LOG ? lines.findIndex((l) => /^## Sessions/.test(l)) : -1
  const until = sessions === -1 ? lines.length : sessions
  checkCounts(relPath, lines.slice(0, until))
}

checkTrapFamilies()
checkHandoffFreshness()

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} stale doc claim(s):\n`)
  for (const f of failures) {
    console.error(`  ${f.where}`)
    console.error(`    ${f.detail}`)
    console.error(`    → ${f.remedy}\n`)
  }
  console.error(
    'Standing rule 14: write the command, not the claim. A derivable number\n' +
      'belongs to whatever computes it; prose may echo one only while this check\n' +
      'holds the echo to it.\n'
  )
  process.exit(1)
}

console.log('✓ every checked doc claim matches what the repo computes:')
for (const [name, counter] of Object.entries(COUNTERS)) {
  console.log(`    ${name.padEnd(12)}${String(counter.actual()).padStart(5)}`)
}
console.log(
  `    ${'traps unpinned'.padEnd(12)}${String(unpinnedTrapCount()).padStart(5)}   (invariants:check owns the backlog)`
)
console.log(
  '  Asserted negatives ("nothing writes X") are not checkable here — they\n' +
    '  close by becoming a ratchet entry in check-pipeline-invariants.ts.\n'
)
