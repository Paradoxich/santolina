'use client'

/**
 * One plant's year, drawn in the dashboard's BloomTimelineCard language:
 * month gridlines at low opacity with the current month at full accent, the
 * bloom window as a 4px rounded span, and a circular plant thumbnail sitting
 * on it. The difference from the dashboard card is the row underneath — your
 * logged events, in the same coordinate space as the species' flowering.
 *
 * That overlay is the whole argument for a garden-scoped detail view: it is
 * the only place "the species" and "your copy of it" are visibly different
 * things. Neither half needs a new column.
 */

import { PlantImage } from '@/components/PlantImage'
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

/** Position across the strip as a percentage of the year, by day. */
function positionOf(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  const end = Date.UTC(date.getUTCFullYear() + 1, 0, 1)
  return ((date.getTime() - start) / (end - start)) * 100
}

interface YearTimelineProps {
  bloomMonths: number[]
  events: SampleEvent[]
  today: Date
  plantName: string
  imageUrl: string | null
}

export function YearTimeline({
  bloomMonths,
  events,
  today,
  plantName,
  imageUrl,
}: YearTimelineProps) {
  const currentMonth = today.getUTCMonth() + 1
  const todayLeft = positionOf(today)

  const hasBloom = bloomMonths.length > 0
  const firstMonth = hasBloom ? Math.min(...bloomMonths) : 0
  const lastMonth = hasBloom ? Math.max(...bloomMonths) : 0
  // Span runs from the start of the first bloom month to the end of the last.
  const spanLeft = ((firstMonth - 1) / 12) * 100
  const spanWidth = ((lastMonth - firstMonth + 1) / 12) * 100

  // Events grouped by month: a month with three waterings gets one mark.
  const byMonth = new Map<number, SampleEvent[]>()
  for (const event of events) {
    const month = new Date(`${event.date}T12:00:00Z`).getUTCMonth() + 1
    const bucket = byMonth.get(month)
    if (bucket) bucket.push(event)
    else byMonth.set(month, [event])
  }

  return (
    <div className="flex w-full flex-1 flex-col justify-between gap-item-gap">
      <div className="relative min-h-[120px] w-full flex-1">
        {/* Month gridlines, current month picked out. Matches the dashboard's
            seasonal card so the two read as the same instrument. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 flex justify-between"
        >
          {MONTH_INITIALS.map((month, i) => (
            <span
              key={`${month}-${i}`}
              className={[
                'h-full w-px bg-accent',
                i + 1 === currentMonth ? '' : 'opacity-10',
              ].join(' ')}
            />
          ))}
        </div>

        {/* Today, as a full-height line. */}
        <div
          aria-hidden="true"
          className="absolute top-0 h-full w-px bg-accent"
          style={{ left: `${todayLeft}%` }}
        />

        {/* The species: its flowering window. Sits in the upper third, with
            your logged marks in the lower third, so the two rows read as
            "what it does" above "what you did". */}
        {hasBloom && (
          <div className="absolute inset-x-0 top-[38%]">
            <div
              className="absolute h-[4px] -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${spanLeft}%`, width: `${spanWidth}%` }}
              role="img"
              aria-label={`Flowers ${MONTH_NAMES[firstMonth - 1]} to ${MONTH_NAMES[lastMonth - 1]}`}
            />
            <div
              className="absolute size-6 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border border-accent"
              style={{ left: `${spanLeft + spanWidth / 2}%` }}
            >
              <PlantImage
                src={imageUrl}
                alt={plantName}
                fill
                sizes="24px"
                className="object-cover"
              />
            </div>
          </div>
        )}

        {/* You: what you logged, same axis. */}
        <div className="absolute inset-x-0 top-[76%]">
          {[...byMonth.entries()].map(([month, monthEvents]) => (
            <span
              key={month}
              title={`${MONTH_NAMES[month - 1]}: ${monthEvents
                .map((e) => DIARY_EVENT_LABELS[e.type])
                .join(', ')}`}
              className="absolute size-2 -translate-x-1/2 rounded-xs bg-fern-600"
              style={{ left: `${((month - 1) / 12) * 100 + 100 / 24}%` }}
            />
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col gap-item-gap">
        <div className="flex w-full items-center justify-between text-center text-micro">
          {MONTH_INITIALS.map((month, i) => (
            <span
              key={`${month}-${i}`}
              className={i + 1 === currentMonth ? 'text-accent' : 'text-muted'}
            >
              {month}
            </span>
          ))}
        </div>
        {/* Two rows sharing one axis need naming; the dashboard's card plots
            only one kind of thing and can go without. */}
        <div className="flex flex-wrap items-center gap-item-gap text-micro text-muted">
          <span className="flex items-center gap-tight-gap">
            <span className="h-1 w-4 rounded-full bg-accent" />
            Flowering
          </span>
          <span className="flex items-center gap-tight-gap">
            <span className="size-2 rounded-xs bg-fern-600" />
            You logged something
          </span>
        </div>
      </div>
    </div>
  )
}
