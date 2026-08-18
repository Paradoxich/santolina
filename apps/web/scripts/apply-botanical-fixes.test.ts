/**
 * The botanical settlement path: what may be stamped, and when.
 *
 * TRAP 24 at a finer grain. `cross-check-plants` used to stamp
 * `botanical_checked_at` on every row it walked, so a row it DISAGREED with
 * left the --new-only queue for good and round close read the stamp as
 * FAIL-level proof the step had settled it. `shouldStamp` withholds those rows;
 * these tests pin the other end, where a person's verdicts turn one back into a
 * write.
 *
 * The dangerous case is partial settlement: verdicts are per flag and the stamp
 * is per row, so a row with one flag ruled and one blank must NOT be written or
 * stamped. That is the original defect rebuilt one level down.
 */

import { describe, it, expect } from 'vitest'
import { planRow, newestQueue, type QueueRow } from './apply-botanical-fixes'
import { shouldStamp, buildQueue } from './cross-check-plants'

const row = (flags: Partial<QueueRow['flags'][number]>[]): QueueRow => ({
  id: 'row-1',
  common_name: "Adam's-needle",
  scientific_name: 'Yucca filamentosa',
  flags: flags.map((f) => ({
    field: 'plant_type',
    stored: 'perennial',
    checked: 'succulent',
    detail: 'classification mismatch',
    verdict: '',
    why: '',
    ...f,
  })),
})

describe('shouldStamp', () => {
  it('withholds a row the check disagreed with', () => {
    expect(
      shouldStamp({
        flags: [
          {
            field: 'plant_type',
            severity: 'disagree',
            stored: 'a',
            checked: 'b',
            detail: '',
          },
        ],
      })
    ).toBe(false)
  })

  it('stamps a clean row', () => {
    expect(shouldStamp({ flags: [] })).toBe(true)
  })

  it('stamps a row whose only flags are minor drift', () => {
    expect(
      shouldStamp({
        flags: [
          {
            field: 'bloom_months',
            severity: 'minor',
            stored: [5],
            checked: [5, 6],
            detail: '',
          },
          {
            field: 'sun_requirements',
            severity: 'minor',
            stored: 'a',
            checked: 'b',
            detail: '',
          },
        ],
      })
    ).toBe(true)
  })
})

describe('planRow', () => {
  it('writes the checked value on a correction', () => {
    const plan = planRow(
      row([{ verdict: 'correct', why: 'it is a succulent' }])
    )
    expect(plan.kind).toBe('settled')
    if (plan.kind !== 'settled') return
    expect(plan.to).toEqual({ plant_type: 'succulent' })
    expect(plan.from).toEqual({ plant_type: 'perennial' })
  })

  it('writes no column on a keep, so the row is stamp-only', () => {
    const plan = planRow(row([{ verdict: 'keep', why: 'RHS agrees with us' }]))
    expect(plan.kind).toBe('settled')
    if (plan.kind !== 'settled') return
    expect(plan.to).toEqual({})
    expect(plan.from).toEqual({})
  })

  it('refuses a row where one flag is still unruled', () => {
    const plan = planRow(
      row([
        { verdict: 'correct', why: 'yes' },
        { field: 'sun_requirements', verdict: '' },
      ])
    )
    expect(plan.kind).toBe('open')
    if (plan.kind !== 'open') return
    expect(plan.unruled).toEqual(['sun_requirements'])
  })

  it('treats an unrecognised verdict as unruled rather than as a keep', () => {
    const plan = planRow(row([{ verdict: 'probably fine' }]))
    expect(plan.kind).toBe('open')
  })

  it('guards only the fields it corrects', () => {
    const plan = planRow(
      row([
        { verdict: 'correct', why: 'yes' },
        {
          field: 'sun_requirements',
          stored: 'full_sun',
          checked: 'partial_sun',
          verdict: 'keep',
          why: 'stored is right',
        },
      ])
    )
    if (plan.kind !== 'settled') throw new Error('expected settled')
    expect(Object.keys(plan.from)).toEqual(['plant_type'])
  })
})

describe('buildQueue', () => {
  const disagreements = [
    {
      id: 'row-1',
      common_name: "Adam's-needle",
      scientific_name: 'Yucca filamentosa',
      flags: [
        {
          field: 'plant_type',
          severity: 'disagree' as const,
          stored: 'perennial',
          checked: 'succulent',
          detail: 'classification mismatch',
        },
        {
          field: 'bloom_months',
          severity: 'minor' as const,
          stored: [6],
          checked: [6, 7],
          detail: 'one month either side',
        },
      ],
    },
  ]

  it('carries only the flags that withheld the stamp', () => {
    const queue = buildQueue(disagreements, '2026-08-18T00:00:00.000Z')
    expect(queue.rows[0]!.flags.map((f) => f.field)).toEqual(['plant_type'])
  })

  it('ships every verdict empty, so nothing is decided by default', () => {
    const queue = buildQueue(disagreements, '2026-08-18T00:00:00.000Z')
    expect(queue.rows[0]!.flags.every((f) => f.verdict === '')).toBe(true)
  })

  it('hands the applier a row it will refuse until someone rules', () => {
    const queue = buildQueue(disagreements, '2026-08-18T00:00:00.000Z')
    expect(planRow(queue.rows[0]!).kind).toBe('open')
  })
})

describe('newestQueue', () => {
  it('picks the newest queue and ignores everything else in reference/', () => {
    expect(
      newestQueue([
        'botanical-flags-2026-07-09.json',
        'botanical-flags-2026-08-18.json',
        'native-to-fixes-2026-07-30.json',
        'README.md',
      ])
    ).toBe('botanical-flags-2026-08-18.json')
  })

  it('returns null when the guard has queued nothing', () => {
    expect(newestQueue(['README.md'])).toBe(null)
  })
})
