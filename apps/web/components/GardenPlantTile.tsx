import Image from 'next/image'
import { MediaCard } from '@paradoxui/ui'
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
        <>
          <Image
            src={plant.imageUrl}
            alt={plant.name}
            fill
            sizes="(max-width: 1280px) 50vw, 360px"
            className="object-cover"
          />
          {/* Bloom status sits on the photo (frosted for contrast over any
              image) rather than by the title. Not the kit Badge: an
              on-media overlay is a distinct treatment, and Badge's variant
              bg can't be reliably overridden until tailwind-merge lands. */}
          <span className="absolute right-inline-gap top-inline-gap inline-flex items-center whitespace-nowrap rounded-full bg-surface-card-translucent px-item-gap py-tight-gap text-label font-medium text-primary shadow-sm backdrop-blur-md">
            {statusLabels[bloomStatus]}
          </span>
        </>
      }
      imageHeight={200}
      title={plant.name}
      body={<>❋ {plant.note}</>}
    />
  )
}

export default GardenPlantTile
