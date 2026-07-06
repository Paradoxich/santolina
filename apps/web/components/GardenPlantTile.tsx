import Image from 'next/image'
import type { GardenPlant, BloomStatus } from '@/types/garden'

const statusLabels: Record<BloomStatus, string> = {
  blooming: 'blooming',
  'pre-bloom': 'pre bloom',
  resting: 'resting',
  done: 'done',
}

interface GardenPlantTileProps {
  plant: GardenPlant
}

export function GardenPlantTile({ plant }: GardenPlantTileProps) {
  return (
    <article className="flex flex-col gap-[var(--space-item-gap)] rounded-[var(--component-card-dashboard-radius)] border border-[var(--color-border-card)] p-[var(--space-card-padding)]">
      <div className="relative h-[200px] w-full overflow-hidden rounded-[var(--radius-md)]">
        <Image
          src={plant.imageUrl}
          alt={plant.name}
          fill
          sizes="(max-width: 1280px) 50vw, 360px"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-[var(--space-item-gap)]">
        <div className="flex items-start gap-[var(--space-inline-gap)]">
          <h3 className="text-[length:var(--font-size-card-title)] font-semibold text-[var(--text-card-title)]">
            {plant.name}
          </h3>
          <span className="mt-[3px] inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-badge-bg)] px-[var(--space-tight-gap)] pb-[3px] pt-[var(--space-tight-gap)] text-[length:var(--font-size-label)] leading-none text-[var(--color-accent-primary)]">
            {statusLabels[plant.status]}
          </span>
        </div>
        <p className="text-[length:var(--font-size-body-small)] tracking-[-0.01em] text-[var(--text-card-caption)]">
          ❋ {plant.note}
        </p>
      </div>
    </article>
  )
}

export default GardenPlantTile
