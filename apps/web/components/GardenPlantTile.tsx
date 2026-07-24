import { MediaCard } from '@paradoxui/ui'
import { PlantImage } from '@/components/PlantImage'
import {
  getBloomStatus,
  toDisplayStatus,
  type DisplayBloomStatus,
} from '@/lib/bloom-status'
import type { GardenPlant } from '@/types/garden'

// Matches the Growing tab's filter chip labels exactly.
const statusLabels: Record<DisplayBloomStatus, string> = {
  blooming: 'Blooming',
  'pre-bloom': 'Pre-bloom',
  resting: 'Resting',
  evergreen: 'Evergreen',
}

interface GardenPlantTileProps {
  plant: GardenPlant
  onClick?: () => void
}

export function GardenPlantTile({ plant, onClick }: GardenPlantTileProps) {
  const bloomStatus = toDisplayStatus(getBloomStatus(plant.bloomMonths))

  return (
    <MediaCard
      as="button"
      onClick={onClick}
      image={
        <PlantImage
          src={plant.imageUrl}
          alt={plant.name}
          fill
          sizes="(max-width: 1280px) 50vw, 360px"
          className="object-cover"
        />
      }
      imageHeight={200}
      title={plant.name}
      // Status + terse field note in one line (see getStageNote). The note says
      // what the status label alone can't; always present, so the line never
      // reads as an orphan marker.
      body={
        <>
          {statusLabels[bloomStatus]}
          <span aria-hidden="true"> · </span>
          {plant.stageNote}
        </>
      }
    />
  )
}

export default GardenPlantTile
