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

const cardLinkClassName =
  'flex h-full rounded-card-dashboard focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * A read module, not a capture surface — capture is the add-note dialog,
 * reachable from anywhere. The whole card opens the activity page; rows are
 * a teaser (date + what the note was about).
 */
export function RecentActivityCard({
  entries,
  count = 3,
}: RecentActivityCardProps) {
  const recent = entries.slice(0, count)

  if (recent.length === 0) {
    return (
      <Link href="/overview/activity" className={cardLinkClassName}>
        <Panel
          title="Recent activity"
          className="relative isolate min-h-[280px] w-full overflow-hidden lg:h-full lg:min-h-0"
        >
          <CardIllustration name="activity" />
          <p className="mt-auto max-w-[55%] text-body-small text-muted">
            Nothing logged yet.
          </p>
        </Panel>
      </Link>
    )
  }

  return (
    <Link href="/overview/activity" className={cardLinkClassName}>
      <Panel
        title="Recent activity"
        meta={`${recent.length} recent`}
        className="h-full w-full"
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
      </Panel>
    </Link>
  )
}

export default RecentActivityCard
