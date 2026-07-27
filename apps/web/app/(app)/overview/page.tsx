import { Suspense } from 'react'
import {
  DashboardSubtitle,
  MyPlantsSection,
  BloomTimelineSection,
  WeatherSection,
  CareTipsSection,
  PlannedSection,
  RecentActivitySection,
  ImpactSection,
} from './cards'
import { CardSkeleton, SubtitleSkeleton, dashboardRows } from './skeletons'

export const dynamic = 'force-dynamic'

// The page itself is sync: only the date heading renders here, so the shell
// (heading + card skeletons) hits the browser on first flush. Every card
// streams in independently via its Suspense boundary — see cards.tsx.
export default function DashboardPage() {
  const today = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  return (
    <div className="max-w-[1032px] pb-16 pt-8 md:pt-12">
      <h1 className="text-title font-semibold text-primary">{today}</h1>
      <Suspense fallback={<SubtitleSkeleton />}>
        <DashboardSubtitle />
      </Suspense>

      <div className="mt-8 flex flex-col gap-item-gap">
        <div className={dashboardRows.top}>
          <Suspense fallback={<CardSkeleton title="My plants" />}>
            <MyPlantsSection />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <BloomTimelineSection />
          </Suspense>
        </div>

        <div className={dashboardRows.middle}>
          <Suspense fallback={<CardSkeleton />}>
            <WeatherSection />
          </Suspense>
          <Suspense fallback={<CardSkeleton title="Plant care" />}>
            <CareTipsSection />
          </Suspense>
        </div>

        <div className={dashboardRows.bottom}>
          <Suspense fallback={<CardSkeleton title="Planned" />}>
            <PlannedSection />
          </Suspense>
          <Suspense fallback={<CardSkeleton title="Recent activity" />}>
            <RecentActivitySection />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <ImpactSection />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
