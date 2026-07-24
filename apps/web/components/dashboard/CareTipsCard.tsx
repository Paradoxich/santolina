'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

// How far the list dissolves into the background at its scrolled-past edge.
const FADE = '32px'

export function CareTipsCard({
  tips,
  groups,
  showEmptyHint = false,
}: CareTipsCardProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const next = el.scrollHeight - el.scrollTop - el.clientHeight > 1
    setCanScrollDown((prev) => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    updateScrollState()
    window.addEventListener('resize', updateScrollState)
    return () => window.removeEventListener('resize', updateScrollState)
  }, [updateScrollState, tips])

  const totalTips =
    groups.now.length + groups.thisWeek.length + groups.goodToKnow.length
  const maskImage = `linear-gradient(to bottom, #000 0, #000 calc(100% - ${FADE}), ${
    canScrollDown ? 'transparent' : '#000'
  } 100%)`

  return (
    <>
      <Panel
        title="Plant care"
        meta={`${totalTips} tips`}
        description={
          showEmptyHint
            ? 'Tailored tips show up when you have plants growing.'
            : undefined
        }
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
        {/* flex-1 (basis 0) + min-h-0 + overflow-y-auto: the list fills whatever
            height the row settles at and scrolls internally instead of its
            full 5-tip height inflating the row now that row heights are min-h
            floors. Scrolling browses the tips shown here; clicking the card
            opens the drawer for the full ranked list. The mask dissolves a
            cut-off row into the card instead of hard-clipping it against the
            rounded corner, and lifts once there's nothing left to scroll to. */}
        <ul
          ref={listRef}
          onScroll={updateScrollState}
          style={{ maskImage, WebkitMaskImage: maskImage }}
          className="scrollbar-hover flex min-h-0 w-full flex-1 basis-0 flex-col gap-tight-gap overflow-y-auto"
        >
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
