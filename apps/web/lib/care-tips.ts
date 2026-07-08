// Pure logic for the Dashboard's Care Tips card. Client-safe.
import type { SeasonalRhythm } from './plants-db'
import type { PalettePlant } from '@/server/palette-actions'
import type { CareTip } from '@/types/dashboard'
import { getBloomStatus } from './bloom-status'

export type Season = keyof SeasonalRhythm

const MAX_TIPS = 5

const MONTH_TO_SEASON: Record<number, Season> = {
  12: 'winter',
  1: 'winter',
  2: 'winter',
  3: 'early_spring',
  4: 'early_spring',
  5: 'late_spring',
  6: 'late_spring',
  7: 'summer',
  8: 'summer',
  9: 'late_summer',
  10: 'autumn',
  11: 'autumn',
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
      text: 'Avoid feeding during the hottest weeks — focus on water instead.',
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

/** Maps a calendar month onto the 6-stage seasonal_rhythm vocabulary (Mediterranean/European climate). */
export function getCurrentSeason(today: Date = new Date()): Season {
  return MONTH_TO_SEASON[today.getMonth() + 1]!
}

/**
 * Derives up to 5 Care Tips from the palette's maintenance_notes — the
 * field actually written as prescriptive care guidance ("deadhead spent
 * blooms"), not seasonal_rhythm, which is descriptive narrative about
 * what the plant is doing right now, not what to do about it. Season is
 * still used to prioritize currently-blooming/pre-bloom plants to the
 * front of the list. Falls back to STATIC_SEASONAL_TIPS when the palette
 * is empty or has nothing usable.
 */
export function getCareTips(
  palette: PalettePlant[],
  today: Date = new Date()
): CareTip[] {
  const season = getCurrentSeason(today)

  const candidates = palette
    .filter((p) => p.status === 'planted' || p.status === 'planned')
    .map((p) => {
      const text = p.plant.maintenance_notes
      if (!text) return null
      return {
        plantId: p.plantId,
        plantName: p.plant.common_name,
        text,
        bloomStatus: getBloomStatus(p.plant.bloom_months ?? [], today),
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  if (candidates.length === 0) return STATIC_SEASONAL_TIPS[season]

  const prioritized = candidates.filter(
    (c) => c.bloomStatus === 'blooming' || c.bloomStatus === 'pre-bloom'
  )
  const rest = candidates.filter(
    (c) => c.bloomStatus !== 'blooming' && c.bloomStatus !== 'pre-bloom'
  )

  return [...prioritized, ...rest]
    .slice(0, MAX_TIPS)
    .map(({ plantId, plantName, text }) => ({ plantId, plantName, text }))
}
