'use client'

/**
 * What the plant does across the year: one row per stage, each row a coloured
 * span showing WHEN over the shared twelve-month axis and a line of text
 * saying WHAT. Then flowering, then anything you logged.
 *
 * The text is on the row rather than behind a click. An earlier pass made the
 * rows selectable and printed one description underneath, which meant six
 * rows that carried only a name and a colour — the same table the reference
 * drawer used to hold, with five sixths of it hidden.
 *
 * Captions start at the left edge instead of following their span: a span
 * beginning in October has almost no room to its right, and a caption that
 * moves per row gives the eye nothing to track down the column.
 *
 * Winter is one row with two spans, because it wraps the year end.
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

interface YearTimelineProps {
  bloomMonths: number[]
  events: TimelineEvent[]
  today: Date
  rhythm: SeasonalRhythm | null
}

/**
 * One row: the spans on the axis, then the caption underneath. Both live in
 * the same relative box so the gridlines behind them line up.
 */
function Row({
  spans,
  color,
  name,
  text,
  emphasis = false,
  children,
}: {
  spans: { left: number; width: number; key: string | number }[]
  color: string
  name: string
  text: string | null
  emphasis?: boolean
  /** Extra marks drawn on the axis, e.g. logged events. */
  children?: React.ReactNode
}) {
  return (
    <div className="relative w-full pb-item-gap pt-inline-gap">
      <div className="relative h-2 w-full">
        {spans.map((span) => (
          <span
            key={span.key}
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${span.left}%`,
              width: `${span.width}%`,
              height: emphasis ? 8 : 4,
              backgroundColor: color,
            }}
          />
        ))}
        {children}
      </div>
      <p
        className="mt-inline-gap truncate text-body-small"
        title={text ?? name}
      >
        <span className={emphasis ? 'text-primary' : 'text-secondary'}>
          {name}
          {text ? '. ' : ''}
        </span>
        <span className="text-muted">{text}</span>
      </p>
    </div>
  )
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

  // Events grouped by month: a month with three waterings gets one mark.
  const byMonth = new Map<number, TimelineEvent[]>()
  for (const event of events) {
    const month = new Date(`${event.date}T12:00:00Z`).getUTCMonth() + 1
    const bucket = byMonth.get(month)
    if (bucket) bucket.push(event)
    else byMonth.set(month, [event])
  }

  const loggedMonths = [...byMonth.keys()].sort((a, b) => a - b)

  return (
    <div className="flex w-full flex-col gap-tight-gap">
      <div className="relative w-full">
        {/* Month gridlines and today, behind every row. */}
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

        {STAGE_ROWS.map((row) => (
          <Row
            key={row.season}
            color={SEASON_COLORS[row.season]}
            emphasis={row.season === currentSeason}
            name={
              SEASON_LABELS[row.season] +
              (row.season === currentSeason ? ' · now' : '')
            }
            text={rhythm?.[row.season] ?? null}
            spans={row.runs.map((run) => ({
              key: run.startMonth,
              ...spanBounds(run.startMonth, run.endMonth),
            }))}
          />
        ))}

        {hasBloom && (
          <Row
            color="var(--color-accent)"
            name="Flowering"
            text={`${MONTH_NAMES[firstMonth - 1]} to ${MONTH_NAMES[lastMonth - 1]}`}
            spans={[{ key: 'bloom', ...bloom }]}
          />
        )}

        {loggedMonths.length > 0 && (
          <Row
            color="transparent"
            name="You logged"
            // Deduped: watering twice in July is one "watered" in the
            // caption, not "watered, watered". The mark already carries
            // that the month had activity; the count is not the point here.
            text={loggedMonths
              .map(
                (m) =>
                  `${MONTH_NAMES[m - 1]!.slice(0, 3)} ${[
                    ...new Set(
                      byMonth
                        .get(m)!
                        .map((e) => DIARY_EVENT_LABELS[e.type].toLowerCase())
                    ),
                  ].join(', ')}`
              )
              .join(' · ')}
            spans={[]}
          >
            {loggedMonths.map((month) => (
              <span
                key={month}
                title={`${MONTH_NAMES[month - 1]}: ${byMonth
                  .get(month)!
                  .map((e) => DIARY_EVENT_LABELS[e.type])
                  .join(', ')}`}
                className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fern-600"
                style={{ left: `${((month - 1) / 12) * 100 + 100 / 24}%` }}
              />
            ))}
          </Row>
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
    </div>
  )
}
