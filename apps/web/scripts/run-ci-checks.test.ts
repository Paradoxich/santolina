/**
 * Pins TRAP 32 — a generated file is invisible to every check but its own.
 *
 * THE INCIDENT. 2026-08-17, `29993cd` added `packages/ui/src/components/
 * FormError.tsx`, a token consumer, without regenerating
 * `token-consumers.generated.ts`. Verification before pushing ran the tests,
 * `typecheck`, `invariants:check`, `docs:claims` and `docs:links` — five green
 * commands, none of which reads that file. Main went red on `tokens:check` at
 * `6f00469`; fixed by PR #174, merged `9e9b46d`.
 *
 * WHAT THIS ASSERTS, AND WHY IT IS THE DEFECT'S OWN WITNESS. Not "the generated
 * file is current" — that is `tokens:check`'s job and it was already doing it
 * correctly. The defect was in the VERIFICATION SET: the commands a person runs
 * before pushing were a hand-remembered subset of CI's, and nothing could tell
 * you which two were missing. So the witness is `stepsOf`, and the assertion is
 * that the list it produces is READ OUT OF `.github/workflows/ci.yml` and
 * contains the two commands the incident's local run did not: `tokens:check`
 * and `runbook:check`.
 *
 * Against the pre-fix code there is no `stepsOf` and no `run-ci-checks.ts`, so
 * this does not compile.
 *
 * THE LAST TWO CASES ARE THE SAME TRAP AIMED AT THIS FILE. A parser that
 * silently skipped a step it could not read, or that pointed at a job name that
 * no longer exists, would report green over a command nobody ran — which is
 * trap 32 exactly, one level up. Both must throw.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { stepsOf } from './run-ci-checks'

const WORKFLOW = readFileSync(
  join(__dirname, '../../../.github/workflows/ci.yml'),
  'utf8'
)

describe('the verification set (trap 32)', () => {
  it("includes the two commands the incident's local run omitted", () => {
    const steps = stepsOf(WORKFLOW, 'check')
    // tokens:check is the one that went red. runbook:check is its sibling —
    // same shape, same blind spot, and it had simply not been hit yet.
    expect(steps).toContain('pnpm tokens:check')
    expect(steps).toContain('pnpm runbook:check')
  })

  it("covers everything CI's pull-request job runs, in order", () => {
    // The whole list, so a step added to ci.yml and not to this expectation
    // fails here rather than on main. That is the point of deriving it: the
    // list has one home and this test is what holds the second one honest.
    expect(stepsOf(WORKFLOW, 'check')).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm typecheck',
      'pnpm test',
      'pnpm tokens:check',
      'pnpm runbook:check',
      'pnpm docs:links',
      'pnpm docs:claims',
      'pnpm invariants:check',
    ])
  })

  it('reads the workflow rather than restating it', () => {
    const withExtra = WORKFLOW.replace(
      '      - run: pnpm invariants:check',
      '      - run: pnpm invariants:check\n      - run: pnpm styles:check'
    )
    expect(stepsOf(withExtra, 'check')).toContain('pnpm styles:check')
  })

  it('refuses a multi-line run block instead of skipping it', () => {
    const multiline = WORKFLOW.replace(
      '      - run: pnpm tokens:check',
      '      - run: |\n          pnpm tokens:check'
    )
    expect(() => stepsOf(multiline, 'check')).toThrow(/multi-line/)
  })

  it('refuses a job name that is not in the workflow', () => {
    expect(() => stepsOf(WORKFLOW, 'checks')).toThrow(/no job "checks"/)
  })
})
