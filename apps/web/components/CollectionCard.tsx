import { PlantImage } from '@/components/PlantImage'
import type { CatalogPlant } from '@/types/garden'

interface CollectionCardProps {
  plant: CatalogPlant
  onClick?: () => void
}

/**
 * An image-forward plant card for the browse shelves: a tall photo over the
 * common + botanical name, no description (the shelves lead with the visuals).
 * Shares the tile chrome with `MediaCard` but owns its own image treatment.
 */
export function CollectionCard({ plant, onClick }: CollectionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-item-gap rounded-card-tile border border-card bg-surface-card p-card-padding text-left transition-colors duration-normal hover:bg-surface-subtle"
    >
      <div className="relative h-[272px] w-full shrink-0 overflow-hidden rounded-md">
        <PlantImage
          src={plant.imageUrl}
          alt={plant.commonName}
          fill
          sizes="330px"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-tight-gap">
        <p className="text-body-small italic text-muted">
          {plant.botanicalName}
        </p>
        <h3 className="text-heading font-semibold text-primary">
          {plant.commonName}
        </h3>
      </div>
    </button>
  )
}

export default CollectionCard
