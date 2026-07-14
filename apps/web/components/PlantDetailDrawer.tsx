import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Drawer, Icon, Modal, Tooltip, useToast } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { PlantImage } from '@/components/PlantImage'
import { DRAWER_MOTION } from '@/lib/drawer-motion'
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
import { listDiaryEntries } from '@/server/diary-actions'
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

  const [isCheckingDiary, setIsCheckingDiary] = useState(false)
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)

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
        router.refresh()
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
          title: 'Added to your plan',
          description: `${plant.common_name} is on your planned list.`,
          tone: 'positive',
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

  /** The actual removal — shared by the no-diary immediate path and the confirmation dialog. */
  const performRemoveFromGarden = async () => {
    if (!palette) return
    const removedId = palette.paletteId
    await removeFromPalette({ paletteId: removedId })
    setPalette(null)
    router.refresh()
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
   * Clicking the trash icon (planted state only). Checks for existing
   * diary content first — zero entries removes immediately, one or more
   * opens the confirmation dialog instead so removal never silently
   * implies the notes are gone too.
   */
  const handleRemoveClick = async () => {
    if (!palette) return
    setActionError(null)
    setIsCheckingDiary(true)
    try {
      const entries = await listDiaryEntries({ plantId: plant.id })
      if (entries.length === 0) {
        setPendingAction('garden')
        await performRemoveFromGarden()
        setPendingAction(null)
      } else {
        setIsRemoveDialogOpen(true)
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setIsCheckingDiary(false)
    }
  }

  const closeRemoveDialog = () => {
    setIsRemoveDialogOpen(false)
  }

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

  /** Navigates straight to this plant's diary thread — same ?plant= convention as this drawer's own route. */
  const handleOpenDiary = () => {
    router.push(`/diary?plant=${plant.id}`)
  }

  /**
   * Handles the drawer's second button for the two non-removal states.
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
          title: 'Moved to growing',
          description: `${plant.common_name} is now growing in your garden.`,
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
          title: 'Added to your garden',
          description: `${plant.common_name} is now growing in your garden.`,
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
            <button
              type="button"
              onClick={handleAddToPlan}
              disabled={controlsDisabled}
              className="flex h-8 items-center rounded-sm border border-card bg-surface-inverse px-item-gap text-body-small text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addToPlanLabel}
            </button>
          )}
          {palette?.status === 'planted' ? (
            <>
              <Tooltip content="Remove from garden" position="bottom">
                {/* Span carries the hover handlers: a disabled button doesn't
                    reliably fire mouse events, and this button disables mid-action. */}
                <span className="inline-flex">
                  <button
                    type="button"
                    onClick={handleRemoveClick}
                    disabled={controlsDisabled || isCheckingDiary}
                    aria-label="Remove from garden"
                    className="flex size-8 items-center justify-center rounded-full border border-card bg-surface-control transition-opacity duration-normal hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon src={icons.trash} />
                  </button>
                </span>
              </Tooltip>
              <button
                type="button"
                onClick={handleOpenDiary}
                className="flex h-8 items-center rounded-sm border border-card bg-surface-control px-inline-gap text-body-small text-secondary"
              >
                Open diary
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSecondaryAction}
              disabled={controlsDisabled}
              className="flex h-8 items-center rounded-sm border border-card bg-surface-control px-inline-gap text-body-small text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {secondaryActionLabel}
            </button>
          )}
          <Tooltip content="Chat about this plant" position="bottom">
            <button
              type="button"
              aria-label="Chat about this plant"
              className="flex size-8 items-center justify-center rounded-full border border-card bg-surface-control"
            >
              <Icon src={icons.chat} />
            </button>
          </Tooltip>
        </>
      }
    >
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
          <h2 className="w-full text-title font-semibold text-primary">
            {plant.common_name}
          </h2>
          {subtitle && (
            <p className="w-full text-body italic text-muted">{subtitle}</p>
          )}
        </div>

        <div className="flex w-full shrink-0 snap-x snap-mandatory gap-inline-gap overflow-x-auto">
          {(photos.length > 0 ? photos : [null]).map((src, i) => (
            <div
              key={src ?? 'placeholder'}
              className="relative h-[141px] shrink-0 snap-start overflow-hidden rounded-sm"
              style={{ width: PHOTO_WIDTHS[i % PHOTO_WIDTHS.length] }}
            >
              <PlantImage
                src={src}
                alt={`${plant.common_name} photo ${i + 1}`}
                fill
                sizes="207px"
                className="object-cover"
              />
            </div>
          ))}
        </div>

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

      <Modal
        isOpen={isRemoveDialogOpen}
        onClose={closeRemoveDialog}
        title={`Remove ${plant.common_name} from your garden?`}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={closeRemoveDialog}
              disabled={pendingAction === 'garden'}
              className="flex h-8 items-center rounded-sm border border-card bg-surface-control px-inline-gap text-body-small text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={pendingAction === 'garden'}
              className="flex h-8 items-center rounded-sm border border-card bg-surface-inverse px-item-gap text-body-small text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingAction === 'garden' ? 'Removing…' : 'Remove from garden'}
            </button>
          </>
        }
      >
        <p className="text-body text-secondary">
          Your diary for this plant will be left intact. You can delete it or
          bring the plant back to your garden from the diary view.
        </p>
      </Modal>
    </Drawer>
  )
}

export default PlantDetailDrawer
