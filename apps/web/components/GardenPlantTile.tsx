import Image from 'next/image'
import { Badge, MediaCard } from '@paradoxui/ui'
import { getBloomStatus, type BloomStatus } from '@/lib/bloom-status'
import type { GardenPlant } from '@/types/garden'

// Matches the Growing tab's filter chip labels exactly.
const statusLabels: Record<BloomStatus, string> = {
  blooming: 'Blooming',
  'pre-bloom': 'Pre-bloom',
  resting: 'Resting',
  done: 'Done',
  evergreen: 'Evergreen',
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
        <Badge variant="accent" className="mt-[3px] whitespace-nowrap">
          {statusLabels[bloomStatus]}
        </Badge>
      }
      body={<>❋ {plant.note}</>}
    />
  )
}

export default GardenPlantTile
