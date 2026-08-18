/**
 * The `sun-audit-targets-a-derived-column` finding, recorded 2026-08-14 by the
 * pipeline audit (section 4) and the schema design review, fixed 2026-08-18.
 *
 * PRE-FIX, THE FIRST TEST FAILS AND MOST OF THE REST DO TOO. cross-check-plants
 * raised `disagree` flags naming `sun_requirements`, which migration
 * 20260709220000 made a BEFORE-trigger-derived mirror of
 * `sun_thrives ∪ sun_tolerates`. A write to it is recomputed away, so those
 * flags addressed a column no reader could act on. The comparison was sound;
 * the address was not.
 */

import { describe, expect, it } from 'vitest'

import type { DbPlant } from '../lib/plants-db'
import {
  comparePlant,
  storedSunExposures,
  type CrossCheckResponse,
} from './cross-check-plants'

const plant = (over: Partial<DbPlant> = {}): DbPlant =>
  ({
    id: 'id-1',
    common_name: 'Lavender',
    scientific_name: 'Lavandula angustifolia',
    family: 'Lamiaceae',
    plant_type: 'perennial',
    hardiness_zone_min: 5,
    hardiness_zone_max: 9,
    sun_thrives: ['full_sun'],
    sun_tolerates: [],
    sun_requirements: ['full_sun'],
    bloom_months: [6, 7],
    ...over,
  }) as DbPlant

const check = (over: Partial<CrossCheckResponse> = {}): CrossCheckResponse => ({
  plant_type: 'perennial',
  hardiness_zone_min: 5,
  hardiness_zone_max: 9,
  sun_requirements: ['full_sun'],
  bloom_months: [6, 7],
  ...over,
})

const sunFlags = (p: DbPlant, c: CrossCheckResponse) =>
  comparePlant(p, c).filter((f) => f.field.startsWith('sun'))

describe('storedSunExposures', () => {
  it('is the union of the two fields a person edits', () => {
    const v = storedSunExposures(
      plant({ sun_thrives: ['full_sun'], sun_tolerates: ['partial_sun'] })
    )
    expect(v).toEqual({ exposures: ['full_sun', 'partial_sun'], split: true })
  })

  it('falls back to the mirror only for a row that predates the split', () => {
    // Migration 20260709220000: rows with both source fields empty keep their
    // existing sun_requirements.
    const v = storedSunExposures(
      plant({
        sun_thrives: [],
        sun_tolerates: [],
        sun_requirements: ['shade'],
      })
    )
    expect(v).toEqual({ exposures: ['shade'], split: false })
  })

  it('does not double-count an exposure', () => {
    const v = storedSunExposures(
      plant({ sun_thrives: ['full_sun'], sun_tolerates: ['full_sun'] })
    )
    expect(v.exposures).toEqual(['full_sun'])
  })
})

describe('comparePlant sun flags (sun-audit-targets-a-derived-column)', () => {
  // The finding's own witness. A flag naming the derived column is a flag
  // nobody can act on, whatever its severity.
  it('never raises a flag naming sun_requirements', () => {
    const cases: Array<[DbPlant, CrossCheckResponse]> = [
      [plant(), check({ sun_requirements: ['shade'] })],
      [plant(), check({ sun_requirements: ['full_sun', 'partial_sun'] })],
      [
        plant({ sun_thrives: ['full_sun', 'shade'], sun_tolerates: [] }),
        check({ sun_requirements: ['full_sun', 'partial_sun'] }),
      ],
      [
        plant({
          sun_thrives: [],
          sun_tolerates: [],
          sun_requirements: ['shade'],
        }),
        check({ sun_requirements: ['full_sun'] }),
      ],
    ]
    for (const [p, c] of cases)
      for (const flag of comparePlant(p, c))
        expect(flag.field).not.toBe('sun_requirements')
  })

  it('blames sun_tolerates when the species accepts more than is recorded', () => {
    const flags = sunFlags(
      plant(),
      check({ sun_requirements: ['full_sun', 'partial_sun'] })
    )
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({
      field: 'sun_tolerates',
      severity: 'disagree',
    })
    // The remedy is the output: curate-sun-tolerance is the pass that writes it.
    expect(flags[0]!.detail).toContain('curate-sun-tolerance')
  })

  it('names the pair, not one field, when the exposures are contradicted', () => {
    const flags = sunFlags(plant(), check({ sun_requirements: ['shade'] }))
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({
      field: 'sun_thrives+sun_tolerates',
      severity: 'disagree',
      detail: 'no overlap',
    })
  })

  it('reports the two source fields as the stored value, not the mirror', () => {
    const flags = sunFlags(
      plant({ sun_thrives: ['full_sun'], sun_tolerates: [] }),
      check({ sun_requirements: ['full_sun', 'shade'] })
    )
    expect(flags[0]!.stored).toEqual({
      sun_thrives: ['full_sun'],
      sun_tolerates: [],
    })
  })

  it('tells a pre-split row to be split before either flag can be acted on', () => {
    const flags = sunFlags(
      plant({
        sun_thrives: [],
        sun_tolerates: [],
        sun_requirements: ['shade'],
      }),
      check({ sun_requirements: ['full_sun'] })
    )
    expect(flags[0]!.detail).toContain('predates the sun split')
    expect(flags[0]!.stored).toEqual({ sun_requirements: ['shade'] })
  })

  it('raises nothing when the recorded union matches the check', () => {
    expect(
      sunFlags(
        plant({ sun_thrives: ['full_sun'], sun_tolerates: ['partial_sun'] }),
        check({ sun_requirements: ['full_sun', 'partial_sun'] })
      )
    ).toEqual([])
  })

  it('leaves the other fields comparing as they did', () => {
    const flags = comparePlant(
      plant(),
      check({ bloom_months: [1, 2], hardiness_zone_min: 9 })
    )
    expect(flags.map((f) => f.field).sort()).toEqual([
      'bloom_months',
      'hardiness_zone_min',
    ])
  })
})
