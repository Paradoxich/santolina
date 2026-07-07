import { useEffect } from 'react'
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

  useEffect(() => {
    // Mirrors the lg breakpoint: below it the drawer is a full-screen
    // sheet (it also has to clear the desktop sidebar, which appears at
    // md), so the page underneath must not scroll behind it.
    const mq = window.matchMedia('(max-width: 1023px)')
    if (!mq.matches) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  return (
    <aside
      aria-label={`${plant.common_name} details`}
      className="fixed inset-0 z-20 flex w-full flex-col gap-section-break overflow-y-auto bg-surface-card p-card-padding lg:inset-y-0 lg:inset-x-auto lg:right-0 lg:w-[440px] lg:border-l lg:border-card"
    >
      <div className="flex w-full shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close plant details"
          className="flex size-8 items-center justify-center rounded-full bg-sage-300 transition-opacity duration-normal hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Image src="/icons/icon-close.svg" alt="" width={16} height={16} />
        </button>

        <div className="flex items-center gap-inline-gap">
          <button
            type="button"
            className="flex h-8 items-center rounded-sm border border-card bg-surface-inverse px-item-gap text-body-small text-on-accent"
          >
            Add to plan
          </button>
          <button
            type="button"
            className="flex h-8 items-center rounded-sm bg-surface-control px-inline-gap text-body-small text-secondary"
          >
            I have this
          </button>
          <button
            type="button"
            aria-label="Chat about this plant"
            className="flex size-8 items-center justify-center rounded-full bg-surface-control"
          >
            <Image src="/icons/icon-chat.svg" alt="" width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-item-gap">
        <h2 className="w-full text-title font-semibold tracking-[-0.04em] text-primary">
          {plant.common_name}
        </h2>
        {subtitle && (
          <p className="w-full text-body italic text-muted">{subtitle}</p>
        )}
      </div>

      {photos.length > 0 && (
        <div className="flex w-full shrink-0 snap-x snap-mandatory gap-inline-gap overflow-x-auto">
          {photos.map((src, i) => (
            <div
              key={src}
              className="relative h-[141px] shrink-0 snap-start overflow-hidden rounded-sm"
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

      <div className="flex w-full flex-col gap-section-break">
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
