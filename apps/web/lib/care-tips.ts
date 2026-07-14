// Pure logic for the Dashboard's Care Tips card. Client-safe.
import type { PalettePlant, PaletteStatus } from '@/server/palette-actions'
import type { PlantType } from './plants-db'
import type { CareTip } from '@/types/dashboard'
import type { DiaryEventType } from './diary-events'
import { getBloomStatus } from './bloom-status'
import { getCurrentSeason, type Season } from './season'

const MAX_TIPS = 5

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * A logged typed diary event, reduced to what tip ranking needs. Built from
 * diary_entries rows (event_type not null) — see listGardenCareEvents.
 */
export interface CareEvent {
  plantId: string
  eventType: DiaryEventType
  occurredAt: Date
}

/** Render-time conditions a rule can require. */
type CareTipGate = 'no_peak_heat'

/**
 * Rules-as-data: an event-relative Care Tip template. Kept as a plain TS
 * constant (CARE_EVENT_RULES below) shaped so lifting it into a Postgres
 * table later — curation-pipeline-populated, like plant_combinations — is
 * mechanical. Rules are data; the code here only evaluates them.
 */
export interface CareEventRule {
  event: DiaryEventType
  /** null = applies to every plant type. */
  plant_types: PlantType[] | null
  /** Inclusive lower bound (days since the event). */
  window_start_days: number
  /** Exclusive upper bound — the tip self-expires when days reaches it. */
  window_end_days: number
  /** "{plant}" is replaced with the plant's common name. */
  tip_template: string
  /** When the tip is relevant, e.g. "this week" (the Figma timeframe ruling). */
  timeframe_copy: string
  /** Render-time gates that must all pass for the tip to surface. */
  gates?: CareTipGate[]
}

/**
 * v1 rules — three, copy locked July 14 2026 (Care Tips v2 spec). All are
 * triggered by a "planted" event today; watered/fertilized recurring rules
 * are deliberately out of scope until logging habits prove out. Windows are
 * half-open [start, end), so adjacent windows (2–14 then 14–60) never both
 * fire on the boundary day.
 */
export const CARE_EVENT_RULES: CareEventRule[] = [
  {
    event: 'planted',
    plant_types: null,
    window_start_days: 2,
    window_end_days: 14,
    tip_template: 'Water {plant} deeply every few days while it settles in.',
    timeframe_copy: 'this week',
  },
  {
    event: 'planted',
    plant_types: ['shrub', 'tree', 'climber'],
    window_start_days: 14,
    window_end_days: 60,
    tip_template:
      'Keep watering {plant} through its first weeks. Woody plants root slowly.',
    timeframe_copy: 'in the next two weeks',
  },
  {
    event: 'planted',
    plant_types: ['annual', 'perennial', 'climber'],
    window_start_days: 28,
    window_end_days: 42,
    tip_template: 'Fertilize {plant} for the first time this week.',
    timeframe_copy: 'this week',
    gates: ['no_peak_heat'],
  },
]

/** Temperature at or above which the no_peak_heat gate closes. Mirrors the
 * "Hot days ahead" threshold in dashboard-copy. */
const PEAK_HEAT_C = 30

/**
 * Peak-heat signal for the no_peak_heat gate. Uses today's forecast high when
 * weather is available, and otherwise falls back to peak summer — the season
 * the static "avoid fertilizing during the hottest weeks" tip already lives
 * in, so the two agree without a forecast.
 */
export function isPeakHeat(
  weatherHighToday: number | null,
  today: Date = new Date()
): boolean {
  if (weatherHighToday != null) return weatherHighToday >= PEAK_HEAT_C
  return getCurrentSeason(today) === 'summer'
}

/** Generic, plant-agnostic tasks shown when the palette has nothing usable for the current season. */
export const STATIC_SEASONAL_TIPS: Record<Season, CareTip[]> = {
  early_spring: [
    {
      plantId: null,
      plantName: null,
      text: 'Cut back dead perennial growth before new shoots emerge.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Divide overcrowded clumps of spring-flowering perennials.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Apply a slow-release fertiliser as new growth begins.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Watch for late frosts before moving tender plants outdoors.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Top up mulch once the soil has warmed slightly.',
    },
  ],
  late_spring: [
    {
      plantId: null,
      plantName: null,
      text: 'Stake tall or floppy perennials before they need it.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Deadhead spent blooms to encourage a second flush.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Water new plantings regularly while roots establish.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Pinch back leggy growth to keep plants bushy.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Watch for aphids on soft new growth.',
    },
  ],
  summer: [
    {
      plantId: null,
      plantName: null,
      text: 'Water deeply in early morning to reduce evaporation loss.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Deadhead regularly to keep plants flowering.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Mulch bare soil to retain moisture through hot spells.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Avoid fertilizing during the hottest weeks — focus on water instead.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Check containers daily; they dry out fastest in heat.',
    },
  ],
  late_summer: [
    {
      plantId: null,
      plantName: null,
      text: "Collect seed from plants you'd like to grow again next year.",
    },
    {
      plantId: null,
      plantName: null,
      text: 'Cut back finished perennials to tidy the border.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Start planning autumn planting while the soil is still warm.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Reduce watering gradually as growth slows.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Watch for powdery mildew in crowded, humid spots.',
    },
  ],
  autumn: [
    {
      plantId: null,
      plantName: null,
      text: 'Plant spring-flowering bulbs while the soil is still workable.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Clear fallen leaves from beds to prevent fungal issues.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Divide and replant overgrown perennials while they’re dormant.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Add compost or mulch to beds ahead of winter.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Move tender potted plants under cover before the first frost.',
    },
  ],
  winter: [
    {
      plantId: null,
      plantName: null,
      text: 'Protect tender plants with fleece during hard frosts.',
    },
    {
      plantId: null,
      plantName: null,
      text: "Prune deciduous shrubs while they're dormant and leafless.",
    },
    {
      plantId: null,
      plantName: null,
      text: 'Avoid walking on frozen or waterlogged soil.',
    },
    {
      plantId: null,
      plantName: null,
      text: 'Check stored bulbs and tubers for rot.',
    },
    {
      plantId: null,
      plantName: null,
      text: "Plan next season's planting while the garden rests.",
    },
  ],
}

/** Whole days elapsed between an event and `today` (floored). */
function daysSince(occurredAt: Date, today: Date): number {
  return Math.floor((today.getTime() - occurredAt.getTime()) / MS_PER_DAY)
}

function ruleApplies(
  rule: CareEventRule,
  plantType: PlantType | null,
  days: number,
  peakHeat: boolean
): boolean {
  if (rule.plant_types !== null) {
    if (plantType === null || !rule.plant_types.includes(plantType))
      return false
  }
  if (days < rule.window_start_days || days >= rule.window_end_days)
    return false
  if (rule.gates?.includes('no_peak_heat') && peakHeat) return false
  return true
}

/**
 * Event-relative (Tier 3) tips: computed at render time from typed diary
 * events × CARE_EVENT_RULES — never stored as tip rows. A tip self-expires
 * the day its window closes; there is no overdue state. Only plants currently
 * planted are considered, and only their most recent event of each type — a
 * plant re-added and re-flipped restarts its establishment clock.
 */
export function getEventTips(
  palette: PalettePlant[],
  events: CareEvent[],
  { today = new Date(), peakHeat = false }: TipOptions = {}
): CareTip[] {
  // Most recent occurrence per (plant, event type).
  const latest = new Map<string, Date>()
  for (const e of events) {
    const key = `${e.plantId}:${e.eventType}`
    const current = latest.get(key)
    if (!current || e.occurredAt > current) latest.set(key, e.occurredAt)
  }

  const tips: CareTip[] = []
  for (const p of palette) {
    if (p.status !== 'planted') continue
    const plantType = p.plant.plant_type
    for (const rule of CARE_EVENT_RULES) {
      const occurredAt = latest.get(`${p.plantId}:${rule.event}`)
      if (!occurredAt) continue
      const days = daysSince(occurredAt, today)
      if (!ruleApplies(rule, plantType, days, peakHeat)) continue
      tips.push({
        plantId: p.plantId,
        plantName: p.plant.common_name,
        text: rule.tip_template.replace('{plant}', p.plant.common_name),
        timeframe: rule.timeframe_copy,
      })
    }
  }
  return tips
}

interface TipOptions {
  events?: CareEvent[]
  today?: Date
  peakHeat?: boolean
}

const ACTIVE_STATUSES: PaletteStatus[] = ['planted', 'planned']

/**
 * Up to 5 Care Tips, ranked. Event-relative tips (Tier 3) come first — they
 * are the most time-sensitive — followed by guidance derived from the
 * palette's maintenance_notes, the field actually written as prescriptive
 * care ("deadhead spent blooms"), not seasonal_rhythm (descriptive narrative,
 * not something to act on). Within guidance, currently-blooming/pre-bloom
 * plants sort to the front. Falls back to STATIC_SEASONAL_TIPS only when the
 * garden yields nothing — no events and no usable maintenance notes.
 */
export function getCareTips(
  palette: PalettePlant[],
  { events = [], today = new Date(), peakHeat = false }: TipOptions = {}
): CareTip[] {
  const season = getCurrentSeason(today)
  const eventTips = getEventTips(palette, events, { today, peakHeat })

  const guidance = palette
    .filter((p) => ACTIVE_STATUSES.includes(p.status))
    .map((p) => {
      const text = p.plant.maintenance_notes
      if (!text) return null
      return {
        tip: {
          plantId: p.plantId,
          plantName: p.plant.common_name,
          text,
          timeframe: null,
        } satisfies CareTip,
        bloomStatus: getBloomStatus(p.plant.bloom_months ?? [], today),
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  if (eventTips.length === 0 && guidance.length === 0)
    return STATIC_SEASONAL_TIPS[season]

  const prioritized = guidance
    .filter(
      (c) => c.bloomStatus === 'blooming' || c.bloomStatus === 'pre-bloom'
    )
    .map((c) => c.tip)
  const rest = guidance
    .filter(
      (c) => c.bloomStatus !== 'blooming' && c.bloomStatus !== 'pre-bloom'
    )
    .map((c) => c.tip)

  return [...eventTips, ...prioritized, ...rest].slice(0, MAX_TIPS)
}
