'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Button,
  Icon,
  IconButton,
  Lightbox,
  Modal,
  Tooltip,
  useToast,
} from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { PlantImage } from '@/components/PlantImage'
import { creditLine } from '@/lib/image-attribution'
import type { PlantDetail } from '@/lib/plant-detail'
import { formatPlantSubtitle } from '@/lib/format-plant'
import { buildGoodForYourGarden } from '@/lib/good-for-your-garden'
import {
  addToPalette,
  markPlanted,
  undoMarkPlanted,
  removeFromPalette,
  type PaletteStatus,
} from '@/server/palette-actions'
import type { DiaryNote } from '@/types/diary'
import { AboutSection } from './plant-detail/AboutSection'
import { GoodForYourGardenSection } from './plant-detail/GoodForYourGardenSection'
import { CareSection } from './plant-detail/CareSection'
import { SeasonalRhythmSection } from './plant-detail/SeasonalRhythmSection'
import { InYourGardenSection } from './plant-detail/InYourGardenSection'
import { WorksWellWithSection } from './plant-detail/WorksWellWithSection'
import { GoodForSection } from './plant-detail/GoodForSection'
import { DetailsSection } from './plant-detail/DetailsSection'
import { StorySection } from './plant-detail/StorySection'
import { StoryComposer } from './plant-detail/StoryComposer'

/** Photo widths cycle to match the Figma strip (third photo clips at the edge). */
const PHOTO_WIDTHS = [131, 175, 207]

interface PlantDetailPageProps {
  detail: PlantDetail
  initialPalette: { paletteId: string; status: PaletteStatus } | null
  /** Server-fetched once by the page; a note add/delete refreshes it via router.refresh(). */
  notes: DiaryNote[]
  /** Where "My Plants" points back to — preserves the Growing/Planned tab. */
  backHref: string
}

/**
 * The plant you own: reference info plus its story (notes, photos, care
 * events) — the one place that content lives. The Explore drawer shows the
 * same reference sections for the species, but never the story; see
 * docs/architecture.md for the one-home principle behind the split.
 */
export function PlantDetailPage({
  detail,
  initialPalette,
  notes,
  backHref,
}: PlantDetailPageProps) {
  const { plant, companions, garden } = detail
  const subtitle = formatPlantSubtitle(
    plant.scientific_name,
    plant.common_name_aliases ?? []
  )
  const allPhotos = [
    ...(plant.image_url ? [plant.image_url] : []),
    ...(plant.image_urls ?? []).filter((u) => u !== plant.image_url),
  ]
  const photos = allPhotos.slice(0, 3)
  const galleryImages = allPhotos.map((src, i) => ({
    src,
    alt: `${plant.common_name} photo ${i + 1}`,
  }))
  const credit = creditLine(plant.image_attribution)
  const bullets = buildGoodForYourGarden(plant, garden, companions)

  const router = useRouter()
  const { toast } = useToast()

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const [palette, setPalette] = useState(initialPalette)
  const [pendingAction, setPendingAction] = useState<'plan' | 'garden' | null>(
    null
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)

  const isGrowing = palette?.status === 'planted'
  const showStory = isGrowing || notes.length > 0

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

  /** The actual removal — shared by the no-notes immediate path and the confirmation dialog. */
  const performRemoveFromGarden = async () => {
    if (!palette) return
    const removedId = palette.paletteId
    await removeFromPalette({ paletteId: removedId })
    setPalette(null)
    router.refresh()
    toast({
      groupKey: plant.id,
      message: `${plant.common_name} removed from your garden.`,
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
              router.refresh()
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

  /**
   * Clicking the trash icon (planted state only). Notes are already loaded
   * (the `notes` prop), so — unlike the old drawer — there's no extra fetch
   * here: zero notes removes immediately, one or more opens the
   * confirmation dialog so removal never silently implies the notes are
   * gone too (they aren't — see StorySection/StoryComposer's read-only
   * "Add back to garden" state for a removed plant with history).
   */
  const handleRemoveClick = () => {
    if (!palette) return
    setActionError(null)
    if (notes.length === 0) {
      setPendingAction('garden')
      performRemoveFromGarden()
        .catch((err) => {
          setActionError(
            err instanceof Error ? err.message : 'Something went wrong.'
          )
        })
        .finally(() => setPendingAction(null))
    } else {
      setIsRemoveDialogOpen(true)
    }
  }

  const closeRemoveDialog = () => setIsRemoveDialogOpen(false)

  const handleConfirmRemove = async () => {
    setPendingAction('garden')
    try {
      await performRemoveFromGarden()
      closeRemoveDialog()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setPendingAction(null)
    }
  }

  /**
   * Handles the page's second button for the two non-removal states.
   * Removal (planted -> not-in-palette) goes through the trash icon and
   * performRemoveFromGarden instead — see docs/architecture.md §14 for
   * why "Add to garden" and "Move to growing" have to stay distinct
   * labels rather than one button always saying the same thing.
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

  const secondaryActionLabel =
    pendingAction === 'garden'
      ? palette?.status === 'planned'
        ? 'Moving…'
        : 'Saving…'
      : palette?.status === 'planned'
        ? 'Move to growing'
        : 'Add to garden'

  const controlsDisabled = pendingAction !== null

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col pb-16">
      <div className="flex w-full items-center justify-between gap-inline-gap pt-8 md:pt-12">
        <Link
          href={backHref}
          className="flex items-center gap-tight-gap text-body text-secondary transition-colors duration-normal hover:text-primary"
        >
          <Icon src={icons.arrowRight} className="rotate-180" />
          My Plants
        </Link>
        <div className="flex items-center gap-inline-gap">
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
            <Tooltip content="Remove from garden" position="bottom">
              {/* Span carries the hover handlers: a disabled button doesn't
                  reliably fire mouse events, and this button disables mid-action. */}
              <span className="inline-flex">
                <IconButton
                  variant="control"
                  size="sm"
                  onClick={handleRemoveClick}
                  disabled={controlsDisabled}
                  aria-label="Remove from garden"
                >
                  <Icon src={icons.trash} />
                </IconButton>
              </span>
            </Tooltip>
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
        </div>
      </div>

      {actionError && (
        <p
          role="alert"
          className="mt-4 w-full shrink-0 rounded-sm bg-surface-critical px-card-padding py-inline-gap text-label text-critical"
        >
          {actionError}
        </p>
      )}

      <div className="mt-6 flex w-full flex-col gap-item-gap">
        <h1 className="w-full text-title font-semibold text-primary">
          {plant.common_name}
        </h1>
        {subtitle && (
          <p className="w-full text-body italic text-muted">{subtitle}</p>
        )}
      </div>

      <div className="mt-4 flex w-full shrink-0 snap-x snap-mandatory gap-inline-gap overflow-x-auto">
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
          return src ? (
            <button
              key={src}
              type="button"
              onClick={() => setLightboxIndex(i)}
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
        <p className="mt-2 w-full text-body-small text-muted">
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

      <div className="mt-section-break flex w-full flex-col gap-section-break">
        <AboutSection description={plant.description} />
        {showStory && (
          <StorySection
            plantId={plant.id}
            plantName={plant.common_name}
            notes={notes}
            isGrowing={isGrowing}
          />
        )}
        <GoodForYourGardenSection bullets={bullets} />
        <CareSection plant={plant} />
        <SeasonalRhythmSection rhythm={plant.seasonal_rhythm} />
        <InYourGardenSection plant={plant} />
        <WorksWellWithSection companions={companions} />
        <GoodForSection tags={plant.garden_use_tags} />
        <DetailsSection plant={plant} />
      </div>

      {showStory && (
        <div className="mt-section-break">
          <StoryComposer
            plantId={plant.id}
            paletteId={palette?.paletteId ?? null}
            isGrowing={isGrowing}
            onAddedBackToGarden={({ paletteId }) =>
              setPalette({ paletteId, status: 'planted' })
            }
          />
        </div>
      )}

      <Lightbox
        images={galleryImages}
        isOpen={lightboxIndex !== null}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />

      <Modal
        isOpen={isRemoveDialogOpen}
        onClose={closeRemoveDialog}
        title={`Remove ${plant.common_name} from your garden?`}
        size="sm"
        footer={
          <>
            <Button
              variant="control"
              size="sm"
              onClick={closeRemoveDialog}
              disabled={pendingAction === 'garden'}
            >
              Cancel
            </Button>
            <Button
              variant="control"
              size="sm"
              onClick={handleConfirmRemove}
              disabled={pendingAction === 'garden'}
            >
              {pendingAction === 'garden' ? 'Removing…' : 'Remove from garden'}
            </Button>
          </>
        }
      >
        <p className="text-body text-secondary">
          Your notes for this plant will stay. Find it again in Explore to add
          it back.
        </p>
      </Modal>
    </div>
  )
}

export default PlantDetailPage
