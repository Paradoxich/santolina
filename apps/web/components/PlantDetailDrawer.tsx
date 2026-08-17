import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Button,
  Drawer,
  FormError,
  Icon,
  IconButton,
  Gallery,
  Tooltip,
  useToast,
} from '@paradoxui/ui'
import { failureMessage } from '@/lib/failure'
import { icons } from '@/lib/icons'
import { PlantImage } from '@/components/PlantImage'
import { DRAWER_MOTION } from '@/lib/drawer-motion'
import { creditLine } from '@/lib/image-attribution'
import { galleryPhotoUrls } from '@/lib/plant-image'
import type { PlantDetail } from '@/lib/plant-detail'
import { formatPlantSubtitle } from '@/lib/format-plant'
import { buildGoodForYourGarden } from '@/lib/good-for-your-garden'
import {
  addToPalette,
  markPlanted,
  undoMarkPlanted,
  removeFromPalette,
  getPaletteStatus,
  type PaletteStatus,
} from '@/server/palette-actions'
import { hasDiaryEntries } from '@/server/diary-actions'
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
  // The full-size viewer pages through this whole list, not just the 3 shown
  // in the strip — see galleryPhotoUrls for the ordering and the cap.
  const allPhotos = galleryPhotoUrls(plant)
  const photos = allPhotos.slice(0, 3)
  const galleryImages = allPhotos.map((src, i) => ({
    src,
    alt: `${plant.common_name} photo ${i + 1}`,
  }))
  const credit = creditLine(plant.image_attribution)
  const bullets = buildGoodForYourGarden(plant, garden, companions)

  const router = useRouter()
  const { toast } = useToast()

  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)

  const [palette, setPalette] = useState<{
    paletteId: string
    status: PaletteStatus
  } | null>(null)
  /** Whether this plant has any story history from a previous stint in the garden — decides the "you grew this before" CTA below. */
  const [hasHistory, setHasHistory] = useState(false)
  const [isStatusLoading, setIsStatusLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<'plan' | 'garden' | null>(
    null
  )
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsStatusLoading(true)
    setActionError(null)
    Promise.all([
      getPaletteStatus({ plantId: plant.id }),
      hasDiaryEntries({ plantId: plant.id }),
    ])
      .then(([status, history]) => {
        if (!cancelled) {
          setPalette(status)
          setHasHistory(history)
        }
      })
      .catch((err) => {
        if (!cancelled)
          setActionError(
            failureMessage(
              err,
              "Could not load this plant's status. Try again."
            )
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
        router.refresh()
        toast({
          groupKey: plant.id,
          message: `${plant.common_name} removed from your planned list.`,
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
                  router.refresh()
                } catch (err) {
                  setActionError(
                    failureMessage(err, 'Could not undo that. Try again.')
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
        router.refresh()
        toast({
          groupKey: plant.id,
          message: `${plant.common_name} is on your planned list.`,
          tone: 'positive',
          actions: [
            {
              label: 'See planned',
              onClick: () => router.push('/plants?tab=planned'),
            },
            {
              label: 'Undo',
              onClick: async () => {
                try {
                  await removeFromPalette({ paletteId: result.id })
                  setPalette(null)
                  router.refresh()
                } catch (err) {
                  setActionError(
                    failureMessage(err, 'Could not undo that. Try again.')
                  )
                }
              },
            },
          ],
        })
      }
    } catch (err) {
      setActionError(
        failureMessage(err, 'Could not update your planned list. Try again.')
      )
    } finally {
      setPendingAction(null)
    }
  }

  /**
   * Handles the drawer's second button for the two non-removal states.
   * Removing an owned plant now happens on its subpage, not here — see
   * docs/architecture.md for why this drawer (the species) never mutates
   * the owned instance, only links to the page that does. "Add to garden"
   * and "Move to growing" have to stay distinct labels rather than one
   * button always saying the same thing — see docs/architecture.md#transition-labels.
   */
  const handleSecondaryAction = async () => {
    setActionError(null)
    setPendingAction('garden')
    try {
      if (palette?.status === 'planned') {
        const paletteId = palette.paletteId
        const { plantedEventId } = await markPlanted({ paletteId })
        setPalette({ paletteId, status: 'planted' })
        router.refresh()
        toast({
          groupKey: plant.id,
          message: `${plant.common_name} is now growing in your garden.`,
          tone: 'positive',
          actions: [
            {
              label: 'Undo',
              onClick: async () => {
                try {
                  await undoMarkPlanted({ paletteId, plantedEventId })
                  setPalette({ paletteId, status: 'planned' })
                  router.refresh()
                } catch (err) {
                  setActionError(
                    failureMessage(err, 'Could not undo that. Try again.')
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
        router.refresh()
        toast({
          groupKey: plant.id,
          message: `${plant.common_name} is now growing in your garden.`,
          tone: 'positive',
          actions: [
            {
              label: 'Undo',
              onClick: async () => {
                try {
                  await removeFromPalette({ paletteId: result.id })
                  setPalette(null)
                  router.refresh()
                } catch (err) {
                  setActionError(
                    failureMessage(err, 'Could not undo that. Try again.')
                  )
                }
              },
            },
          ],
        })
      }
    } catch (err) {
      setActionError(
        failureMessage(err, 'Could not update your garden. Try again.')
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

  const secondaryActionLabel =
    pendingAction === 'garden'
      ? palette?.status === 'planned'
        ? 'Moving…'
        : 'Saving…'
      : palette?.status === 'planned'
        ? 'Move to growing'
        : 'Add to garden'

  const controlsDisabled = isStatusLoading || pendingAction !== null

  return (
    <Drawer
      label={`${plant.common_name} details`}
      onClose={onClose}
      closeLabel="Close plant details"
      closeIcon={<Icon src={icons.close} />}
      panelComponent={motion.aside}
      panelProps={DRAWER_MOTION}
      headerActions={
        <>
          {palette?.status !== 'planted' && (
            <Button
              variant="control"
              size="sm"
              onClick={handleAddToPlan}
              disabled={controlsDisabled}
            >
              {addToPlanLabel}
            </Button>
          )}
          {palette?.status === 'planted' ? (
            <>
              <span className="text-label text-muted">In your garden</span>
              <Button
                variant="control"
                size="sm"
                onClick={() => router.push(`/plants/${plant.id}`)}
              >
                View in My Plants
              </Button>
            </>
          ) : !palette && hasHistory ? (
            <Button
              variant="control"
              size="sm"
              onClick={() => router.push(`/plants/${plant.id}`)}
            >
              You grew this before. View its story
            </Button>
          ) : (
            <Button
              variant="control"
              size="sm"
              onClick={handleSecondaryAction}
              disabled={controlsDisabled}
            >
              {secondaryActionLabel}
            </Button>
          )}
          <Tooltip content="Chat about this plant" position="bottom">
            <IconButton
              variant="control"
              size="sm"
              aria-label="Chat about this plant"
            >
              <Icon src={icons.chat} />
            </IconButton>
          </Tooltip>
        </>
      }
    >
      {/* Flush to the drawer's top edge, so a bottom border instead of a
          radius. Same failure and same copy as the page above. */}
      {actionError && (
        <FormError variant="banner" className="border-b border-card">
          {actionError}
        </FormError>
      )}

      <div className="flex w-full flex-1 flex-col gap-section-break overflow-y-auto p-card-padding">
        <div className="flex w-full shrink-0 flex-col gap-item-gap">
          <h2 className="w-full text-title font-semibold text-primary">
            {plant.common_name}
          </h2>
          {subtitle && (
            <p className="w-full text-body italic text-muted">{subtitle}</p>
          )}
        </div>

        <div className="flex w-full shrink-0 snap-x snap-mandatory gap-inline-gap overflow-x-auto">
          {(photos.length > 0 ? photos : [null]).map((src, i) => {
            const imageClass =
              'relative h-[141px] shrink-0 snap-start overflow-hidden rounded-sm'
            const style = { width: PHOTO_WIDTHS[i % PHOTO_WIDTHS.length] }
            const image = (
              <PlantImage
                src={src}
                alt={`${plant.common_name} photo ${i + 1}`}
                fill
                sizes="207px"
                className="object-cover"
              />
            )
            // Only real photos open the viewer; the placeholder stays inert.
            return src ? (
              <button
                key={src}
                type="button"
                onClick={() => setGalleryIndex(i)}
                aria-label={`View ${plant.common_name} photo ${i + 1}`}
                className={`${imageClass} cursor-pointer transition-opacity duration-normal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
                style={style}
              >
                {image}
              </button>
            ) : (
              <div key="placeholder" className={imageClass} style={style}>
                {image}
              </div>
            )
          })}
        </div>

        {credit && (
          <p className="w-full text-body-small text-muted">
            {credit}
            {plant.image_attribution?.source_url && (
              <>
                {' · '}
                <a
                  href={plant.image_attribution.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  source
                </a>
              </>
            )}
            {plant.image_attribution?.license_url && (
              <>
                {' · '}
                <a
                  href={plant.image_attribution.license_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  licence
                </a>
              </>
            )}
          </p>
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

      <Gallery
        images={galleryImages}
        isOpen={galleryIndex !== null}
        initialIndex={galleryIndex ?? 0}
        onClose={() => setGalleryIndex(null)}
      />
    </Drawer>
  )
}

export default PlantDetailDrawer
