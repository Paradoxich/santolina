import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Icon, useToast } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import type { PlantDetail } from '@/lib/plant-detail'
import { formatPlantSubtitle } from '@/lib/format-plant'
import { buildGoodForYourGarden } from '@/lib/good-for-your-garden'
import {
  addToPalette,
  updateStatus,
  removeFromPalette,
  getPaletteStatus,
  type PaletteStatus,
} from '@/server/palette-actions'
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

  const router = useRouter()
  const { toast } = useToast()

  const [palette, setPalette] = useState<{
    paletteId: string
    status: PaletteStatus
  } | null>(null)
  const [isStatusLoading, setIsStatusLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<'plan' | 'garden' | null>(
    null
  )
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsStatusLoading(true)
    setActionError(null)
    getPaletteStatus({ plantId: plant.id })
      .then((result) => {
        if (!cancelled) setPalette(result)
      })
      .catch((err) => {
        if (!cancelled)
          setActionError(
            err instanceof Error ? err.message : 'Failed to load palette status'
          )
      })
      .finally(() => {
        if (!cancelled) setIsStatusLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [plant.id])

  const handleAddToPlan = async () => {
    setActionError(null)
    setPendingAction('plan')
    try {
      if (palette?.status === 'planned') {
        const removedId = palette.paletteId
        await removeFromPalette({ paletteId: removedId })
        setPalette(null)
        toast({
          groupKey: plant.id,
          title: 'Removed from plan',
          description: `${plant.common_name} removed from your planned list.`,
          actions: [
            {
              label: 'Undo',
              onClick: async () => {
                try {
                  const result = await addToPalette({
                    plantId: plant.id,
                    status: 'planned',
                    source: 'manual',
                  })
                  setPalette({ paletteId: result.id, status: result.status })
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : 'Undo failed.'
                  )
                }
              },
            },
          ],
        })
      } else if (!palette) {
        const result = await addToPalette({
          plantId: plant.id,
          status: 'planned',
          source: 'manual',
        })
        setPalette({ paletteId: result.id, status: result.status })
        toast({
          groupKey: plant.id,
          title: 'Added to your plan',
          description: `${plant.common_name} is on your planned list.`,
          variant: 'positive',
          actions: [
            {
              label: 'See planned',
              onClick: () => router.push('/garden?tab=planned'),
            },
            {
              label: 'Undo',
              onClick: async () => {
                try {
                  await removeFromPalette({ paletteId: result.id })
                  setPalette(null)
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : 'Undo failed.'
                  )
                }
              },
            },
          ],
        })
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setPendingAction(null)
    }
  }

  const handleAddToGarden = async () => {
    setActionError(null)
    setPendingAction('garden')
    try {
      if (palette?.status === 'planted') {
        const removedId = palette.paletteId
        await removeFromPalette({ paletteId: removedId })
        setPalette(null)
        toast({
          groupKey: plant.id,
          title: 'Removed from your garden',
          description: `${plant.common_name} removed from your garden.`,
          actions: [
            {
              label: 'Undo',
              onClick: async () => {
                try {
                  const result = await addToPalette({
                    plantId: plant.id,
                    status: 'planted',
                    source: 'manual',
                  })
                  setPalette({ paletteId: result.id, status: result.status })
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : 'Undo failed.'
                  )
                }
              },
            },
          ],
        })
      } else if (palette?.status === 'planned') {
        const paletteId = palette.paletteId
        await updateStatus({ paletteId, status: 'planted' })
        setPalette({ paletteId, status: 'planted' })
        toast({
          groupKey: plant.id,
          title: 'Added to your garden',
          description: `${plant.common_name} is now growing in your garden.`,
          variant: 'positive',
          actions: [
            {
              label: 'Undo',
              onClick: async () => {
                try {
                  await updateStatus({ paletteId, status: 'planned' })
                  setPalette({ paletteId, status: 'planned' })
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : 'Undo failed.'
                  )
                }
              },
            },
          ],
        })
      } else {
        const result = await addToPalette({
          plantId: plant.id,
          status: 'planted',
          source: 'manual',
        })
        setPalette({ paletteId: result.id, status: result.status })
        toast({
          groupKey: plant.id,
          title: 'Added to your garden',
          description: `${plant.common_name} is now growing in your garden.`,
          variant: 'positive',
          actions: [
            {
              label: 'Undo',
              onClick: async () => {
                try {
                  await removeFromPalette({ paletteId: result.id })
                  setPalette(null)
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : 'Undo failed.'
                  )
                }
              },
            },
          ],
        })
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setPendingAction(null)
    }
  }

  const addToPlanLabel =
    pendingAction === 'plan'
      ? palette?.status === 'planned'
        ? 'Removing…'
        : 'Adding…'
      : palette?.status === 'planned'
        ? 'Remove from plan'
        : 'Add to plan'

  const addToGardenLabel =
    pendingAction === 'garden'
      ? palette?.status === 'planted'
        ? 'Removing…'
        : 'Saving…'
      : palette?.status === 'planted'
        ? 'Remove from garden'
        : 'Add to garden'

  const controlsDisabled = isStatusLoading || pendingAction !== null

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
            onClick={handleAddToPlan}
            disabled={controlsDisabled || palette?.status === 'planted'}
            className="flex h-8 items-center rounded-sm border border-card bg-surface-inverse px-item-gap text-body-small text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addToPlanLabel}
          </button>
          <button
            type="button"
            onClick={handleAddToGarden}
            disabled={controlsDisabled}
            className="flex h-8 items-center rounded-sm border border-card bg-surface-control px-inline-gap text-body-small text-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addToGardenLabel}
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

      {actionError && (
        <p
          role="alert"
          className="w-full shrink-0 border-b border-card bg-surface-critical px-card-padding py-inline-gap text-label text-critical"
        >
          {actionError}
        </p>
      )}

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
