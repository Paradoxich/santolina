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
  const totalTips =
    groups.now.length + groups.thisWeek.length + groups.goodToKnow.length

  return (
    <>
      <Panel
        title="Plant care"
        meta={`${totalTips} tips`}
        role="button"
        tabIndex={0}
        onClick={() => setIsDrawerOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setIsDrawerOpen(true)
          }
        }}
        className="relative h-full cursor-pointer overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {showEmptyHint && (
          <p className="mb-inline-gap text-body-small text-muted">
            Add plants to your garden for tips tailored to what you&apos;re
            growing.
          </p>
        )}
        {/* flex-1 (basis 0) + min-h-0 + overflow-y-auto: the list fills whatever
            height the row settles at and scrolls internally instead of its
            full 5-tip height inflating the row now that row heights are min-h
            floors. Scrolling browses the tips shown here; clicking the card
            opens the drawer for the full ranked list. */}
        <ul className="flex min-h-0 w-full flex-1 basis-0 flex-col gap-tight-gap overflow-y-auto">
          {tips.map((tip, index) => (
            <li
              key={`${tip.plantId ?? 'general'}-${index}`}
              className="flex h-10 w-full shrink-0 items-center justify-between gap-row-gap rounded-sm bg-surface-subtle px-item-gap py-inline-gap"
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
