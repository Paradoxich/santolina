import Image from 'next/image'
import { MediaCard, Icon } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import type { GardenPlant } from '@/types/garden'

interface PlannedPlantTileProps {
  plant: GardenPlant
  onRemove?: (id: string) => void
  onMarkAsPlanted?: (id: string) => void
}

export function PlannedPlantTile({
  plant,
  onRemove,
  onMarkAsPlanted,
}: PlannedPlantTileProps) {
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
      imageHeight={148}
      title={plant.name}
      subtitle={plant.caption}
      body={plant.note}
      border="dashed"
      footer={
        <>
          <button
            type="button"
            onClick={() => onRemove?.(plant.id)}
            aria-label={`Remove ${plant.name} from planned`}
            className="flex h-8 items-center justify-center rounded-[6px] border border-card p-inline-gap transition-colors duration-normal hover:bg-surface-overlay"
          >
            <Icon src={icons.trash} />
          </button>
          <button
            type="button"
            onClick={() => onMarkAsPlanted?.(plant.id)}
            className="flex h-8 flex-1 items-center gap-inline-gap rounded-sm bg-surface-control p-inline-gap text-body-small text-primary transition-colors duration-normal hover:bg-gray-0"
          >
            <span className="flex-1 text-left">Mark as planted</span>
            <Icon src={icons.arrowRight} />
          </button>
        </>
      }
    />
  )
}

export default PlannedPlantTile
