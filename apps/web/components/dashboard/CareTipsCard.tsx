import { Panel } from '@paradoxui/ui'
import type { CareTip } from '@/types/dashboard'

interface CareTipsCardProps {
  tips: CareTip[]
  /** True when the palette is empty — shows a hint above the generic seasonal tips. */
  showEmptyHint?: boolean
}

export function CareTipsCard({
  tips,
  showEmptyHint = false,
}: CareTipsCardProps) {
  return (
    <Panel
      title="Care tips"
      meta={`${tips.length} tasks`}
      className="relative h-full overflow-hidden"
    >
      {showEmptyHint && (
        <p className="mb-inline-gap text-body-small text-muted">
          Add plants to your garden for tips tailored to what you&apos;re
          growing.
        </p>
      )}
      <ul className="flex w-full flex-col gap-tight-gap">
        {tips.map((tip, index) => (
          <li
            key={`${tip.plantId ?? 'general'}-${index}`}
            className="flex h-10 w-full items-center justify-between gap-row-gap rounded-sm bg-surface-subtle px-item-gap py-inline-gap"
          >
            <span className="truncate text-body text-primary">{tip.text}</span>
            {tip.plantName && (
              <span className="shrink-0 whitespace-nowrap text-label text-muted">
                {tip.plantName}
              </span>
            )}
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
