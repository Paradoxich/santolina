import { MyPlantsCard } from '@/components/dashboard/MyPlantsCard'
import { BloomTimelineCard } from '@/components/dashboard/BloomTimelineCard'
import { WeatherCard } from '@/components/dashboard/WeatherCard'
import { CareTipsCard } from '@/components/dashboard/CareTipsCard'
import { PlannedCard } from '@/components/dashboard/PlannedCard'
import { DiaryRecentCard } from '@/components/dashboard/DiaryRecentCard'
import { InsightCard } from '@/components/dashboard/InsightCard'
import {
  bloomSeason,
  dashboardSubtitle,
  gardenInsight,
  myPlants,
  plannedPlants,
  weatherDays,
  weatherLocation,
} from '@/lib/sample-dashboard'
import { sampleGardenPlants } from '@/lib/sample-garden'
import { samplePlantDiaries } from '@/lib/sample-diary'
import { getCareTips } from '@/lib/care-tips'
import { listPalette } from '@/server/palette-actions'

export default async function DashboardPage() {
  const today = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
  }).format(new Date())
  const growingCount = sampleGardenPlants.filter((p) => !p.planned).length
  const careTips = getCareTips(await listPalette())

  return (
    <div className="max-w-[1032px] pb-16 pt-8 md:pt-12">
      <h1 className="text-title font-semibold tracking-[-0.04em] text-primary">
        {today}
      </h1>
      <p className="mt-3 text-body text-secondary">{dashboardSubtitle}</p>

      <div className="mt-8 flex flex-col gap-section-gap">
        <div className="grid grid-cols-1 gap-section-gap lg:h-[276px] lg:grid-cols-[592fr_420fr]">
          <MyPlantsCard plants={myPlants} totalInGarden={growingCount} />
          <BloomTimelineCard season={bloomSeason} />
        </div>

        <div className="grid grid-cols-1 gap-section-gap lg:h-[272px] lg:grid-cols-2">
          <WeatherCard location={weatherLocation} days={weatherDays} />
          <CareTipsCard tips={careTips} />
        </div>

        <div className="grid grid-cols-1 gap-section-gap lg:h-[234px] lg:grid-cols-3">
          <PlannedCard plants={plannedPlants} />
          <DiaryRecentCard diaries={samplePlantDiaries} />
          <InsightCard text={gardenInsight} />
        </div>
      </div>
    </div>
  )
}
