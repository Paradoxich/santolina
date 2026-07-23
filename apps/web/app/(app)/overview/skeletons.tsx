import { Panel } from '@paradoxui/ui'

// Shared by the page's Suspense fallbacks and loading.tsx so the navigation
// skeleton and the streaming skeleton are pixel-identical — the handoff from
// one to the other should be invisible.

/**
 * Row wrappers for the dashboard grid, single-sourced so page.tsx and
 * loading.tsx can't drift. Row heights are design floors (min-h), not fixed:
 * a card whose content runs a line taller (e.g. a two-line weather
 * description) grows its row and pushes the next row down, instead of
 * overflowing the card.
 */
export const dashboardRows = {
  top: 'grid grid-cols-1 gap-item-gap lg:min-h-[276px] lg:grid-cols-[592fr_420fr]',
  middle: 'grid grid-cols-1 gap-item-gap lg:min-h-[272px] lg:grid-cols-2',
  bottom: 'grid grid-cols-1 gap-item-gap lg:min-h-[234px] lg:grid-cols-3',
}

/**
 * A dashboard card mid-load: the real Panel chrome with its static title
 * rendered as text (cards whose title depends on data get a pulse bar
 * instead), pulse bars where content lands. Pulse bars use surface-page —
 * one sage step below the card surface.
 */
export function CardSkeleton({ title }: { title?: string }) {
  return (
    <Panel title={title} className="h-full min-h-[220px]" aria-hidden="true">
      {!title && (
        <div className="h-6 w-36 animate-pulse rounded bg-surface-page" />
      )}
      <div className="mt-auto flex flex-col gap-item-gap">
        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-page" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-page" />
      </div>
    </Panel>
  )
}

/** Stand-in for the one-line dashboard subtitle under the date heading. */
export function SubtitleSkeleton() {
  return (
    <div
      className="mt-3 h-5 w-72 max-w-full animate-pulse rounded bg-surface-card"
      aria-hidden="true"
    />
  )
}

/** The full card grid, used by loading.tsx during navigation. */
export function DashboardCardsSkeleton() {
  return (
    <div className="mt-8 flex flex-col gap-item-gap">
      <div className={dashboardRows.top}>
        <CardSkeleton title="My plants" />
        <CardSkeleton />
      </div>
      <div className={dashboardRows.middle}>
        <CardSkeleton />
        <CardSkeleton title="Plant care" />
      </div>
      <div className={dashboardRows.bottom}>
        <CardSkeleton title="Planned" />
        <CardSkeleton title="Diary" />
        <CardSkeleton />
      </div>
    </div>
  )
}
