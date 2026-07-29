'use client'

/**
 * What the plant does across the year. One row per stage; each stage is a
 * block occupying exactly the months it covers, with its name and what
 * happens written inside it. Then flowering, then anything you logged.
 *
 * Blocks rather than 4px rules because the text lives in them: a rule can
 * only carry a caption beside it, and a caption beside a span either collides
 * with the next row or drifts away from the months it describes.
 *
 * Row height is content-driven — a one-month stage is a narrow column and
 * needs more height for the same sentence than a two-month one. Nothing is
 * clamped, so no stage's description is silently cut off.
 *
 * Winter is one row with two blocks, because it wraps the year end; the text
 * sits in the wider of the two.
 */

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

/** The block's fill: its colour, well diluted so the text stays readable. */
function tint(hex: string, alpha: string): string {
  return `${hex}${alpha}`
}

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
  const todayLeft = positionOf(today)

  const hasBloom = bloomMonths.length > 0
  const firstMonth = hasBloom ? Math.min(...bloomMonths) : 0
  const lastMonth = hasBloom ? Math.max(...bloomMonths) : 0
  const bloom = spanBounds(firstMonth, lastMonth)

  // Events grouped by month: a month with three waterings gets one block.
  const byMonth = new Map<number, TimelineEvent[]>()
  for (const event of events) {
    const month = new Date(`${event.date}T12:00:00Z`).getUTCMonth() + 1
    const bucket = byMonth.get(month)
    if (bucket) bucket.push(event)
    else byMonth.set(month, [event])
  }
  const loggedMonths = [...byMonth.keys()].sort((a, b) => a - b)

  return (
    <div className="relative flex w-full flex-col gap-tight-gap">
      {/* Month gridlines and today, behind every row. */}
      <div aria-hidden="true" className="absolute inset-0 flex justify-between">
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

      {STAGE_ROWS.map((row) => {
        const isCurrent = row.season === currentSeason
        const color = SEASON_COLORS[row.season]
        const text = rhythm?.[row.season] ?? null
        // The widest run carries the text; a December sliver cannot hold it.
        const widest = [...row.runs].sort(
          (a, b) => b.endMonth - b.startMonth - (a.endMonth - a.startMonth)
        )[0]!
        return (
          <div key={row.season} className="relative w-full">
            {row.runs.map((run) => {
              const { left, width } = spanBounds(run.startMonth, run.endMonth)
              const carriesText = run.startMonth === widest.startMonth
              return (
                <div
                  key={run.startMonth}
                  className={[
                    carriesText ? 'relative' : 'absolute top-0 h-full',
                    'overflow-hidden rounded-sm border-t-2 px-inline-gap py-inline-gap',
                  ].join(' ')}
                  style={{
                    marginLeft: carriesText ? `${left}%` : undefined,
                    left: carriesText ? undefined : `${left}%`,
                    width: `${width}%`,
                    backgroundColor: tint(color, isCurrent ? '4d' : '2e'),
                    borderTopColor: color,
                  }}
                >
                  {carriesText && (
                    <>
                      <p
                        className={[
                          'text-label',
                          isCurrent ? 'text-primary' : 'text-secondary',
                        ].join(' ')}
                      >
                        {SEASON_LABELS[row.season]}
                        {isCurrent && ' · now'}
                      </p>
                      {text && (
                        <p className="mt-tight-gap text-body-small leading-snug text-secondary">
                          {text}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {hasBloom && (
        <div className="relative w-full">
          <div
            className="relative overflow-hidden rounded-sm border-t-2 border-t-accent bg-accent-muted px-inline-gap py-inline-gap"
            style={{ marginLeft: `${bloom.left}%`, width: `${bloom.width}%` }}
          >
            <p className="text-label text-accent">Flowering</p>
            <p className="mt-tight-gap text-body-small leading-snug text-secondary">
              {MONTH_NAMES[firstMonth - 1]} to {MONTH_NAMES[lastMonth - 1]}
            </p>
          </div>
        </div>
      )}

      {loggedMonths.length > 0 && (
        <div className="relative h-9 w-full">
          {loggedMonths.map((month) => {
            const { left, width } = spanBounds(month, month)
            const labels = [
              ...new Set(
                byMonth.get(month)!.map((e) => DIARY_EVENT_LABELS[e.type])
              ),
            ]
            return (
              <div
                key={month}
                title={`${MONTH_NAMES[month - 1]}: ${labels.join(', ')}`}
                className="absolute top-0 flex h-full items-center overflow-hidden rounded-sm border-t-2 border-t-fern-600 bg-fern-100 px-inline-gap"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <p className="truncate text-label text-secondary">
                  {labels.join(', ')}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <div className="relative flex w-full items-center justify-between text-center text-micro">
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
    </div>
  )
}
