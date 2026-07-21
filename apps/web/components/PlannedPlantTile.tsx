import { Button, IconButton, MediaCard, Icon, Tooltip } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { PlantImage } from '@/components/PlantImage'
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
      surface="inset"
      image={
        <PlantImage
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
              <IconButton
                variant="control"
                size="sm"
                onClick={() => onRemove?.(plant.id)}
                disabled={disabled}
                aria-label={`Remove ${plant.name} from planned`}
              >
                <Icon src={icons.trash} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip content="View details">
            <IconButton
              variant="control"
              size="sm"
              onClick={() => onOpenDetails?.(plant.id)}
              aria-label={`View details for ${plant.name}`}
            >
              <Icon src={icons.info} />
            </IconButton>
          </Tooltip>
          <Button
            variant="control"
            size="sm"
            onClick={() => onMoveToGrowing?.(plant.id)}
            disabled={disabled}
            className="flex-1 justify-between"
          >
            Move to growing
            <Icon src={icons.arrowRight} />
          </Button>
        </>
      }
    />
  )
}

export default PlannedPlantTile
