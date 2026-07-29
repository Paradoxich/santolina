import { describe, it, expect } from 'vitest'
import { evaluateRound, type EvaluatedArtifact } from './round-progress'
import type { StepStatus } from './round-status'

const step = (
  name: string,
  complete: boolean,
  level: 'FAIL' | 'WARN' = 'FAIL'
): StepStatus => ({
  step: name,
  done: complete ? 10 : 4,
  total: 10,
  complete,
  // These fixtures all have real scope (total 10), so none is vacuous. The
  // empty-scope case is covered in round-rehearsal.test.ts.
  vacuous: false,
  evidence: `${name} evidence`,
  level,
})

const artifact = (
  runbook: string,
  ok: boolean,
  level: 'FAIL' | 'WARN' = 'FAIL'
): EvaluatedArtifact => ({
  runbook,
  step: `artifact-${runbook}`,
  level,
  result: { ok, detail: 'detail' },
  remedy: `remedy-${runbook}`,
})

describe('evaluateRound', () => {
  it('is complete when every step and artifact passes', () => {
    const v = evaluateRound(
      [step('curate-plants', true), step('curate-styles', true)],
      [artifact('0', true), artifact('8a', true)]
    )
    expect(v.complete).toBe(true)
    expect(v.fails).toBe(0)
    expect(v.next).toBeNull()
  })

  it('puts the missing backup ahead of everything else', () => {
    // The backup is runbook step 0: without it nothing that follows is safe to
    // re-run, so it wins even when a pipeline step is also outstanding.
    const v = evaluateRound(
      [step('curate-plants', false)],
      [artifact('0', false), artifact('8a', false)]
    )
    expect(v.complete).toBe(false)
    expect(v.next).toBe('remedy-0')
  })

  it('prefers an outstanding pipeline step over a later artifact', () => {
    const v = evaluateRound(
      [step('curate-plants', true), step('curate-greenery', false)],
      [artifact('0', true), artifact('8a', false)]
    )
    expect(v.next).toContain('curate-greenery.ts --round')
  })

  it('falls through to the first failing artifact in runbook order', () => {
    const v = evaluateRound(
      [step('curate-plants', true)],
      [artifact('0', true), artifact('8a', false), artifact('8d', false)]
    )
    expect(v.next).toBe('remedy-8a')
  })

  it('never lets a warning affect completeness or the next action', () => {
    const v = evaluateRound(
      [step('draft-hardiness', false, 'WARN')],
      [artifact('0', true), artifact('8c', false, 'WARN')]
    )
    expect(v.complete).toBe(true)
    expect(v.fails).toBe(0)
    expect(v.warns).toBe(2)
    expect(v.next).toBeNull()
  })

  it('counts a per-result downgrade as a warning, not a failure', () => {
    const downgraded: EvaluatedArtifact = {
      ...artifact('8b', false),
      result: { ok: false, detail: 'soft', level: 'WARN' },
    }
    const v = evaluateRound([step('curate-plants', true)], [downgraded])
    expect(v.complete).toBe(true)
    expect(v.warns).toBe(1)
  })
})
