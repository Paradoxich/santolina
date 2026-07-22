import { PlantImage } from '@/components/PlantImage'
import type { CatalogPlant } from '@/types/garden'

interface ExplorePlantListRowProps {
  plant: CatalogPlant
  selected?: boolean
  onClick?: () => void
}

export function ExplorePlantListRow({
  plant,
  selected = false,
  onClick,
}: ExplorePlantListRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={[
        'flex w-full items-stretch gap-item-gap rounded-card-row border border-card-translucent p-row-gap text-left transition-colors duration-normal',
        selected ? 'bg-surface-card shadow-soft' : 'hover:bg-surface-subtle',
      ].join(' ')}
    >
      <div className="relative w-[60px] shrink-0 overflow-hidden rounded-sm">
        <PlantImage
          src={plant.imageUrl}
          alt={plant.commonName}
          fill
          sizes="60px"
          className="object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-tight-gap">
        <div className="flex items-baseline gap-item-gap">
          <h3 className="min-w-0 flex-1 truncate text-heading font-semibold text-primary">
            {plant.commonName}
          </h3>
          <p className="shrink-0 text-body-small italic leading-compact tracking-compact text-muted">
            {plant.botanicalName}
          </p>
        </div>
        <p className="line-clamp-2 text-body-small leading-compact tracking-compact text-body-secondary">
          {plant.description}
        </p>
      </div>
    </button>
  )
}

export default ExplorePlantListRow
