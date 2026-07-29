import { DashboardCardsSkeleton, SubtitleSkeleton } from './skeletons'

// Navigation skeleton for /overview. Mirrors the page shell exactly (same
// grid, same card skeletons with real titles) so the swap to the streaming
// shell is invisible. The date heading is a pulse bar: loading.tsx is
// prerendered at build time, so it cannot know today's date.
export default function OverviewLoading() {
  return (
    <div className="max-w-[1128px] pb-16 pt-8 md:pt-12" aria-hidden="true">
      <div className="h-9 w-40 animate-pulse rounded-md bg-surface-card" />
      <SubtitleSkeleton />
      <DashboardCardsSkeleton />
    </div>
  )
}
