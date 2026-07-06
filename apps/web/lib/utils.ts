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
