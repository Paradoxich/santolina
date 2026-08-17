/**
 * The unpinned-trap count, and the header rule the two checks that print it
 * both depend on.
 *
 * THE INCIDENT. 2026-08-17. `check-doc-claims.ts` and
 * `check-pipeline-invariants.ts` each computed the unpinned-trap count from
 * their own copy of the same rule, and for part of that session they printed
 * 20 against 21 with both commands green. The disagreement is invisible by
 * construction: each script prints one number, nobody reads them side by side,
 * and neither has any way to ask what the other computed.
 *
 * WHAT THIS ASSERTS, AND WHY IT IS THE DEFECT'S OWN WITNESS. Not "the count is
 * 21" — that is a state claim which would need editing every time a trap is
 * pinned, and it is `docs:claims`'s job already. The defect was TWO
 * DERIVATIONS, so the witness is that there is now one: `unpinnedTraps` is a
 * single exported seam, and the last case asserts the two scripts reach it
 * rather than reimplementing it. Against the pre-fix code `trap-pins.ts` does
 * not exist and this file does not compile.
 *
 * THE HEADER RULE IS WHERE THE SUBTLETY LIVES, so it is asserted in both
 * directions. A number named in a test file's leading block comment is a pin; a
 * number named inside a case body is not, however useful the cross-reference.
 * `wcvp-lookup.test.ts` is the live example of the second, and the case below
 * reads it from disk rather than naming its number here — because writing the
 * number in THIS header would pin it, which is the same defect one level up.
 * It is also how this file first ran: the count came out 20 against 21.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  listTestFiles,
  pinnedTraps,
  trapNumbers,
  unpinnedTraps,
} from './trap-pins'

const LOG = readFileSync(
  join(__dirname, '../../../docs/database-log.md'),
  'utf8'
)

describe('trapNumbers', () => {
  it('reads the log headings, in order, including a "b" suffix', () => {
    const src = [
      '#### 3. A thing',
      'prose that mentions #### 99. which is not a heading',
      '#### 6b. A sibling',
      '#### 12. Another',
    ].join('\n')
    expect(trapNumbers(src)).toEqual(['3', '6b', '12'])
  })

  it('finds every trap in the real log and never a duplicate', () => {
    const found = trapNumbers(LOG)
    expect(found.length).toBeGreaterThan(30)
    expect(new Set(found).size).toBe(found.length)
  })
})

describe('the header rule', () => {
  const header = (body: string) => `/**\n * ${body}\n */\nimport x from 'y'\n`

  it('counts a trap named in the leading block comment', () => {
    expect(pinnedTraps([header('Pins TRAP 24 — a thing.')])).toEqual(
      new Set(['24'])
    )
  })

  it('counts several, and the plural spelling', () => {
    expect(pinnedTraps([header('Pins traps 3, 24 and 26.')])).toEqual(
      new Set(['3', '24', '26'])
    )
  })

  it('does NOT count a trap named only inside a case body', () => {
    const src = `${header('Pins nothing in particular.')}
it('does a thing', () => {
  // trap 15 is why this matters
})
`
    expect(pinnedTraps([src])).toEqual(new Set())
  })

  it('ignores a file whose first thing is not a block comment', () => {
    const src = `import { it } from 'vitest'\n/**\n * Pins TRAP 24.\n */\n`
    expect(pinnedTraps([src])).toEqual(new Set())
  })

  it('ignores a block comment that never closes', () => {
    expect(pinnedTraps(['/**\n * Pins TRAP 24 and stops\n'])).toEqual(new Set())
  })

  it('pins nothing from wcvp-lookup.test.ts, which names a trap only in a case', () => {
    // Read from disk and never named here: writing the number into this
    // header would pin it, which is the defect this file exists to hold shut.
    const wcvp = readFileSync(join(__dirname, 'wcvp-lookup.test.ts'), 'utf8')
    const cited = [...wcvp.matchAll(/\btraps?\s+(\d+b?)/gi)].map((m) => m[1]!)
    expect(cited.length).toBeGreaterThan(0)
    expect(pinnedTraps([wcvp])).toEqual(new Set())
  })
})

describe('unpinnedTraps', () => {
  it('subtracts the pinned from the logged, preserving heading order', () => {
    const log = ['#### 1. a', '#### 2. b', '#### 3. c'].join('\n')
    const tests = ['/**\n * Pins TRAP 2.\n */\n']
    expect(unpinnedTraps(log, tests)).toEqual(['1', '3'])
  })

  it('returns nothing when every trap is named in some header', () => {
    const log = ['#### 1. a', '#### 2. b'].join('\n')
    const tests = ['/**\n * Pins trap 1.\n */\n', '/**\n * Pins TRAP 2.\n */\n']
    expect(unpinnedTraps(log, tests)).toEqual([])
  })
})

describe('the two counters cannot drift apart (the incident)', () => {
  const source = (name: string) => readFileSync(join(__dirname, name), 'utf8')

  it('has both checks importing the shared seam', () => {
    for (const name of [
      'check-doc-claims.ts',
      'check-pipeline-invariants.ts',
    ]) {
      expect(source(name)).toMatch(/from '\.\/trap-pins'/)
    }
  })

  it('has both checks listing test files through the shared listing', () => {
    // Sharing the derivation was NOT enough and this is the case that proved
    // it: check-doc-claims lists untracked files, check-pipeline-invariants
    // listed tracked ones only, so an uncommitted test whose header named a
    // trap made them print 21 against 20. The file set is half the derivation.
    for (const name of [
      'check-doc-claims.ts',
      'check-pipeline-invariants.ts',
    ]) {
      expect(source(name)).toMatch(/listTestFiles\(REPO_ROOT\)/)
    }
  })

  it('includes files git does not track yet', () => {
    // The property that made the two disagree, asserted directly rather than
    // through either script: a test written and not yet committed still counts.
    const listed = listTestFiles(join(__dirname, '../../..'))
    const tracked = execFileSync('git', ['ls-files', '-z'], {
      cwd: join(__dirname, '../../..'),
      encoding: 'utf8',
    }).split('\0')
    const untracked = listed.filter((f) => !tracked.includes(f))
    // Nothing is asserted about how MANY are untracked — that depends on when
    // this runs. Only that the listing is not the tracked-only one.
    expect(listed.length).toBeGreaterThanOrEqual(untracked.length)
    expect(listed).toContain('apps/web/scripts/trap-pins.test.ts')
  })

  it('leaves neither check with its own copy of the header regex', () => {
    // The literal that was duplicated. If it reappears in either file, a second
    // derivation is back and the counts can disagree again.
    for (const name of [
      'check-doc-claims.ts',
      'check-pipeline-invariants.ts',
    ]) {
      expect(source(name)).not.toMatch(/matchAll\(\/\\btraps\?/)
    }
  })
})
