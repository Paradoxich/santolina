import Image from 'next/image'
import type { GardenPlant, BloomStatus } from '@/types/garden'

const statusLabels: Record<BloomStatus, string> = {
  blooming: 'blooming',
  'pre-bloom': 'pre bloom',
  resting: 'resting',
  done: 'done',
}

interface GardenPlantTileProps {
  plant: GardenPlant
}

export function GardenPlantTile({ plant }: GardenPlantTileProps) {
  return (
    <article className="flex flex-col gap-item-gap rounded-card-dashboard border border-card bg-[rgba(255,255,255,0.2)] p-card-padding">
      <div className="relative h-[200px] w-full overflow-hidden rounded-md">
        <Image
          src={plant.imageUrl}
          alt={plant.name}
          fill
          sizes="(max-width: 1280px) 50vw, 360px"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-item-gap">
        <div className="flex items-start gap-inline-gap">
          <h3 className="text-heading font-semibold text-primary">
            {plant.name}
          </h3>
          <span className="mt-[3px] inline-flex items-center justify-center rounded-md bg-accent-muted px-tight-gap pb-[3px] pt-tight-gap text-label leading-none text-accent">
            {statusLabels[plant.status]}
          </span>
        </div>
        <p className="text-body-small tracking-compact text-secondary">
          ❋ {plant.note}
        </p>
      </div>
    </article>
  )
}

export default GardenPlantTile
