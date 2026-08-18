'use client'

import { Icon, Menu } from '@paradoxui/ui'
import type { MenuChoice } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { bloomStatusLabels } from '@/components/BloomStatusBadge'
import type { DisplayBloomStatus } from '@/lib/bloom-status'

export type StatusFilter = 'all' | DisplayBloomStatus

// Small solid dot echoing each status chip's hue, so the menu reads as a
// colour legend. 'all' gets a hollow ring — "no filter".
const dotColors: Record<StatusFilter, string> = {
  all: 'border border-sage-600',
  blooming: 'bg-brick-500',
  'pre-bloom': 'bg-honey-500',
  resting: 'bg-sage-500',
  evergreen: 'bg-fern-500',
}

const order: StatusFilter[] = [
  'all',
  'blooming',
  'pre-bloom',
  'resting',
  'evergreen',
]

const labels: Record<StatusFilter, string> = {
  all: 'All plants',
  ...bloomStatusLabels,
}

const Dot = ({ status }: { status: StatusFilter }) => (
  <span className={`inline-block size-2 rounded-full ${dotColors[status]}`} />
)

interface StatusFilterMenuProps {
  value: StatusFilter
  onChange: (value: StatusFilter) => void
  /** Plant count per status, for the menu labels. */
  counts: Record<StatusFilter, number>
}

/**
 * A low-emphasis status filter: a small filter icon that opens a menu of
 * bloom statuses with their counts. Sits at the end of the list's description
 * line, so filtering is available without competing with the plants.
 *
 * A menu rather than a Select even though it picks a value: Select is
 * field-shaped and would put a full-width control where the point is a 40px
 * icon that does not compete with the plants. The value lives in the trigger's
 * accessible name instead, and the items are `menuitemradio` — which is what
 * ARIA provides for a menu that chooses one of a set.
 */
export function StatusFilterMenu({
  value,
  onChange,
  counts,
}: StatusFilterMenuProps) {
  const active = value !== 'all'
  const items: MenuChoice[] = order.map((status) => ({
    label: `${labels[status]} (${counts[status]})`,
    icon: <Dot status={status} />,
    // A status with no plants can't be filtered to an empty list.
    disabled: status !== 'all' && counts[status] === 0,
    // These are choices, not actions: exactly one is in effect. As plain
    // menuitems they announced no state, so a screen reader user heard five
    // options and never which one was filtering the list.
    selected: status === value,
    onSelect: () => onChange(status),
  }))

  return (
    <Menu
      intent="choices"
      label={active ? `Filter by status: ${labels[value]}` : 'Filter by status'}
      items={items}
      align="end"
      // Matches the Explore filter trigger: a bordered surface-card box with a
      // sage hairline that lightens on hover, and an accent dot when active.
      triggerClassName="relative flex size-10 items-center justify-center rounded-md border bg-surface-card text-secondary transition-colors duration-normal [border-color:var(--color-sage-100)] hover:[border-color:var(--color-sage-50)]"
      trigger={
        <>
          <Icon src={icons.filter} />
          {active && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 size-1.5 rounded-full bg-accent"
            />
          )}
        </>
      }
    />
  )
}

export default StatusFilterMenu
