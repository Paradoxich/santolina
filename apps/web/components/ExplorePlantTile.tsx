import Image from 'next/image'
import type { CatalogPlant } from '@/types/garden'

interface ExplorePlantTileProps {
  plant: CatalogPlant
  onClick?: () => void
}

export function ExplorePlantTile({ plant, onClick }: ExplorePlantTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-section-gap rounded-card-tile border border-card p-card-padding text-left transition-colors duration-normal hover:bg-surface-subtle"
    >
      <div className="relative h-[162px] w-full overflow-hidden rounded-sm">
        <Image
          src={plant.imageUrl}
          alt={plant.commonName}
          fill
          sizes="(max-width: 1280px) 50vw, 360px"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-inline-gap">
        <div className="flex flex-col gap-tight-gap">
          <h3 className="text-heading font-semibold text-primary">
            {plant.commonName}
          </h3>
          <p className="text-body-small italic leading-compact tracking-compact text-muted">
            {plant.botanicalName}
          </p>
        </div>
        <p className="line-clamp-3 text-body-small leading-compact tracking-compact text-body-secondary">
          {plant.description}
        </p>
      </div>
    </button>
  )
}

export default ExplorePlantTile
