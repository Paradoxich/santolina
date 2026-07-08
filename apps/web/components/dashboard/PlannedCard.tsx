import Image from 'next/image'
import { Panel } from '@paradoxui/ui'
import type { PlannedPlant } from '@/types/dashboard'

interface PlannedCardProps {
  plants: PlannedPlant[]
}

export function PlannedCard({ plants }: PlannedCardProps) {
  if (plants.length === 0) {
    return (
      <Panel title="Planned" meta="0 plants" className="h-full">
        <p className="text-body-small text-muted">Nothing planned yet.</p>
      </Panel>
    )
  }

  return (
    <Panel title="Planned" meta={`${plants.length} plants`} className="h-full">
      <ul className="flex w-full flex-col gap-item-gap">
        {plants.map((plant) => (
          <li
            key={plant.name}
            className="flex w-full items-center justify-between gap-row-gap"
          >
            <span className="flex min-w-0 items-center gap-tight-gap">
              <span className="relative size-5 shrink-0 overflow-hidden rounded-xs bg-surface-subtle">
                {plant.imageUrl && (
                  <Image
                    src={plant.imageUrl}
                    alt=""
                    fill
                    sizes="20px"
                    className="object-cover"
                  />
                )}
              </span>
              <span className="truncate text-body-small text-primary">
                {plant.name}
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-label text-muted">
              {plant.months}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default PlannedCard
