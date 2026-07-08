import Image from 'next/image'
import { MediaCard } from '@paradoxui/ui'
import { getBloomStatus, type BloomStatus } from '@/lib/bloom-status'
import type { GardenPlant } from '@/types/garden'

const statusLabels: Record<BloomStatus, string> = {
  blooming: 'blooming',
  'pre-bloom': 'pre bloom',
  resting: 'resting',
  done: 'done',
  evergreen: 'evergreen',
}

interface GardenPlantTileProps {
  plant: GardenPlant
  onClick?: () => void
}

export function GardenPlantTile({ plant, onClick }: GardenPlantTileProps) {
  const bloomStatus = getBloomStatus(plant.bloomMonths)

  return (
    <MediaCard
      as="button"
      onClick={onClick}
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
          {statusLabels[bloomStatus]}
        </span>
      }
      body={<>❋ {plant.note}</>}
    />
  )
}

export default GardenPlantTile
