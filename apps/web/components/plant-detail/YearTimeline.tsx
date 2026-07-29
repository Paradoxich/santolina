'use client'

/**
 * What the plant does across the year, drawn like the dashboard's bloom
 * chart: one track per thing, each a coloured span sitting on its own row
 * over a shared twelve-month axis. No plant thumbnails — every row here
 * belongs to the same plant, so a repeated photo would carry no information.
 *
 * Rows are the six seasonal_rhythm stages, then the flowering window, then
 * anything you logged. Selecting a stage row reads out its rhythm text,
 * which is why this replaced the bloom-only strip: that strip drew one fact
 * the hero already states, while the rhythm text sat in a table in the
 * reference drawer saying the same thing somewhere else.
 *
 * Winter is one row with two spans, because it wraps the year end.
 */

import { useState } from 'react'
import { DIARY_EVENT_LABELS, type DiaryEventType } from '@/lib/diary-events'
import {
  SEASON_COLORS,
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

/** Row pitch in px — matches the dashboard chart's comfortable span spacing. */
const ROW_HEIGHT = 28

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

/** The six stages in seasonal_rhythm order, each with its calendar runs. */
const STAGE_ROWS: { season: Season; runs: typeof SEASON_SPANS }[] = (
  Object.keys(SEASON_LABELS) as Season[]
).map((season) => ({
  season,
  runs: SEASON_SPANS.filter((s) => s.season === season),
}))

interface YearTimelineProps {
  bloomMonths: number[]
  events: TimelineEvent[]
  today: Date
  rhythm: SeasonalRhythm | null
}

export function YearTimeline({
  bloomMonths,
  events,
  today,
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

  const extraRows = (hasBloom ? 1 : 0) + (byMonth.size > 0 ? 1 : 0)
  const chartHeight = (STAGE_ROWS.length + extraRows) * ROW_HEIGHT
  const selectedText = rhythm?.[selected] ?? null

  /** Row label, sitting just left of its span when there is room. */
  const rowLabel = (
    text: string,
    left: number,
    muted = false,
    strong = false
  ) => (
    <span
      className={[
        'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-micro',
        strong ? 'text-primary' : muted ? 'text-muted' : 'text-secondary',
      ].join(' ')}
      style={
        left > 50
          ? { right: `${100 - left}%`, marginRight: 8 }
          : { left: `${left}%`, marginLeft: 8 }
      }
    >
      {text}
    </span>
  )

  return (
    <div className="flex w-full flex-col gap-item-gap">
      <div className="relative w-full" style={{ height: chartHeight }}>
        {/* Month gridlines behind every row. */}
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

        <div
          aria-hidden="true"
          className="absolute top-0 h-full w-px bg-accent"
          style={{ left: `${todayLeft}%` }}
        />

        {/* One row per stage. */}
        {STAGE_ROWS.map((row, i) => {
          const isSelected = row.season === selected
          const isCurrent = row.season === currentSeason
          const firstRun = row.runs[0]!
          const labelAt = spanBounds(firstRun.startMonth, firstRun.endMonth)
          return (
            <button
              key={row.season}
              type="button"
              onClick={() => setSelected(row.season)}
              aria-pressed={isSelected}
              // Every stage is equally real, so selection is weight rather
              // than opacity: dimming five of six rows washed the chart out
              // and read as "these ones do not count".
              className="absolute inset-x-0 rounded-xs text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              {row.runs.map((run) => {
                const { left, width } = spanBounds(run.startMonth, run.endMonth)
                return (
                  <span
                    key={run.startMonth}
                    className="absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-fast"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      height: isSelected ? 8 : 4,
                      backgroundColor: SEASON_COLORS[row.season],
                    }}
                  />
                )
              })}
              {rowLabel(
                `${SEASON_LABELS[row.season]}${isCurrent ? ' · now' : ''}`,
                labelAt.left + labelAt.width,
                false,
                isSelected
              )}
            </button>
          )
        })}

        {/* Flowering, its own row in the accent colour. */}
        {hasBloom && (
          <div
            className="absolute inset-x-0"
            style={{ top: STAGE_ROWS.length * ROW_HEIGHT, height: ROW_HEIGHT }}
          >
            <span
              role="img"
              aria-label={`Flowers ${MONTH_NAMES[firstMonth - 1]} to ${MONTH_NAMES[lastMonth - 1]}`}
              className="absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${bloom.left}%`, width: `${bloom.width}%` }}
            />
            {rowLabel('Flowering', bloom.left + bloom.width)}
          </div>
        )}

        {/* What you logged, its own row. */}
        {byMonth.size > 0 && (
          <div
            className="absolute inset-x-0"
            style={{
              top: (STAGE_ROWS.length + (hasBloom ? 1 : 0)) * ROW_HEIGHT,
              height: ROW_HEIGHT,
            }}
          >
            {[...byMonth.entries()].map(([month, monthEvents]) => (
              <span
                key={month}
                title={`${MONTH_NAMES[month - 1]}: ${monthEvents
                  .map((e) => DIARY_EVENT_LABELS[e.type])
                  .join(', ')}`}
                className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fern-600"
                style={{ left: `${((month - 1) / 12) * 100 + 100 / 24}%` }}
              />
            ))}
            {rowLabel(
              'You logged',
              (Math.max(...byMonth.keys()) / 12) * 100,
              true
            )}
          </div>
        )}
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
          with nothing to describe, so it says so rather than collapsing. */}
      <p className="text-body leading-normal text-secondary">
        <span className="text-primary">{SEASON_LABELS[selected]}. </span>
        {selectedText ?? 'Nothing recorded for this stage.'}
      </p>
    </div>
  )
}
