import { MyPlantsCard } from '@/components/dashboard/MyPlantsCard'
import { BloomTimelineCard } from '@/components/dashboard/BloomTimelineCard'
import { WeatherCard } from '@/components/dashboard/WeatherCard'
import { CareTipsCard } from '@/components/dashboard/CareTipsCard'
import { PlannedCard } from '@/components/dashboard/PlannedCard'
import { DiaryRecentCard } from '@/components/dashboard/DiaryRecentCard'
import { InsightCard } from '@/components/dashboard/InsightCard'
import { getCareTips } from '@/lib/care-tips'
import { deriveBloomSeason } from '@/lib/bloom-timeline'
import {
  buildDashboardSubtitle,
  buildGardenInsight,
} from '@/lib/dashboard-copy'
import { formatBloomRangeShort } from '@/lib/format-plant'
import { listPalette } from '@/server/palette-actions'
import { getCurrentGarden } from '@/lib/current-garden'
import { getForecast } from '@/lib/open-meteo'
import { getPlantDiaries } from '@/lib/diary'
import type {
  DashboardPlant,
  PlannedPlant,
  WeatherDay,
} from '@/types/dashboard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const today = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
  }).format(new Date())
  const palette = await listPalette()
  const careTips = getCareTips(palette)

  const growing = palette.filter((p) => p.status === 'planted')
  const myPlants: DashboardPlant[] = growing
    .map((p) => ({
      name: p.plant.common_name,
      imageUrl: p.plant.image_url ?? p.plant.image_urls?.[0] ?? '',
    }))
    .filter((p) => p.imageUrl)
    .slice(0, 5)

  const plannedPlants: PlannedPlant[] = palette
    .filter((p) => p.status === 'planned')
    .map((p) => ({
      name: p.plant.common_name,
      imageUrl: p.plant.image_url ?? p.plant.image_urls?.[0] ?? '',
      months: formatBloomRangeShort(p.plant.bloom_months) ?? '',
    }))

  const garden = await getCurrentGarden()
  let weatherDays: WeatherDay[] | null = null
  if (garden?.lat != null && garden?.lon != null) {
    try {
      weatherDays = await getForecast(garden.lat, garden.lon)
    } catch {
      weatherDays = null
    }
  }

  const diaries = await getPlantDiaries()

  const subtitle = buildDashboardSubtitle(weatherDays, palette)
  const insight = buildGardenInsight(palette)

  return (
    <div className="max-w-[1032px] pb-16 pt-8 md:pt-12">
      <h1 className="text-title font-semibold tracking-[-0.04em] text-primary">
        {today}
      </h1>
      <p className="mt-3 text-body text-secondary">{subtitle}</p>

      <div className="mt-8 flex flex-col gap-section-gap">
        <div className="grid grid-cols-1 gap-section-gap lg:h-[276px] lg:grid-cols-[592fr_420fr]">
          <MyPlantsCard plants={myPlants} totalInGarden={growing.length} />
          <BloomTimelineCard
            season={deriveBloomSeason(palette)}
            hasPlants={growing.length > 0}
          />
        </div>

        <div className="grid grid-cols-1 gap-section-gap lg:h-[272px] lg:grid-cols-2">
          <WeatherCard
            location={garden?.city ?? null}
            country={garden?.country ?? null}
            days={weatherDays}
          />
          <CareTipsCard tips={careTips} showEmptyHint={palette.length === 0} />
        </div>

        <div className="grid grid-cols-1 gap-section-gap lg:h-[234px] lg:grid-cols-3">
          <PlannedCard plants={plannedPlants} />
          <DiaryRecentCard diaries={diaries} />
          <InsightCard text={insight} />
        </div>
      </div>
    </div>
  )
}
