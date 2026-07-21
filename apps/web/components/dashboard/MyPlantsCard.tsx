import Link from 'next/link'
import { Panel } from '@paradoxui/ui'
import { PlantImage } from '@/components/PlantImage'
import type { DashboardPlant } from '@/types/dashboard'
import { CardIllustration } from './CardIllustration'

interface MyPlantsCardProps {
  plants: DashboardPlant[]
  totalInGarden: number
}

export function MyPlantsCard({ plants, totalInGarden }: MyPlantsCardProps) {
  if (plants.length === 0) {
    return (
      <Panel
        title="My plants"
        className="relative isolate min-h-[380px] overflow-hidden lg:min-h-0 lg:h-full"
      >
        <CardIllustration name="myPlants" />
        {/* The bush is centred and runs full-width on a narrow card, so on
            mobile the hint sits under the title (clear of the art) and only
            drops to the bottom-left at desktop, matching the comp. */}
        <p className="max-w-48 text-body-small text-muted lg:mt-auto">
          Nothing growing yet.
        </p>
      </Panel>
    )
  }

  return (
    <Link
      href="/plants"
      className="flex h-[220px] rounded-card-dashboard transition-colors duration-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:h-full"
    >
      <Panel
        title="My plants"
        meta={`${totalInGarden} in garden`}
        className="h-full w-full cursor-pointer"
      >
        <div className="flex min-h-0 flex-1 gap-tight-gap">
          {plants.map((plant) => (
            <div
              key={plant.name}
              className="relative min-w-0 flex-1 overflow-hidden rounded-sm"
            >
              <PlantImage
                src={plant.imageUrl}
                alt={plant.name}
                fill
                sizes="110px"
                className="object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[image:var(--thumbnail-scrim)]"
              />
              <span className="absolute bottom-inline-gap left-item-gap text-label text-inverse">
                {plant.name}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </Link>
  )
}

export default MyPlantsCard
