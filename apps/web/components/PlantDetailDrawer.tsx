import Image from 'next/image'
import type { PlantDetail } from '@/lib/plant-detail'
import { formatPlantSubtitle } from '@/lib/format-plant'
import { buildGoodForYourGarden } from '@/lib/good-for-your-garden'
import { AboutSection } from './plant-detail/AboutSection'
import { GoodForYourGardenSection } from './plant-detail/GoodForYourGardenSection'
import { CareSection } from './plant-detail/CareSection'
import { SeasonalRhythmSection } from './plant-detail/SeasonalRhythmSection'
import { InYourGardenSection } from './plant-detail/InYourGardenSection'
import { WorksWellWithSection } from './plant-detail/WorksWellWithSection'
import { GoodForSection } from './plant-detail/GoodForSection'
import { DetailsSection } from './plant-detail/DetailsSection'

interface PlantDetailDrawerProps {
  detail: PlantDetail
  onClose: () => void
}

/** Photo widths cycle to match the Figma strip (third photo clips at the edge). */
const PHOTO_WIDTHS = [131, 175, 207]

export function PlantDetailDrawer({ detail, onClose }: PlantDetailDrawerProps) {
  const { plant, companions, garden } = detail
  const subtitle = formatPlantSubtitle(
    plant.scientific_name,
    plant.common_name_aliases ?? []
  )
  const photos = (plant.image_urls ?? []).slice(0, 3)
  const bullets = buildGoodForYourGarden(plant, garden, companions)

  return (
    <aside
      aria-label={`${plant.common_name} details`}
      className="fixed inset-y-0 right-0 z-20 flex w-[440px] flex-col gap-[var(--space-section-break)] overflow-y-auto border-l border-white bg-[var(--color-background-card)] p-[var(--space-card-padding)]"
    >
      <div className="flex w-full shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close plant details"
          className="flex size-8 items-center justify-center rounded-full bg-[var(--color-background-close-button)] transition-opacity duration-[var(--duration-normal)] hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-primary)]"
        >
          <Image src="/icons/icon-close.svg" alt="" width={16} height={16} />
        </button>

        <div className="flex items-center gap-[var(--space-inline-gap)]">
          <button
            type="button"
            className="flex h-8 items-center rounded-[var(--radius-sm)] border border-white bg-[var(--color-background-inverse)] px-[var(--space-item-gap)] text-[length:var(--font-size-body-small)] text-[var(--text-button-primary-label)]"
          >
            Add to plan
          </button>
          <button
            type="button"
            className="flex h-8 items-center rounded-[var(--radius-sm)] bg-[var(--color-background-subtle)] px-[var(--space-inline-gap)] text-[length:var(--font-size-body-small)] text-[var(--text-button-label)]"
          >
            I have this
          </button>
          <button
            type="button"
            aria-label="Chat about this plant"
            className="flex size-8 items-center justify-center rounded-full bg-[var(--color-background-subtle)]"
          >
            <Image src="/icons/icon-chat.svg" alt="" width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-[var(--space-item-gap)]">
        <h2 className="w-full text-[length:var(--font-size-page-title)] font-semibold tracking-[-0.04em] text-[var(--text-page-title)]">
          {plant.common_name}
        </h2>
        {subtitle && (
          <p className="w-full text-[length:var(--font-size-body)] italic text-[var(--text-caption)]">
            {subtitle}
          </p>
        )}
      </div>

      {photos.length > 0 && (
        <div className="flex w-full shrink-0 gap-[var(--space-inline-gap)] overflow-x-auto">
          {photos.map((src, i) => (
            <div
              key={src}
              className="relative h-[141px] shrink-0 overflow-hidden rounded-[var(--radius-sm)]"
              style={{ width: PHOTO_WIDTHS[i % PHOTO_WIDTHS.length] }}
            >
              <Image
                src={src}
                alt={`${plant.common_name} photo ${i + 1}`}
                fill
                sizes="207px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex w-full flex-col gap-[var(--space-section-break)]">
        <AboutSection description={plant.description} />
        <GoodForYourGardenSection bullets={bullets} />
        <CareSection plant={plant} />
        <SeasonalRhythmSection rhythm={plant.seasonal_rhythm} />
        <InYourGardenSection plant={plant} />
        <WorksWellWithSection companions={companions} />
        <GoodForSection tags={plant.garden_use_tags} />
        <DetailsSection plant={plant} />
      </div>
    </aside>
  )
}

export default PlantDetailDrawer
