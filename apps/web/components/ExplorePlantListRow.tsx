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
        'flex w-full items-start gap-[var(--space-item-gap)] rounded-[var(--component-card-explore-list-row-radius)] border p-[var(--space-item-gap)] text-left shadow-[var(--shadow-sm)] transition-colors duration-[var(--duration-normal)]',
        selected
          ? 'border-[var(--color-accent-primary)] bg-[var(--color-background-active)]'
          : 'border-white bg-[var(--color-background-card)] hover:bg-[var(--color-background-card-subtle)]',
      ].join(' ')}
    >
      <div className="relative size-[76px] shrink-0 overflow-hidden rounded-[var(--radius-sm)]">
        <Image
          src={plant.imageUrl}
          alt={plant.commonName}
          fill
          sizes="76px"
          className="object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-inline-gap)]">
        <div className="flex flex-col gap-[var(--space-tight-gap)]">
          <h3 className="text-[length:var(--font-size-card-title)] font-semibold text-[var(--text-card-title)]">
            {plant.commonName}
          </h3>
          <p className="text-[length:var(--font-size-body-small)] italic leading-[1.3] tracking-[-0.01em] text-[var(--text-caption)]">
            {plant.botanicalName}
          </p>
        </div>
        <p className="line-clamp-1 text-[length:var(--font-size-body-small)] leading-[1.3] tracking-[-0.01em] text-[var(--text-body-secondary)]">
          {plant.description}
        </p>
      </div>
    </button>
  )
}

export default ExplorePlantListRow
