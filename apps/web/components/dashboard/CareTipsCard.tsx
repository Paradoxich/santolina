import { Panel } from '@paradoxui/ui'
import type { CareTip } from '@/types/dashboard'

interface CareTipsCardProps {
  tips: CareTip[]
}

export function CareTipsCard({ tips }: CareTipsCardProps) {
  return (
    <Panel
      title="Care tips"
      meta={`${tips.length} tasks`}
      className="relative h-full overflow-hidden"
    >
      <ul className="flex w-full flex-col gap-[var(--space-tight-gap)]">
        {tips.map((tip) => (
          <li
            key={tip.id}
            className="flex h-10 w-full items-center justify-between gap-[var(--space-row-gap)] rounded-[var(--radius-sm)] bg-[var(--color-background-card-subtle)] px-[var(--space-item-gap)] py-[var(--space-inline-gap)]"
          >
            <span className="truncate text-[length:var(--font-size-body)] text-[var(--text-task-label)]">
              {tip.text}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[length:var(--font-size-label)] text-[var(--text-meta)]">
              {tip.due}
            </span>
          </li>
        ))}
      </ul>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[71px] bg-gradient-to-t from-[var(--color-background-card)] to-transparent"
      />
    </Panel>
  )
}

export default CareTipsCard
