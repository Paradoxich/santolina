import { useEffect } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Icon } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
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

/** Mirrors --duration-slow / --ease-in-out — Framer Motion can't read CSS vars. */
const DRAWER_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }

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
    <motion.aside
      aria-label={`${plant.common_name} details`}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={DRAWER_TRANSITION}
      className="fixed inset-0 z-20 flex w-full flex-col overflow-hidden bg-surface-card lg:inset-x-auto lg:top-2 lg:bottom-2 lg:right-0 lg:w-[440px] lg:rounded-l-lg lg:border-l lg:border-y lg:border-card"
    >
      <div className="flex w-full shrink-0 items-center justify-between border-b border-card p-card-padding">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close plant details"
          className="flex size-8 items-center justify-center rounded-full border border-card bg-surface-control transition-opacity duration-normal hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Icon src={icons.close} />
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
            className="flex h-8 items-center rounded-sm border border-card bg-surface-control px-inline-gap text-body-small text-secondary"
          >
            I have this
          </button>
          <button
            type="button"
            aria-label="Chat about this plant"
            className="flex size-8 items-center justify-center rounded-full border border-card bg-surface-control"
          >
            <Icon src={icons.chat} />
          </button>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col gap-section-break overflow-y-auto p-card-padding">
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
      </div>
    </motion.aside>
  )
}

export default PlantDetailDrawer
