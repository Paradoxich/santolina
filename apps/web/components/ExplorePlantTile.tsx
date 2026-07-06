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
      className="flex flex-col gap-[var(--space-section-gap)] rounded-[var(--component-card-explore-grid-tile-radius)] border border-[var(--color-border-card)] p-[var(--space-card-padding)] text-left transition-colors duration-[var(--duration-normal)] hover:bg-[var(--color-background-card-subtle)]"
    >
      <div className="relative h-[162px] w-full overflow-hidden rounded-[var(--radius-sm)]">
        <Image
          src={plant.imageUrl}
          alt={plant.commonName}
          fill
          sizes="(max-width: 1280px) 50vw, 360px"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-[var(--space-inline-gap)]">
        <div className="flex flex-col gap-[var(--space-tight-gap)]">
          <h3 className="text-[length:var(--font-size-card-title)] font-semibold text-[var(--text-card-title)]">
            {plant.commonName}
          </h3>
          <p className="text-[length:var(--font-size-body-small)] italic leading-[1.3] tracking-[-0.01em] text-[var(--text-caption)]">
            {plant.botanicalName}
          </p>
        </div>
        <p className="line-clamp-3 text-[length:var(--font-size-body-small)] leading-[1.3] tracking-[-0.01em] text-[var(--text-body-secondary)]">
          {plant.description}
        </p>
      </div>
    </button>
  )
}

export default ExplorePlantTile
