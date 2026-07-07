import Image from 'next/image'
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
    <article className="flex flex-col gap-section-gap rounded-card-dashboard border border-dashed border-card bg-[rgba(255,255,255,0.2)] p-card-padding">
      <div className="relative h-[148px] w-full overflow-hidden rounded-sm">
        <Image
          src={plant.imageUrl}
          alt={plant.name}
          fill
          sizes="(max-width: 1280px) 50vw, 360px"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-inline-gap">
        <div className="flex flex-col gap-tight-gap">
          <h3 className="text-heading font-semibold text-primary">
            {plant.name}
          </h3>
          {plant.caption && (
            <p className="text-body-small italic leading-compact tracking-compact text-muted">
              {plant.caption}
            </p>
          )}
        </div>
        <p className="text-body-small leading-compact tracking-compact text-secondary">
          {plant.note}
        </p>
      </div>
      <div className="flex items-start gap-item-gap">
        <button
          type="button"
          onClick={() => onRemove?.(plant.id)}
          aria-label={`Remove ${plant.name} from planned`}
          className="flex h-8 items-center justify-center rounded-[6px] border border-card p-inline-gap transition-colors duration-normal hover:bg-surface-overlay"
        >
          <Image src="/icons/icon-trash.svg" alt="" width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => onMarkAsPlanted?.(plant.id)}
          className="flex h-8 flex-1 items-center gap-inline-gap rounded-sm bg-surface-control p-inline-gap text-body-small text-primary transition-colors duration-normal hover:bg-gray-0"
        >
          <span className="flex-1 text-left">Mark as planted</span>
          <Image
            src="/icons/icon-arrow-right.svg"
            alt=""
            width={16}
            height={16}
          />
        </button>
      </div>
    </article>
  )
}

export default PlannedPlantTile
