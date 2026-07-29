'use client'

/**
 * The year strip: the species' bloom window as a band, your logged events as
 * marks beneath it, today as a line across both. This is the one place where
 * "the species" and "your copy of it" are drawn in the same coordinate space,
 * which is the whole argument for a garden-scoped detail view.
 *
 * Preview only for now. If it graduates, bloom_months and the diary events it
 * plots both already exist; nothing here needs new columns.
 */

import { DIARY_EVENT_LABELS } from '@/lib/diary-events'
import type { SampleEvent } from './sample'

const MONTH_INITIALS = [
  'J',
  'F',
  'M',
  'A',
  'M',
  'J',
  'J',
  'A',
  'S',
  'O',
  'N',
  'D',
]

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Position across the strip as a percentage, by day of year. */
function positionOf(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  const end = Date.UTC(date.getUTCFullYear() + 1, 0, 1)
  return ((date.getTime() - start) / (end - start)) * 100
}

interface YearTimelineProps {
  bloomMonths: number[]
  events: SampleEvent[]
  today: Date
}

export function YearTimeline({
  bloomMonths,
  events,
  today,
}: YearTimelineProps) {
  const currentMonth = today.getUTCMonth() + 1
  const todayLeft = positionOf(today)

  // Events grouped by month, so a month with three waterings shows one mark.
  const byMonth = new Map<number, SampleEvent[]>()
  for (const event of events) {
    const month = new Date(`${event.date}T12:00:00Z`).getUTCMonth() + 1
    const bucket = byMonth.get(month)
    if (bucket) bucket.push(event)
    else byMonth.set(month, [event])
  }

  const bloomLabel =
    bloomMonths.length > 0
      ? `Flowers ${MONTH_NAMES[Math.min(...bloomMonths) - 1]} to ${MONTH_NAMES[Math.max(...bloomMonths) - 1]}`
      : 'No flowering window'

  return (
    <div className="flex w-full flex-col gap-inline-gap">
      <div className="relative w-full">
        {/* Today line, drawn behind the marks so it never obscures one. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 z-0 h-full w-px bg-accent"
          style={{ left: `${todayLeft}%` }}
        />

        {/* Bloom band */}
        <div
          className="relative grid h-2 w-full grid-cols-12 gap-px overflow-hidden rounded-full"
          role="img"
          aria-label={bloomLabel}
        >
          {MONTH_INITIALS.map((_, i) => {
            const month = i + 1
            const inBloom = bloomMonths.includes(month)
            return (
              <div
                key={month}
                className={inBloom ? 'h-full bg-accent' : 'h-full bg-sage-400'}
              />
            )
          })}
        </div>

        {/* Month scale */}
        <div className="mt-tight-gap grid w-full grid-cols-12">
          {MONTH_INITIALS.map((initial, i) => (
            <span
              key={`${initial}-${i}`}
              className={`text-center text-micro ${
                i + 1 === currentMonth ? 'text-primary' : 'text-faint'
              }`}
            >
              {initial}
            </span>
          ))}
        </div>

        {/* Your marks */}
        <div className="mt-tight-gap grid min-h-[14px] w-full grid-cols-12">
          {MONTH_INITIALS.map((_, i) => {
            const month = i + 1
            const monthEvents = byMonth.get(month) ?? []
            if (monthEvents.length === 0) return <div key={month} />
            const labels = monthEvents
              .map((e) => DIARY_EVENT_LABELS[e.type])
              .join(', ')
            return (
              <div
                key={month}
                className="flex items-center justify-center"
                title={`${MONTH_NAMES[i]}: ${labels}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-fern-600" />
                {monthEvents.length > 1 && (
                  <span className="ml-0.5 text-micro text-muted">
                    {monthEvents.length}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-item-gap text-micro text-muted">
        <span className="flex items-center gap-tight-gap">
          <span className="h-1.5 w-4 rounded-full bg-accent" />
          Flowering
        </span>
        <span className="flex items-center gap-tight-gap">
          <span className="h-1.5 w-1.5 rounded-full bg-fern-600" />
          You logged something
        </span>
        <span className="flex items-center gap-tight-gap">
          <span className="h-3 w-px bg-accent" />
          Today
        </span>
      </div>
    </div>
  )
}
