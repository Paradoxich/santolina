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
 * you which two were missing. So the witness is `jobsOf`, and the assertion is
 * that the list it produces is READ OUT OF `.github/workflows/ci.yml` and
 * reaches every one of trap 32's four generated files.
 *
 * Against the pre-fix code there is no `jobsOf` and no `run-ci-checks.ts`, so
 * this does not compile.
 *
 * THE REFUSAL CASES ARE THE SAME TRAP AIMED AT THIS FILE. A parser that
 * silently dropped a step it could not read, or that returned an empty job,
 * would report green over a command nobody ran — which is trap 32 exactly, one
 * level up. Both must throw.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { jobsOf } from './run-ci-checks'

const WORKFLOW = readFileSync(
  join(__dirname, '../../../.github/workflows/ci.yml'),
  'utf8'
)

const commandsOf = (yaml: string) => jobsOf(yaml).flatMap((j) => j.commands)

describe('the verification set (trap 32)', () => {
  it("includes the two commands the incident's local run omitted", () => {
    // tokens:check is the one that went red. runbook:check is its sibling —
    // same shape, same blind spot, and it had simply not been hit yet.
    expect(commandsOf(WORKFLOW)).toContain('pnpm tokens:check')
    expect(commandsOf(WORKFLOW)).toContain('pnpm runbook:check')
  })

  it("reaches all four of trap 32's generated files", () => {
    // The two database commands are the half CI never runs on a pull request,
    // and they carry docs/catalog-state.md and style-availability.generated.ts.
    // Reading them out of the `run: |` blocks rather than naming them here is
    // what keeps this a derivation.
    const commands = commandsOf(WORKFLOW)
    expect(commands).toContain(
      'pnpm --filter santolina-web catalog:state:check'
    )
    expect(commands).toContain('pnpm --filter santolina-web migrations:check')
  })

  it('covers every job in the workflow, in order', () => {
    // A job or step added to ci.yml and not to this expectation fails here
    // rather than on main. That is the point of deriving the list: it has one
    // home, and this test is what holds the second one honest.
    expect(
      jobsOf(WORKFLOW).map((j) => ({ key: j.key, mainOnly: j.mainOnly }))
    ).toEqual([
      { key: 'check', mainOnly: false },
      { key: 'catalog-state', mainOnly: true },
      { key: 'migration-drift', mainOnly: true },
    ])
  })

  it('marks the database jobs as skipped on a pull request', () => {
    // Derived from the `(main only)` the workflow deliberately carries in its
    // job names. If somebody shortens a name, this fails — which is the
    // workflow's own comment about that name, made executable.
    const dbJobs = jobsOf(WORKFLOW).filter((j) => j.mainOnly)
    expect(dbJobs).toHaveLength(2)
    for (const job of dbJobs) expect(job.name).toMatch(/\(main only\)/)
  })

  it('reads the workflow rather than restating it', () => {
    const withExtra = WORKFLOW.replace(
      '      - run: pnpm invariants:check',
      '      - run: pnpm invariants:check\n      - run: pnpm styles:check'
    )
    expect(commandsOf(withExtra)).toContain('pnpm styles:check')
  })

  it('refuses a run block it cannot find a command in', () => {
    // The shell plumbing in the database jobs is ignored on purpose — it exists
    // to write .env.local on a runner. A block with ONLY plumbing means the real
    // command moved, and silently running nothing is the trap.
    const gutted = WORKFLOW.replace(
      '          pnpm --filter santolina-web migrations:check',
      '          echo done'
    )
    expect(() => jobsOf(gutted)).toThrow(/no `pnpm` line/)
  })

  it('refuses a job that parsed to nothing', () => {
    // Strips every inline `- run:`, which empties the `check` job while the two
    // block-scalar jobs keep their pnpm lines.
    const emptied = WORKFLOW.replace(/^ {6}- run: .*$/gm, '')
    expect(() => jobsOf(emptied)).toThrow(/zero\s+commands/)
  })
})
