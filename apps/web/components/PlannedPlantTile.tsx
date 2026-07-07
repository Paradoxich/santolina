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
    <article className="flex flex-col gap-[var(--space-section-gap)] rounded-[var(--component-card-dashboard-radius)] border border-dashed border-[var(--color-border-card)] bg-[rgba(255,255,255,0.2)] p-[var(--space-card-padding)]">
      <div className="relative h-[148px] w-full overflow-hidden rounded-[var(--radius-sm)]">
        <Image
          src={plant.imageUrl}
          alt={plant.name}
          fill
          sizes="(max-width: 1280px) 50vw, 360px"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-[var(--space-inline-gap)]">
        <div className="flex flex-col gap-[var(--space-tight-gap)]">
          <h3 className="text-[length:var(--font-size-card-title)] font-semibold text-[var(--text-card-title)]">
            {plant.name}
          </h3>
          {plant.caption && (
            <p className="text-[length:var(--font-size-body-small)] italic leading-[1.3] tracking-[-0.01em] text-[var(--text-caption)]">
              {plant.caption}
            </p>
          )}
        </div>
        <p className="text-[length:var(--font-size-body-small)] leading-[1.3] tracking-[-0.01em] text-[var(--text-card-caption)]">
          {plant.note}
        </p>
      </div>
      <div className="flex items-start gap-[var(--space-item-gap)]">
        <button
          type="button"
          onClick={() => onRemove?.(plant.id)}
          aria-label={`Remove ${plant.name} from planned`}
          className="flex h-8 items-center justify-center rounded-[6px] border border-[var(--color-border-card)] p-[var(--space-inline-gap)] transition-colors duration-[var(--duration-normal)] hover:bg-[var(--color-background-overlay)]"
        >
          <Image src="/icons/icon-trash.svg" alt="" width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => onMarkAsPlanted?.(plant.id)}
          className="flex h-8 flex-1 items-center gap-[var(--space-inline-gap)] rounded-[var(--radius-sm)] bg-[var(--color-background-subtle)] p-[var(--space-inline-gap)] text-[length:var(--font-size-body-small)] text-[var(--text-card-title)] transition-colors duration-[var(--duration-normal)] hover:bg-gray-0"
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
