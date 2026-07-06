import Image from 'next/image'
import { Panel } from '@paradoxui/ui'
import type { DashboardPlant } from '@/types/dashboard'

interface MyPlantsCardProps {
  plants: DashboardPlant[]
  totalInGarden: number
}

export function MyPlantsCard({ plants, totalInGarden }: MyPlantsCardProps) {
  return (
    <Panel
      title="My plants"
      meta={`${totalInGarden} in garden`}
      className="h-full"
    >
      <div className="flex min-h-0 flex-1 gap-[var(--space-tight-gap)]">
        {plants.map((plant) => (
          <div
            key={plant.name}
            className="relative min-w-0 flex-1 overflow-hidden rounded-[var(--radius-xs)]"
          >
            <Image
              src={plant.imageUrl}
              alt={plant.name}
              fill
              sizes="110px"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/50 to-black/10"
            />
            <span className="absolute bottom-[var(--space-inline-gap)] left-[var(--space-item-gap)] text-[length:var(--font-size-label)] text-[var(--text-image-label)]">
              {plant.name}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export default MyPlantsCard
