import Image from 'next/image'
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
        'flex w-full items-start gap-item-gap rounded-card-row border p-item-gap text-left shadow-sm transition-colors duration-normal',
        selected
          ? 'border-accent bg-surface-active'
          : 'border-card bg-surface-card hover:bg-surface-subtle',
      ].join(' ')}
    >
      <div className="relative size-[76px] shrink-0 overflow-hidden rounded-sm">
        <Image
          src={plant.imageUrl}
          alt={plant.commonName}
          fill
          sizes="76px"
          className="object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-inline-gap">
        <div className="flex flex-col gap-tight-gap">
          <h3 className="text-heading font-semibold text-primary">
            {plant.commonName}
          </h3>
          <p className="text-body-small italic leading-compact tracking-compact text-muted">
            {plant.botanicalName}
          </p>
        </div>
        <p className="line-clamp-1 text-body-small leading-compact tracking-compact text-body-secondary">
          {plant.description}
        </p>
      </div>
    </button>
  )
}

export default ExplorePlantListRow
