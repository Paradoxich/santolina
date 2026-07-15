'use client'

import { useState } from 'react'
import { Panel } from '@paradoxui/ui'
import { CareTipsDrawer } from '@/components/CareTipsDrawer'
import type { GroupedCareTips } from '@/lib/care-tips'
import type { CareTip } from '@/types/dashboard'

interface CareTipsCardProps {
  /** Top few tips shown on the card face (already capped). */
  tips: CareTip[]
  /** Full ranked list, opened in the drawer via the count. */
  groups: GroupedCareTips
  /** True when the palette is empty — shows a hint above the generic seasonal tips. */
  showEmptyHint?: boolean
}

export function CareTipsCard({
  tips,
  groups,
  showEmptyHint = false,
}: CareTipsCardProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const hasMore =
    groups.now.length + groups.thisWeek.length + groups.goodToKnow.length >
    tips.length

  return (
    <>
      <Panel
        title="Plant care"
        meta={
          // The count is the door to the full list (Care Tips v2 § Surfaces).
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="rounded-full text-body text-muted transition-colors duration-normal hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {tips.length} tips
            {hasMore ? ' · View all' : ''}
          </button>
        }
        className="relative h-full overflow-hidden"
      >
        {showEmptyHint && (
          <p className="mb-inline-gap text-body-small text-muted">
            Add plants to your garden for tips tailored to what you&apos;re
            growing.
          </p>
        )}
        {/* flex-1 (basis 0) + min-h-0 + overflow-hidden: the list fills whatever
            height the row settles at and clips under the fade, instead of its
            full 5-tip height inflating the row now that row heights are min-h
            floors. This card's design is "show what fits, fade the rest". */}
        <ul className="flex min-h-0 w-full flex-1 basis-0 flex-col gap-tight-gap overflow-hidden">
          {tips.map((tip, index) => (
            <li
              key={`${tip.plantId ?? 'general'}-${index}`}
              className="flex h-10 w-full items-center justify-between gap-row-gap rounded-sm bg-surface-subtle px-item-gap py-inline-gap"
            >
              <span className="truncate text-body text-primary">
                {tip.text}
              </span>
              {/* Event tips name the plant in their text, so they show their
                  timeframe here instead; guidance tips show the plant. */}
              {(tip.timeframe ?? tip.plantName) && (
                <span className="shrink-0 whitespace-nowrap text-label text-muted">
                  {tip.timeframe ?? tip.plantName}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[71px] bg-gradient-to-t from-[var(--color-surface-card)] to-transparent"
        />
      </Panel>
      {isDrawerOpen && (
        <CareTipsDrawer
          groups={groups}
          onClose={() => setIsDrawerOpen(false)}
        />
      )}
    </>
  )
}

export default CareTipsCard
