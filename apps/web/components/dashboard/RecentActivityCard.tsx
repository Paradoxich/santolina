import Link from 'next/link'
import { Panel } from '@paradoxui/ui'
import { CardIllustration } from './CardIllustration'
import { activityDotColors } from '@/lib/sample-dashboard'
import { formatDayLabel } from '@/lib/utils'
import type { RecentActivityEntry } from '@/lib/diary'

interface RecentActivityCardProps {
  entries: RecentActivityEntry[]
  /** How many recent entries to show */
  count?: number
}

/**
 * A read module, not a destination and not a capture surface — capture is
 * the add-note dialog, reachable from anywhere. Rows are a teaser (date +
 * what the note was about); the full text, photos, and events live on the
 * activity page this links to.
 */
export function RecentActivityCard({
  entries,
  count = 3,
}: RecentActivityCardProps) {
  const recent = entries.slice(0, count)

  if (recent.length === 0) {
    return (
      <Panel
        title="Recent activity"
        className="relative isolate min-h-[280px] overflow-hidden lg:h-full lg:min-h-0"
      >
        <CardIllustration name="activity" />
        <p className="mt-auto max-w-[55%] text-body-small text-muted">
          Nothing logged yet.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Recent activity"
      meta={`${recent.length} recent`}
      className="h-full"
    >
      <ul className="flex w-full flex-col">
        {recent.map((entry, i) => (
          <li
            key={entry.id}
            className="flex w-full items-center gap-row-gap border-b border-divider py-item-gap"
          >
            <span className="w-[38px] shrink-0 text-label text-muted">
              {formatDayLabel(entry.date)}
            </span>
            <span className="flex min-w-0 items-center gap-tight-gap">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-xs"
                style={{
                  backgroundColor:
                    activityDotColors[i % activityDotColors.length],
                }}
              />
              <span className="truncate text-body text-primary">
                {entry.plantName ?? 'Your garden'}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/overview/activity"
        className="mt-item-gap w-fit text-body-small text-secondary underline-offset-2 transition-colors duration-normal hover:text-primary hover:underline"
      >
        See all activity
      </Link>
    </Panel>
  )
}

export default RecentActivityCard
