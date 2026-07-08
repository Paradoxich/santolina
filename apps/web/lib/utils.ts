/**
 * Utility helpers for the Santolina web app.
 */

/**
 * Returns the number of days since a given date.
 */
export function daysSince(date: Date): number {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Formats a date as a human-readable string.
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

/**
 * Parses an ISO date string (YYYY-MM-DD) as a local date,
 * avoiding the UTC shift of `new Date('YYYY-MM-DD')`.
 */
export function parseISODate(iso: string): Date {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Formats an ISO date as a short day label, e.g. "May 8".
 */
export function formatDayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parseISODate(iso))
}

/**
 * Formats an ISO date as its month name, e.g. "May".
 */
export function formatMonthLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
    parseISODate(iso)
  )
}

/**
 * Joins class names, filtering out falsy values.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
]

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'always',
  style: 'long',
})

/**
 * Formats an ISO timestamp as "2 days ago" style relative time.
 * `numeric: 'always'` keeps it consistently "X ago" rather than Intl's
 * idiomatic "yesterday"/"last week" phrasing for the 1-unit case.
 */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date()
): string {
  const diffSec = Math.round((now.getTime() - new Date(iso).getTime()) / 1000)

  for (const [unit, secondsInUnit] of RELATIVE_TIME_UNITS) {
    if (diffSec >= secondsInUnit) {
      return relativeTimeFormatter.format(
        -Math.floor(diffSec / secondsInUnit),
        unit
      )
    }
  }
  return relativeTimeFormatter.format(-Math.max(diffSec, 0), 'second')
}
