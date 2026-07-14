import { describe, expect, it } from 'vitest'
import type { DbPlant } from './plants-db'
import type { PalettePlant, PaletteStatus } from '@/server/palette-actions'
import {
  CARE_EVENT_RULES,
  STATIC_SEASONAL_TIPS,
  getCareTips,
  getEventTips,
  isPeakHeat,
  type CareEvent,
} from './care-tips'

// --- fixtures --------------------------------------------------------------

const TODAY = new Date('2026-07-14T12:00:00.000Z')

function daysAgo(n: number): Date {
  return new Date(TODAY.getTime() - n * 24 * 60 * 60 * 1000)
}

let seq = 0
function plant(overrides: Partial<DbPlant> = {}): DbPlant {
  seq += 1
  return {
    id: `plant-${seq}`,
    common_name: `Plant ${seq}`,
    plant_type: null,
    maintenance_notes: null,
    bloom_months: [],
    ...overrides,
  } as DbPlant
}

function palettePlant(
  p: DbPlant,
  status: PaletteStatus = 'planted'
): PalettePlant {
  return {
    id: `palette-${p.id}`,
    gardenId: 'garden-1',
    plantId: p.id,
    status,
    source: 'manual',
    notes: null,
    addedAt: TODAY.toISOString(),
    plant: p,
  }
}

function plantedEvent(plantId: string, days: number): CareEvent {
  return { plantId, eventType: 'planted', occurredAt: daysAgo(days) }
}

// --- window math -----------------------------------------------------------

describe('getEventTips — establishment watering window (rule 1: all types, day 2–14)', () => {
  const p = plant({ common_name: 'Salvia', plant_type: 'perennial' })
  const palette = [palettePlant(p)]

  it('does not fire before day 2', () => {
    const tips = getEventTips(palette, [plantedEvent(p.id, 1)], {
      today: TODAY,
    })
    expect(tips).toHaveLength(0)
  })

  it('fires on the inclusive lower boundary (day 2)', () => {
    const tips = getEventTips(palette, [plantedEvent(p.id, 2)], {
      today: TODAY,
    })
    expect(tips).toHaveLength(1)
    expect(tips[0]!.text).toContain('Salvia')
    expect(tips[0]!.timeframe).toBe('this week')
  })

  it('still fires on the last day inside the window (day 13)', () => {
    const tips = getEventTips(palette, [plantedEvent(p.id, 13)], {
      today: TODAY,
    })
    expect(tips).toHaveLength(1)
  })

  it('expires on the exclusive upper boundary (day 14) for a non-woody plant', () => {
    const tips = getEventTips(palette, [plantedEvent(p.id, 14)], {
      today: TODAY,
    })
    expect(tips).toHaveLength(0)
  })
})

describe('getEventTips — woody establishment (rule 2: shrub/tree/climber, day 14–60)', () => {
  it('fires for a shrub on the boundary day 14 (and rule 1 has expired)', () => {
    const p = plant({ common_name: 'Lavender', plant_type: 'shrub' })
    const tips = getEventTips([palettePlant(p)], [plantedEvent(p.id, 14)], {
      today: TODAY,
    })
    expect(tips).toHaveLength(1)
    expect(tips[0]!.text).toContain('Woody plants root slowly')
    expect(tips[0]!.timeframe).toBe('in the next two weeks')
  })

  it('expires at day 60', () => {
    const p = plant({ common_name: 'Lavender', plant_type: 'shrub' })
    const tips = getEventTips([palettePlant(p)], [plantedEvent(p.id, 60)], {
      today: TODAY,
    })
    expect(tips).toHaveLength(0)
  })

  it('does not fire for a non-woody plant type', () => {
    const p = plant({ common_name: 'Cosmos', plant_type: 'annual' })
    const tips = getEventTips([palettePlant(p)], [plantedEvent(p.id, 20)], {
      today: TODAY,
    })
    // day 20: rule 1 expired, rule 2 excludes annuals, rule 3 not yet (day < 28)
    expect(tips).toHaveLength(0)
  })
})

// --- heat gate -------------------------------------------------------------

describe('getEventTips — first fertilizing window (rule 3: day 28–42, no_peak_heat gate)', () => {
  const p = plant({ common_name: 'Cosmos', plant_type: 'annual' })
  const palette = [palettePlant(p)]

  it('fires when it is not peak heat', () => {
    const tips = getEventTips(palette, [plantedEvent(p.id, 30)], {
      today: TODAY,
      peakHeat: false,
    })
    expect(tips).toHaveLength(1)
    expect(tips[0]!.text).toContain('Fertilize')
  })

  it('is suppressed by the no_peak_heat gate', () => {
    const tips = getEventTips(palette, [plantedEvent(p.id, 30)], {
      today: TODAY,
      peakHeat: true,
    })
    expect(tips).toHaveLength(0)
  })
})

describe('getEventTips — overlapping rules', () => {
  it('a climber at day 30 gets both the woody-watering and fertilizing tips', () => {
    const p = plant({ common_name: 'Clematis', plant_type: 'climber' })
    const tips = getEventTips([palettePlant(p)], [plantedEvent(p.id, 30)], {
      today: TODAY,
      peakHeat: false,
    })
    expect(tips).toHaveLength(2)
  })
})

// --- exclusions ------------------------------------------------------------

describe('getEventTips — exclusions', () => {
  it('a planted plant with no planted event (e.g. a source:existing plant) gets no event tips', () => {
    const p = plant({ plant_type: 'shrub' })
    const tips = getEventTips([palettePlant(p)], [], { today: TODAY })
    expect(tips).toHaveLength(0)
  })

  it('planned plants never generate event tips even if an event exists', () => {
    const p = plant({ plant_type: 'perennial' })
    const tips = getEventTips(
      [palettePlant(p, 'planned')],
      [plantedEvent(p.id, 5)],
      { today: TODAY }
    )
    expect(tips).toHaveLength(0)
  })

  it('uses only the most recent planted event per plant', () => {
    const p = plant({ plant_type: 'perennial' })
    // An old planting (day 40, past all windows) plus a fresh one (day 3).
    const tips = getEventTips(
      [palettePlant(p)],
      [plantedEvent(p.id, 40), plantedEvent(p.id, 3)],
      { today: TODAY }
    )
    expect(tips).toHaveLength(1) // rule 1 from the day-3 event
  })
})

// --- getCareTips ordering + fallback ---------------------------------------

describe('getCareTips', () => {
  it('ranks event tips ahead of maintenance guidance', () => {
    const p = plant({
      common_name: 'Salvia',
      plant_type: 'perennial',
      maintenance_notes: 'Deadhead spent blooms.',
    })
    const tips = getCareTips([palettePlant(p)], {
      events: [plantedEvent(p.id, 5)],
      today: TODAY,
    })
    expect(tips.length).toBeGreaterThanOrEqual(2)
    expect(tips[0]!.timeframe).toBe('this week') // the event tip
    expect(tips[tips.length - 1]!.text).toBe('Deadhead spent blooms.')
  })

  it('caps the list at 5 tips', () => {
    const plants = Array.from({ length: 8 }, () =>
      palettePlant(plant({ maintenance_notes: 'Water regularly.' }))
    )
    expect(getCareTips(plants, { today: TODAY })).toHaveLength(5)
  })

  it('falls back to the static seasonal tips when the garden yields nothing', () => {
    const tips = getCareTips([], { today: TODAY })
    expect(tips).toEqual(STATIC_SEASONAL_TIPS.summer)
  })

  it('does not fall back to static tips when only event tips exist', () => {
    const p = plant({ plant_type: 'perennial' }) // no maintenance_notes
    const tips = getCareTips([palettePlant(p)], {
      events: [plantedEvent(p.id, 5)],
      today: TODAY,
    })
    expect(tips).toHaveLength(1)
    expect(tips[0]!.timeframe).toBe('this week')
  })
})

// --- vocabulary sweep ------------------------------------------------------

describe('vocabulary ruling', () => {
  it('the static summer tips say "fertilizing", never "feeding"', () => {
    const joined = STATIC_SEASONAL_TIPS.summer.map((t) => t.text).join(' ')
    expect(joined).toContain('Avoid fertilizing during the hottest weeks')
    expect(joined).not.toMatch(/feed/i)
  })

  it('every rule tip_template uses "Fertilize"/"Water", never "feed"', () => {
    const joined = CARE_EVENT_RULES.map((r) => r.tip_template).join(' ')
    expect(joined).not.toMatch(/feed/i)
  })
})

// --- isPeakHeat ------------------------------------------------------------

describe('isPeakHeat', () => {
  it('is true when today’s forecast high is at/above the threshold', () => {
    expect(isPeakHeat(30)).toBe(true)
    expect(isPeakHeat(34)).toBe(true)
  })

  it('is false when today’s forecast high is below the threshold', () => {
    expect(isPeakHeat(29)).toBe(false)
  })

  it('falls back to peak summer when no forecast is available', () => {
    expect(isPeakHeat(null, new Date('2026-07-14'))).toBe(true) // summer
    expect(isPeakHeat(null, new Date('2026-01-14'))).toBe(false) // winter
  })
})
