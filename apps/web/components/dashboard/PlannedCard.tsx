import Image from 'next/image'
import { Panel } from '@paradoxui/ui'
import type { PlannedPlant } from '@/types/dashboard'

interface PlannedCardProps {
  plants: PlannedPlant[]
}

export function PlannedCard({ plants }: PlannedCardProps) {
  return (
    <Panel title="Planned" meta={`${plants.length} plants`} className="h-full">
      <ul className="flex w-full flex-col gap-[var(--space-item-gap)]">
        {plants.map((plant) => (
          <li
            key={plant.name}
            className="flex w-full items-center justify-between gap-[var(--space-row-gap)]"
          >
            <span className="flex min-w-0 items-center gap-[var(--space-tight-gap)]">
              <span className="relative size-5 shrink-0 overflow-hidden rounded-[var(--radius-xs)]">
                <Image
                  src={plant.imageUrl}
                  alt=""
                  fill
                  sizes="20px"
                  className="object-cover"
                />
              </span>
              <span className="truncate text-[length:var(--font-size-body-small)] text-[var(--text-list-title)]">
                {plant.name}
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-[length:var(--font-size-label)] text-[var(--text-meta)]">
              {plant.months}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default PlannedCard
