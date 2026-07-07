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
      <ul className="flex w-full flex-col gap-tight-gap">
        {tips.map((tip) => (
          <li
            key={tip.id}
            className="flex h-10 w-full items-center justify-between gap-row-gap rounded-sm bg-surface-subtle px-item-gap py-inline-gap"
          >
            <span className="truncate text-body text-primary">{tip.text}</span>
            <span className="shrink-0 whitespace-nowrap text-label text-muted">
              {tip.due}
            </span>
          </li>
        ))}
      </ul>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[71px] bg-gradient-to-t from-[var(--color-surface-card)] to-transparent"
      />
    </Panel>
  )
}

export default CareTipsCard
