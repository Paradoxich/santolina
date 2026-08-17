/**
 * `--baseline` forwarding, pinned.
 *
 * WHY. run-round's preflight resolves a rollback point and step 8a
 * (`check-round-scope`) resolves one again, independently. `resolveBaselineDir`
 * falls back backups/ → the round's own archive, so the two agreed by luck
 * rather than by construction: a run whose preflight passed against a
 * hand-taken pre-seed backup could have 8a fall back to the round archive,
 * which is a different window, and a scope check against the wrong window
 * reports the round's own writes as spill (the round-8 shape, trap 25's
 * neighbourhood).
 *
 * The fix is that one resolved baseline is forwarded, and forwarded ONLY to
 * steps that declared they read one — a flag handed to a script that rejects
 * unknown flags fails the step, and handed to one that ignores it makes a run
 * look configured when it is not.
 */

import { describe, expect, it } from 'vitest'
import { stepArgs } from './run-round'
import { RUNBOOK, type Step } from './runbook'

const step = (over: Partial<Step> = {}): Step => ({
  step: 'fixture',
  runbook: '0',
  script: 'fixture.ts',
  ...over,
})

describe('--baseline forwarding', () => {
  it('reaches a step that declares it reads one', () => {
    const args = stepArgs(step({ acceptsBaseline: true }), '13', 'backups/x')
    expect(args).toContain('--baseline')
    expect(args[args.indexOf('--baseline') + 1]).toBe('backups/x')
  })

  it('does NOT reach a step that has not declared it', () => {
    expect(stepArgs(step(), '13', 'backups/x')).not.toContain('--baseline')
  })

  it('is absent entirely when the run resolved no explicit baseline', () => {
    const args = stepArgs(step({ acceptsBaseline: true }), '13', undefined)
    expect(args).not.toContain('--baseline')
  })

  it('never displaces the step’s own args', () => {
    // --apply is step 1a's, and dropping it would make the step a dry run that
    // reported success. Order matters to nothing here; presence does.
    const args = stepArgs(
      step({ acceptsBaseline: true, args: ['--apply'] }),
      '13',
      'backups/x'
    )
    expect(args).toContain('--apply')
    expect(args).toContain('--baseline')
  })

  it('always passes --round <label>', () => {
    const args = stepArgs(step(), '13')
    expect(args[args.indexOf('--round') + 1]).toBe('13')
  })
})

describe('the runbook declares the baseline readers', () => {
  it('marks check-round-scope, the one step that reads a baseline', () => {
    const declared = RUNBOOK.filter((s) => s.acceptsBaseline).map(
      (s) => s.script
    )
    expect(declared).toEqual(['check-round-scope.ts'])
  })
})
