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
import {
  listTestFiles,
  trapNumbers as trapNumbersOf,
  unpinnedTraps,
} from './trap-pins'

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
const trapNumbers = (): string[] => trapNumbersOf(read(LOG))

/**
 * Traps with no test naming them in a test file's HEADER.
 *
 * The rule lives in `trap-pins.ts` and is IMPORTED rather than recopied, which
 * it was until 2026-08-17. `check-pipeline-invariants.ts` shape 4 asks the same
 * question and reads the same module, so the two counts cannot drift apart —
 * they did, printing 20 against 21, which is what moved the derivation out.
 * Only the derivation moved: each script's escape-hatch list stays beside the
 * check that reads it.
 */
const unpinnedTrapCount = (): number =>
  unpinnedTraps(read(LOG), listTestFiles(REPO_ROOT).map(read)).length

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
// Checks D-G. Named things a doc points at, which either exist or do not
//
// These are the current-state claims with a witness that cannot be argued with:
// a path, a package.json key, a trap heading, a set of env keys. All four shipped
// green — no violation existed on 2026-08-16 — so none of them is here to fix
// something. They are here because each guards a rename or a move that is
// already scheduled: the graveyard pass moves three scripts to archive/, and
// rule 14 tells people to write commands, which makes a renamed script a
// silently wrong instruction in every doc that cites it.
//
// REJECTED, so nobody re-proposes it: checking cited MIGRATION VERSIONS. Eleven
// cited versions do not exist as files, and every one is legitimate — trap 13's
// reconciliation table is deliberately a list of local versions that were WRONG
// and got renamed (`20260729120000`→`20260729101133`), and the rest are
// migration-drift.test.ts fixtures. Eleven false positives against zero findings
// is the same trade the bare `N <plural>` count check failed.
// ---------------------------------------------------------------------------

/** Every fenced block and inline code span in a markdown file, as text. */
function codeSpans(text: string): string[] {
  const out: string[] = []
  let inFence = false
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    for (const m of line.matchAll(/`([^`]+)`/g)) out.push(m[1]!)
  }
  return out
}

/**
 * Check D. A `scripts/<name>.ts` a doc points at exists at that exact path.
 *
 * Exact, so `scripts/foo.ts` fails once foo moves to `scripts/archive/foo.ts`.
 * That strictness is the point: the archival pass is queued in
 * SCRIPTS_PENDING_ARCHIVE, and the docs citing those three are what goes stale
 * the day it runs.
 */
function checkScriptPaths(relPath: string, lines: string[]): void {
  lines.forEach((line, i) => {
    for (const m of line.matchAll(
      /\b(?:apps\/web\/)?(scripts\/(?:archive\/)?[a-z0-9-]+\.ts)\b/g
    )) {
      const rel = `apps/web/${m[1]!}`
      if (ALL.includes(rel)) continue
      fail({
        where: `${relPath}:${i + 1}`,
        detail: `points at \`${m[0]}\`, which is not a tracked file.`,
        remedy:
          'Correct the path. If the script was archived, cite `scripts/archive/<name>.ts` — the old path is now wrong, not merely shorter.',
      })
    }
  })
}

/** pnpm's own subcommands, which are not scripts in any package.json. */
const PNPM_BUILTINS = new Set([
  'install',
  'add',
  'remove',
  'update',
  'run',
  'exec',
  'dlx',
  'why',
  'init',
  'store',
  'prune',
  'audit',
  'rebuild',
  'import',
  'link',
  'unlink',
  'outdated',
  'list',
  'ls',
  'config',
  'dedupe',
  'fetch',
  'create',
  'publish',
  'setup',
  'env',
  'patch',
  'deploy',
  'licenses',
])

function definedScripts(): Set<string> {
  const names = new Set<string>()
  for (const pkg of ALL.filter((f) => f.endsWith('package.json'))) {
    if (pkg.includes('node_modules/')) continue
    try {
      const scripts = JSON.parse(read(pkg)).scripts ?? {}
      for (const key of Object.keys(scripts)) names.add(key)
    } catch {
      // A package.json that does not parse is someone else's failure.
    }
  }
  return names
}

/**
 * Check E. A `pnpm <script>` a doc tells you to run exists.
 *
 * TWO CONDITIONS, because one was not enough. It must be inside a code span or
 * fence — prose says "Turborepo + pnpm workspaces" and "pnpm with workspaces",
 * which a bare pattern reads as commands that do not exist. AND it must be in
 * command position: at the start, or after a shell operator. Formatting alone
 * still let through `# pnpm workspace config`, a comment annotating
 * `pnpm-workspace.yaml` in README's directory tree — inside a fence, and not an
 * instruction. A thing you are told to run starts a command.
 */
function checkCommands(
  relPath: string,
  text: string,
  scripts: Set<string>
): void {
  for (const span of codeSpans(text)) {
    for (const m of span.matchAll(
      /(?:^|[;&|]\s*|\$\s+)pnpm\s+(?:(?:--filter|-F|-r|-w|--dir|-C)\s+\S+\s+)*([a-z][\w:-]*)/gm
    )) {
      const name = m[1]!
      if (PNPM_BUILTINS.has(name) || scripts.has(name)) continue
      fail({
        where: relPath,
        detail: `\`pnpm ${name}\` is not a script in any package.json, and not a pnpm subcommand.`,
        remedy:
          'Correct the name, or add the script. Rule 14 asks for the command rather than the claim, which only helps while the command is real.',
      })
    }
  }
}

/**
 * Check F. A cited trap number has an entry.
 *
 * Trap numbers are permanent IDs cited from prose AND from code comments, so a
 * citation that resolves to nothing is a reader sent to a heading that is not
 * there. Numbers are bounded to two digits so that "traps 3 and 26 (2026-08-14)"
 * cannot swallow the year.
 */
function checkTrapCitations(relPath: string, lines: string[]): void {
  const defined = new Set(trapNumbers())
  lines.forEach((line, i) => {
    for (const m of line.matchAll(
      /\btraps?\s+(\d{1,2}b?(?:\s*,\s*\d{1,2}b?)*(?:\s+and\s+\d{1,2}b?)?)/gi
    )) {
      for (const cited of m[1]!.split(/\s*,\s*|\s+and\s+/)) {
        const trap = cited.trim().toLowerCase()
        if (!trap || defined.has(trap)) continue
        fail({
          where: `${relPath}:${i + 1}`,
          detail: `cites trap ${trap}, which has no \`#### ${trap}.\` entry in ${LOG}.`,
          remedy:
            'Trap numbers are permanent IDs, never renumbered and never reused. Either the number is a typo, or the entry it names was removed rather than struck and annotated (standing rule 13).',
        })
      }
    }
  })
}

/**
 * Check G. An env-var block in a doc matches `.env.example`.
 *
 * A second copy of an inventory, which is trap family C exactly. A fence counts
 * as one when it holds at least three `KEY=` lines and at least one of them is a
 * real key, so an ordinary shell fence with `FOO=bar` in it cannot trigger this.
 */
const ENV_EXAMPLE = 'apps/web/.env.example'

function checkEnvInventory(relPath: string, text: string): void {
  if (!ALL.includes(ENV_EXAMPLE)) return
  const real = new Set(
    [...read(ENV_EXAMPLE).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!)
  )
  if (real.size === 0) return

  let inFence = false
  let fence: string[] = []
  const fences: string[][] = []
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      if (inFence) fences.push(fence)
      inFence = !inFence
      fence = []
      continue
    }
    if (inFence) fence.push(line)
  }

  for (const block of fences) {
    const keys = block
      .map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter((k): k is string => Boolean(k))
    if (keys.length < 3 || !keys.some((k) => real.has(k))) continue

    const missing = [...real].filter((k) => !keys.includes(k))
    const extra = keys.filter((k) => !real.has(k))
    if (!missing.length && !extra.length) continue
    fail({
      where: relPath,
      detail:
        `its environment block disagrees with ${ENV_EXAMPLE}` +
        (missing.length ? ` — missing ${missing.join(', ')}` : '') +
        (extra.length ? ` — has ${extra.join(', ')}, which is not there` : '') +
        '.',
      remedy: `${ENV_EXAMPLE} is the one home for this list. Match it, or delete the block and link to the file.`,
    })
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

const scripts = definedScripts()

for (const relPath of livingDocs) {
  const text = read(relPath)
  const lines = text.split('\n')
  // database-log.md's session entries are event records by the file's own rule.
  const sessions =
    relPath === LOG ? lines.findIndex((l) => /^## Sessions/.test(l)) : -1
  const until = sessions === -1 ? lines.length : sessions

  // COUNTS stop at the Sessions heading; a dated entry records an event.
  checkCounts(relPath, lines.slice(0, until))

  // The rest do NOT stop there, and the difference is the tense test doing its
  // job. "Round 8 took the catalog 494 → 595" stays true forever, but a session
  // entry pointing at `scripts/foo.ts` is pointing at a file that either exists
  // now or does not — a reference is not a claim about a moment.
  checkScriptPaths(relPath, lines)
  checkTrapCitations(relPath, lines)
  checkCommands(relPath, text, scripts)
  checkEnvInventory(relPath, text)
}

// Trap numbers are cited from code as well as from prose — database-log.md's own
// header says so — and a comment pointing at a heading that is not there is the
// same broken reference wherever it lives.
for (const relPath of ALL.filter(
  (f) =>
    f.startsWith('apps/web/') &&
    f.endsWith('.ts') &&
    !f.includes('node_modules/')
)) {
  checkTrapCitations(relPath, read(relPath).split('\n'))
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
  '  and every cited script path, pnpm command, trap number and env key resolves.'
)
console.log(
  '\n  Asserted negatives ("nothing writes X") are not checkable here — they\n' +
    '  close by becoming a ratchet entry in check-pipeline-invariants.ts.\n'
)
