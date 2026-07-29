'use client'

/**
 * What the plant does across the year, on one axis.
 *
 * Three layers over the same twelve months: the six seasonal_rhythm stages as
 * segments, the flowering window as a bar, and your logged events as marks.
 * Selecting a stage reads out its rhythm text, which is why this replaced the
 * bloom-band-only strip — that strip showed one fact the header already
 * stated, while the rhythm text sat in a table in the reference drawer saying
 * the same thing in a different place. One home, and it is this.
 *
 * Winter appears at both ends because it wraps the year end. Both segments
 * select the same stage.
 */

import { useState } from 'react'
import { PlantImage } from '@/components/PlantImage'
import { DIARY_EVENT_LABELS, type DiaryEventType } from '@/lib/diary-events'
import {
  SEASON_LABELS,
  SEASON_SPANS,
  getCurrentSeason,
  type Season,
} from '@/lib/season'
import type { SeasonalRhythm } from '@/lib/plants-db'

/** A logged event reduced to what the strip plots: what, and roughly when. */
export interface TimelineEvent {
  type: DiaryEventType
  /** ISO date, e.g. "2026-05-08". */
  date: string
}

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

/** Left edge and width of a month range, as percentages of the year. */
function spanBounds(startMonth: number, endMonth: number) {
  return {
    left: ((startMonth - 1) / 12) * 100,
    width: ((endMonth - startMonth + 1) / 12) * 100,
  }
}

interface YearTimelineProps {
  bloomMonths: number[]
  events: TimelineEvent[]
  today: Date
  plantName: string
  imageUrl: string | null
  /** Per-stage description of what the plant is doing. */
  rhythm: SeasonalRhythm | null
}

export function YearTimeline({
  bloomMonths,
  events,
  today,
  plantName,
  imageUrl,
  rhythm,
}: YearTimelineProps) {
  const currentSeason = getCurrentSeason(today)
  const [selected, setSelected] = useState<Season>(currentSeason)
  const todayLeft = positionOf(today)

  const hasBloom = bloomMonths.length > 0
  const firstMonth = hasBloom ? Math.min(...bloomMonths) : 0
  const lastMonth = hasBloom ? Math.max(...bloomMonths) : 0
  const bloom = spanBounds(firstMonth, lastMonth)

  // Events grouped by month: a month with three waterings gets one mark.
  const byMonth = new Map<number, TimelineEvent[]>()
  for (const event of events) {
    const month = new Date(`${event.date}T12:00:00Z`).getUTCMonth() + 1
    const bucket = byMonth.get(month)
    if (bucket) bucket.push(event)
    else byMonth.set(month, [event])
  }

  const selectedText = rhythm?.[selected] ?? null

  return (
    <div className="flex w-full flex-col gap-item-gap">
      {/* One track. Everything below is positioned against the same twelve
          months, so a stage band, the bloom bar and a logged mark in the
          same column are genuinely the same week of the year. */}
      <div className="relative w-full">
        {/* Month gridlines run the full height, behind every lane. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 flex justify-between"
        >
          {MONTH_INITIALS.map((month, i) => (
            <span
              key={`${month}-${i}`}
              className="h-full w-px bg-accent opacity-10"
            />
          ))}
        </div>

        {/* Today, across every lane. */}
        <div
          aria-hidden="true"
          className="absolute top-0 z-10 h-full w-px bg-accent"
          style={{ left: `${todayLeft}%` }}
        />

        {/* Stage lane: contiguous bands, hairline-separated, rounded only at
            the two ends of the year so it reads as one continuous track. */}
        <div className="relative flex h-11 w-full overflow-hidden rounded-sm">
          {SEASON_SPANS.map((span, i) => {
            const { width } = spanBounds(span.startMonth, span.endMonth)
            const isCurrent = span.season === currentSeason
            const isSelected = span.season === selected
            return (
              <button
                key={`${span.season}-${span.startMonth}`}
                type="button"
                onClick={() => setSelected(span.season)}
                aria-pressed={isSelected}
                title={SEASON_LABELS[span.season]}
                style={{ width: `${width}%` }}
                className={[
                  'flex min-w-0 items-center gap-tight-gap px-inline-gap text-left transition-colors duration-fast',
                  'focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus',
                  i > 0 ? 'border-l border-divider-subtle' : '',
                  isSelected
                    ? 'bg-accent-muted'
                    : 'bg-surface-subtle hover:bg-surface-hover',
                ].join(' ')}
              >
                <span
                  className={[
                    'truncate text-label',
                    isSelected ? 'text-accent' : 'text-secondary',
                  ].join(' ')}
                >
                  {SEASON_LABELS[span.season]}
                </span>
                {isCurrent && (
                  <span
                    aria-label="Current stage"
                    className="size-1.5 shrink-0 rounded-full bg-accent"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Flowering lane. */}
        <div className="relative h-8 w-full">
          {hasBloom && (
            <>
              <div
                className="absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-accent"
                style={{ left: `${bloom.left}%`, width: `${bloom.width}%` }}
                role="img"
                aria-label={`Flowers ${MONTH_NAMES[firstMonth - 1]} to ${MONTH_NAMES[lastMonth - 1]}`}
              />
              <div
                className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border border-accent"
                style={{ left: `${bloom.left + bloom.width / 2}%` }}
              >
                <PlantImage
                  src={imageUrl}
                  alt={plantName}
                  fill
                  sizes="24px"
                  className="object-cover"
                />
              </div>
            </>
          )}
        </div>

        {/* Your marks lane. */}
        <div className="relative h-4 w-full">
          {[...byMonth.entries()].map(([month, monthEvents]) => (
            <span
              key={month}
              title={`${MONTH_NAMES[month - 1]}: ${monthEvents
                .map((e) => DIARY_EVENT_LABELS[e.type])
                .join(', ')}`}
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-xs bg-fern-600"
              style={{ left: `${((month - 1) / 12) * 100 + 100 / 24}%` }}
            />
          ))}
        </div>
      </div>

      <div className="flex w-full items-center justify-between text-center text-micro">
        {MONTH_INITIALS.map((month, i) => (
          <span
            key={`${month}-${i}`}
            className={
              getCurrentSeason(new Date(Date.UTC(2000, i, 15))) ===
              currentSeason
                ? 'text-accent'
                : 'text-muted'
            }
          >
            {month}
          </span>
        ))}
      </div>

      {/* The selected stage, in words. Null is the normal value for a stage
          with nothing to describe, so it says so rather than collapsing and
          shifting everything below it. */}
      <p className="text-body leading-normal text-secondary">
        <span className="text-primary">{SEASON_LABELS[selected]}. </span>
        {selectedText ?? 'Nothing recorded for this stage.'}
      </p>

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
  )
}
