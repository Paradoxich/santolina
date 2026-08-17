import { execFileSync } from 'node:child_process'

/**
 * Which traps are pinned by a test, computed once for the two checks that ask.
 *
 * WHY THIS IS A MODULE AND NOT A COPY IN EACH SCRIPT. `check-doc-claims.ts` and
 * `check-pipeline-invariants.ts` both need the unpinned-trap count, and until
 * 2026-08-17 each computed it from its own copy of the rule. The copies were
 * deliberate — the comment in `check-doc-claims.ts` explained that importing
 * the other file would run its whole suite as a side effect, which is true —
 * but the cost is that the two numbers can differ with nothing failing, and
 * during that session they printed 20 against 21. A count with two homes is
 * standing rule 14's defect in its plainest form.
 *
 * What that argument actually protected is the ESCAPE-HATCH LISTS, and those do
 * not move: `TRAPS_NOT_PINNED` stays next to the check that reads it, where it
 * is reviewable. Only the derivation moves here, and it is pure — it takes
 * sources as strings and touches no filesystem, so importing it runs nothing.
 *
 * AND THE FILE LIST HAD TO MOVE TOO — see `listTestFiles`. Sharing only the
 * derivation left the two checks still able to disagree, which they promptly
 * did, because they were listing different files to run it over.
 *
 * THE HEADER RULE IS THE WHOLE SUBTLETY. A trap is pinned when a test file's
 * LEADING BLOCK COMMENT names it, not when the number appears somewhere in the
 * file. A header is a claim about what the file is for; a number mentioned
 * inside a case is a useful cross-reference and not a closure.
 * `wcvp-lookup.test.ts` names trap 15 inside a case and is the live example.
 */

/**
 * The test files both checks count pins from, listed the SAME way.
 *
 * SHARING THE DERIVATION WAS NOT ENOUGH, and finding that out is what this
 * function is. With both checks calling `unpinnedTraps`, they still printed 21
 * against 20 — because they built their file lists differently:
 * `check-doc-claims.ts` lists `--cached --others --exclude-standard`, which
 * INCLUDES a new test file that is not committed yet, and
 * `check-pipeline-invariants.ts` lists tracked files only. Write a test whose
 * header names a trap, run both before committing, and they disagree. That is
 * almost certainly the original 2026-08-17 incident, which happened while new
 * test files were being written.
 *
 * UNTRACKED-INCLUSIVE IS THE RIGHT SET, because the question is "does a test
 * name this trap", and a test you just wrote does. Reporting a trap as unpinned
 * until its test is committed would make the number depend on git state rather
 * than on the repo's contents.
 *
 * This is the one impure function here, and it runs only when CALLED — so
 * importing this module still runs nothing, which is why the rest of it moved.
 */
export function listTestFiles(repoRoot: string): string[] {
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
    .split('\0')
    .filter((f) => f.startsWith('apps/web/') && f.endsWith('.test.ts'))
}

/** Trap numbers in `docs/database-log.md`, in heading order. */
export function trapNumbers(logSrc: string): string[] {
  return [...logSrc.matchAll(/^#### (\d+b?)\./gm)].map((m) => m[1]!)
}

/**
 * Trap numbers a test file's LEADING block comment CLAIMS TO PIN.
 *
 * A file whose first non-whitespace is not `/**`, or whose block comment never
 * closes, contributes nothing — it has no header to make a claim in.
 *
 * A MENTION IS NOT A PIN, and the difference is the whole of this function.
 * Until 2026-08-17 any `trap N` anywhere in a header counted, so a header
 * explaining its reasoning — "this is trap 4's shape", "the same argument that
 * produced species-resolver.ts (trap 7)" — silently CLOSED a trap nothing
 * tested. That is the worst direction for this check to be wrong in: an
 * untested trap reads as covered and leaves the backlog. It fired three times
 * in one session, once in the very file written to stop it.
 *
 * So the citation must say so. The marker word `pin`/`pins`/`pinned` has to
 * appear in the SAME SENTENCE as the number, which is what the convention
 * already looked like — `Pins TRAP 32 — …`, `Trap 24, pinned: …`,
 * `Traps 7 and 27, pinned: …`. Sentence-scoped rather than header-scoped for
 * the obvious reason: a header that pins trap 31 and mentions trap 4 in its
 * third paragraph must pin only 31.
 */
export function pinnedTraps(testSources: string[]): Set<string> {
  const pinned = new Set<string>()
  for (const src of testSources) {
    const end = src.indexOf('*/')
    if (!src.trimStart().startsWith('/**') || end === -1) continue
    for (const sentence of splitSentences(src.slice(0, end))) {
      if (!PIN_MARKER.test(sentence)) continue
      for (const m of sentence.matchAll(TRAP_CITATION)) {
        // A LIST cites every number in it. "Traps 7 and 27" pins both, which
        // the single-number rule this replaces did not — it pinned 7 and
        // dropped 27, so a trap with a real test could sit in TRAPS_NOT_PINNED
        // behind an invented reason. species-resolver.test.ts is that header.
        for (const n of m[1]!.matchAll(/\d+b?/g)) pinned.add(n[0])
      }
    }
  }
  return pinned
}

/**
 * Sentences of a block comment, with the comment furniture stripped.
 *
 * Split on `.`, `?`, `!` and on a BLANK COMMENT LINE — a paragraph break ends a
 * sentence even when a heading like "WHAT THIS ASSERTS" carries no full stop,
 * and without it one unpunctuated heading would join two paragraphs and leak a
 * marker across them. Em dashes and colons deliberately do NOT split: `Pins
 * TRAP 32 — a generated file is invisible` is one claim.
 */
function splitSentences(header: string): string[] {
  return header
    .replace(/^[ \t]*\*[ \t]?/gm, '')
    .split(/(?<=[.?!])\s+|\n[ \t]*\n/)
    .filter((s) => s.trim())
}

/** `pins`, `pinned`, `Pin` — the word that turns a mention into a claim. */
const PIN_MARKER = /\bpin(s|ned|ning)?\b/i

/**
 * `trap 24`, `traps 3, 24 and 26`, `traps 7 and 27` — the citation and the
 * whole list after it. Bounded to digits, separators and the words that join
 * them, so it stops at the end of the list rather than running into prose.
 */
const TRAP_CITATION = /\btraps?\s+(\d+b?(?:\s*(?:,|and|&)\s*\d+b?)*)/gi

/** Traps in the log that no test header names, in heading order. */
export function unpinnedTraps(logSrc: string, testSources: string[]): string[] {
  const pinned = pinnedTraps(testSources)
  return trapNumbers(logSrc).filter((t) => !pinned.has(t))
}
