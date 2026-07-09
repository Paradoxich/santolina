import Image from 'next/image'
import { MediaCard, Icon, Tooltip } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import type { GardenPlant } from '@/types/garden'

interface PlannedPlantTileProps {
  plant: GardenPlant
  onRemove?: (id: string) => void
  onMoveToGrowing?: (id: string) => void
  onOpenDetails?: (id: string) => void
  disabled?: boolean
}

export function PlannedPlantTile({
  plant,
  onRemove,
  onMoveToGrowing,
  onOpenDetails,
  disabled = false,
}: PlannedPlantTileProps) {
  return (
    <MediaCard
      surface="sunken"
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
          <Tooltip content="Remove from planned">
            {/* Span carries the hover handlers: a disabled button doesn't
                reliably fire mouse events. */}
            <span className="inline-flex">
              <button
                type="button"
                onClick={() => onRemove?.(plant.id)}
                disabled={disabled}
                aria-label={`Remove ${plant.name} from planned`}
                className="flex h-8 items-center justify-center rounded-[6px] border border-card p-inline-gap transition-colors duration-normal hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon src={icons.trash} />
              </button>
            </span>
          </Tooltip>
          <Tooltip content="View details">
            <button
              type="button"
              onClick={() => onOpenDetails?.(plant.id)}
              aria-label={`View details for ${plant.name}`}
              className="flex h-8 items-center justify-center rounded-[6px] border border-card p-inline-gap transition-colors duration-normal hover:bg-surface-overlay"
            >
              <Icon src={icons.info} />
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={() => onMoveToGrowing?.(plant.id)}
            disabled={disabled}
            className="flex h-8 flex-1 items-center gap-inline-gap rounded-sm bg-surface-control p-inline-gap text-body-small text-primary transition-colors duration-normal hover:bg-gray-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex-1 text-left">Move to growing</span>
            <Icon src={icons.arrowRight} />
          </button>
        </>
      }
    />
  )
}

export default PlannedPlantTile
