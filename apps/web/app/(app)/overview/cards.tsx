import { MyPlantsCard } from '@/components/dashboard/MyPlantsCard'
import { BloomTimelineCard } from '@/components/dashboard/BloomTimelineCard'
import { WeatherCard } from '@/components/dashboard/WeatherCard'
import { CareTipsCard } from '@/components/dashboard/CareTipsCard'
import { PlannedCard } from '@/components/dashboard/PlannedCard'
import { DiaryRecentCard } from '@/components/dashboard/DiaryRecentCard'
import { ImpactCard } from '@/components/dashboard/ImpactCard'
import {
  getCareTips,
  getGroupedCareTips,
  isPeakHeat,
  type CareEvent,
} from '@/lib/care-tips'
import { deriveBloomSeason } from '@/lib/bloom-timeline'
import { buildDashboardSubtitle, buildGardenImpact } from '@/lib/dashboard-copy'
import { formatBloomRangeShort } from '@/lib/format-plant'
import { heroImageUrl } from '@/lib/plant-detail'
import { getPlantDiaries } from '@/lib/diary'
import {
  getPaletteCached,
  getCareEventsCached,
  getGardenForecastCached,
} from '@/lib/dashboard-data'
import type { DashboardPlant, PlannedPlant } from '@/types/dashboard'

// Each dashboard card is its own async server component so the page can
// stream: the header paints on first flush and every card fills in as soon as
// its own data lands, instead of the whole page waiting on the slowest fetch
// (usually the Open-Meteo forecast). The shared reads (palette, forecast) are
// deduped per request via the cache() wrappers in lib/dashboard-data.

export async function DashboardSubtitle() {
  const [palette, { days }] = await Promise.all([
    getPaletteCached(),
    getGardenForecastCached(),
  ])
  return (
    <p className="mt-3 text-body text-secondary">
      {buildDashboardSubtitle(days, palette)}
    </p>
  )
}

export async function MyPlantsSection() {
  const palette = await getPaletteCached()
  const growing = palette.filter((p) => p.status === 'planted')
  const plants: DashboardPlant[] = growing
    .map((p) => ({
      name: p.plant.common_name,
      imageUrl: heroImageUrl(p.plant),
    }))
    .slice(0, 5)
  return <MyPlantsCard plants={plants} totalInGarden={growing.length} />
}

export async function BloomTimelineSection() {
  const palette = await getPaletteCached()
  const hasPlants = palette.some((p) => p.status === 'planted')
  return (
    <BloomTimelineCard
      season={deriveBloomSeason(palette)}
      hasPlants={hasPlants}
    />
  )
}

export async function WeatherSection() {
  const { garden, days } = await getGardenForecastCached()
  return (
    <WeatherCard
      location={garden?.city ?? null}
      country={garden?.country ?? null}
      days={days}
    />
  )
}

// Care Tips fold in Tier 3 event-relative tips (from typed diary events) and
// let weather push the no_peak_heat gate — so this card needs the palette,
// diary events, and forecast all in hand, and resolves last.
export async function CareTipsSection() {
  const [palette, events, { days }] = await Promise.all([
    getPaletteCached(),
    getCareEventsCached(),
    getGardenForecastCached(),
  ])
  const careEvents: CareEvent[] = events.map((e) => ({
    plantId: e.plantId,
    eventType: e.eventType,
    occurredAt: new Date(e.createdAt),
  }))
  const options = {
    events: careEvents,
    peakHeat: isPeakHeat(days?.[0]?.high ?? null),
  }
  return (
    <CareTipsCard
      tips={getCareTips(palette, options)}
      groups={getGroupedCareTips(palette, options)}
      showEmptyHint={palette.length === 0}
    />
  )
}

export async function PlannedSection() {
  const palette = await getPaletteCached()
  const plants: PlannedPlant[] = palette
    .filter((p) => p.status === 'planned')
    .map((p) => ({
      name: p.plant.common_name,
      imageUrl: heroImageUrl(p.plant),
      months: formatBloomRangeShort(p.plant.bloom_months) ?? '',
    }))
  return <PlannedCard plants={plants} />
}

export async function DiarySection() {
  const diaries = await getPlantDiaries()
  return <DiaryRecentCard diaries={diaries} />
}

export async function ImpactSection() {
  const palette = await getPaletteCached()
  return <ImpactCard text={buildGardenImpact(palette)} />
}
