import Image from 'next/image'
import { MediaCard } from '@paradoxui/ui'
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
    <MediaCard
      image={
        <Image
          src={plant.imageUrl}
          alt={plant.name}
          fill
          sizes="(max-width: 1280px) 50vw, 360px"
          className="object-cover"
        />
      }
      imageHeight={200}
      title={plant.name}
      titleAdornment={
        <span className="mt-[3px] inline-flex items-center justify-center rounded-md bg-accent-muted px-tight-gap pb-[3px] pt-tight-gap text-label leading-none text-accent">
          {statusLabels[plant.status]}
        </span>
      }
      body={<>❋ {plant.note}</>}
    />
  )
}

export default GardenPlantTile
