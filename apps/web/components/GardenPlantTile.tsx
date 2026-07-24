import { MediaCard } from '@paradoxui/ui'
import { PlantImage } from '@/components/PlantImage'
import { BloomStatusBadge } from '@/components/BloomStatusBadge'
import { getBloomStatus, toDisplayStatus } from '@/lib/bloom-status'
import type { GardenPlant } from '@/types/garden'

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
      imageHeight={240}
      title={plant.name}
      // Description line: the status as a compact chip, then the terse field
      // note the status alone can't carry (see getStageNote).
      body={
        <span className="inline-flex items-center gap-inline-gap">
          <BloomStatusBadge status={bloomStatus} />
          {plant.stageNote}
        </span>
      }
    />
  )
}

export default GardenPlantTile
