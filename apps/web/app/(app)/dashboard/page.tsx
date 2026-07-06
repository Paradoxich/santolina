import { MyPlantsCard } from '@/components/dashboard/MyPlantsCard'
import { BloomTimelineCard } from '@/components/dashboard/BloomTimelineCard'
import { WeatherCard } from '@/components/dashboard/WeatherCard'
import { CareTipsCard } from '@/components/dashboard/CareTipsCard'
import { PlannedCard } from '@/components/dashboard/PlannedCard'
import { DiaryRecentCard } from '@/components/dashboard/DiaryRecentCard'
import { InsightCard } from '@/components/dashboard/InsightCard'
import {
  bloomSeason,
  careTips,
  dashboardSubtitle,
  gardenInsight,
  myPlants,
  plannedPlants,
  weatherDays,
  weatherLocation,
} from '@/lib/sample-dashboard'
import { sampleGardenPlants } from '@/lib/sample-garden'
import { samplePlantDiaries } from '@/lib/sample-diary'

export default function DashboardPage() {
  const today = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
  }).format(new Date())
  const growingCount = sampleGardenPlants.filter((p) => !p.planned).length

  return (
    <div className="max-w-[1032px] pb-16 pt-12">
      <h1 className="text-[length:var(--font-size-page-title)] font-semibold tracking-[-0.04em] text-[var(--text-page-title)]">
        {today}
      </h1>
      <p className="mt-3 text-[length:var(--font-size-body)] text-[var(--text-page-subtitle)]">
        {dashboardSubtitle}
      </p>

      <div className="mt-8 flex flex-col gap-[var(--space-section-gap)]">
        <div className="grid h-[276px] grid-cols-[592fr_420fr] gap-[var(--space-section-gap)]">
          <MyPlantsCard plants={myPlants} totalInGarden={growingCount} />
          <BloomTimelineCard season={bloomSeason} />
        </div>

        <div className="grid h-[252px] grid-cols-2 gap-[var(--space-section-gap)]">
          <WeatherCard location={weatherLocation} days={weatherDays} />
          <CareTipsCard tips={careTips} />
        </div>

        <div className="grid h-[234px] grid-cols-3 gap-[var(--space-section-gap)]">
          <PlannedCard plants={plannedPlants} />
          <DiaryRecentCard diaries={samplePlantDiaries} />
          <InsightCard text={gardenInsight} />
        </div>
      </div>
    </div>
  )
}
