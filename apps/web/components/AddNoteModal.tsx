'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Chip,
  Icon,
  IconButton,
  Menu,
  Modal,
  useToast,
} from '@paradoxui/ui'
import type { MenuItem } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import {
  DIARY_EVENT_TYPES,
  DIARY_EVENT_LABELS,
  type DiaryEventType,
} from '@/lib/diary-events'
import { processPhotoFiles } from '@/lib/photo-processing'
import { addDiaryEntry } from '@/server/diary-actions'
import { listPalette } from '@/server/palette-actions'

interface GrowingPlant {
  paletteId: string
  plantId: string
  name: string
}

interface AddNoteModalProps {
  isOpen: boolean
  onClose: () => void
  /** Pre-selects this plant when the modal is opened from its page. Ignored if it isn't currently growing. */
  initialPlantId?: string | null
}

/**
 * The one deliberate capture surface: pick what a note is about, then write
 * it. Scope is an explicit choice here — the inline composer on a plant's
 * page covers the in-context case, where the plant is already implied.
 *
 * Only growing plants can be chosen: a planned plant isn't in the ground
 * yet, so it has no story to add to (docs/architecture.md §32).
 */
export function AddNoteModal({
  isOpen,
  onClose,
  initialPlantId,
}: AddNoteModalProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [plants, setPlants] = useState<GrowingPlant[]>([])
  const [isLoadingPlants, setIsLoadingPlants] = useState(false)
  /** null means the note is about the garden itself, not any one plant. */
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null)

  const [noteText, setNoteText] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<DiaryEventType[]>([])
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch on open rather than on mount: the modal lives in the app shell, so
  // mounting work would run on every page load whether or not it's used.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setIsLoadingPlants(true)
    setError(null)
    listPalette({ status: 'planted' })
      .then((rows) => {
        if (cancelled) return
        const growing = rows.map((row) => ({
          paletteId: row.id,
          plantId: row.plantId,
          name: row.plant.common_name,
        }))
        setPlants(growing)
        // Falls back to the garden when the page's plant isn't growing (a
        // removed plant's page still renders its past story).
        setSelectedPlantId(
          initialPlantId && growing.some((p) => p.plantId === initialPlantId)
            ? initialPlantId
            : null
        )
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : 'Failed to load your plants.'
          )
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPlants(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, initialPlantId])

  const reset = () => {
    setNoteText('')
    setSelectedEvents([])
    setPhotoFiles([])
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const selectedPlant =
    plants.find((p) => p.plantId === selectedPlantId) ?? null

  const scopeItems: MenuItem[] = [
    {
      label: 'Your garden',
      onSelect: () => {
        setSelectedPlantId(null)
        // Care events are plant actions, so they don't survive the switch.
        setSelectedEvents([])
      },
    },
    ...plants.map((plant) => ({
      label: plant.name,
      onSelect: () => setSelectedPlantId(plant.plantId),
    })),
  ]

  // Photos are downscaled and re-encoded in the browser before upload — see
  // lib/photo-processing.ts for why (size cap, HEIC, EXIF).
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (picked.length === 0) return

    setIsProcessingPhotos(true)
    try {
      const { files, failedNames } = await processPhotoFiles(picked)
      if (files.length > 0) setPhotoFiles((prev) => [...prev, ...files])
      setError(
        failedNames.length > 0
          ? `Couldn't read ${failedNames.join(', ')}. Try a JPG or PNG.`
          : null
      )
    } finally {
      setIsProcessingPhotos(false)
    }
  }

  const handleSubmit = async () => {
    const trimmed = noteText.trim()
    // An event on its own carries meaning, so a note isn't required when a
    // chip is set — but a garden note has no chips, so it needs words.
    if (!trimmed && photoFiles.length === 0 && selectedEvents.length === 0) {
      setError('Write a note first.')
      return
    }

    const eventTypes = DIARY_EVENT_TYPES.filter((e) =>
      selectedEvents.includes(e)
    )

    setIsSubmitting(true)
    setError(null)
    try {
      await addDiaryEntry({
        plantId: selectedPlant?.plantId,
        paletteId: selectedPlant?.paletteId,
        note: trimmed || undefined,
        eventTypes: selectedPlant ? eventTypes : [],
        photoFiles: photoFiles.length > 0 ? photoFiles : undefined,
      })
      router.refresh()
      toast({
        groupKey: 'add-note',
        message: selectedPlant
          ? `Note added to ${selectedPlant.name}.`
          : 'Note added to your garden.',
        tone: 'positive',
      })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const busy = isSubmitting || isProcessingPhotos

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add a note"
      size="md"
      footer={
        <>
          <Button
            variant="control"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={busy}
          >
            {isSubmitting ? 'Adding…' : 'Add note'}
          </Button>
        </>
      }
    >
      <div className="flex w-full flex-col gap-row-gap">
        <div className="flex w-full flex-col gap-inline-gap">
          <span className="text-label font-medium uppercase tracking-label text-muted">
            What is this about
          </span>
          <Menu
            label="Choose what this note is about"
            align="start"
            className="w-full"
            menuClassName="max-h-64 w-full overflow-y-auto"
            triggerClassName="flex w-full items-center gap-inline-gap rounded-md border border-card bg-surface-overlay px-item-gap py-inline-gap text-left transition-colors duration-normal hover:bg-surface-nav-active focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            items={scopeItems}
            trigger={
              <>
                <span className="flex-1 truncate text-body text-primary">
                  {isLoadingPlants
                    ? 'Loading…'
                    : (selectedPlant?.name ?? 'Your garden')}
                </span>
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="shrink-0 text-secondary"
                >
                  <path
                    d="M4 6l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            }
          />
          {!isLoadingPlants && plants.length === 0 && (
            <p className="text-body-small text-muted">
              Nothing growing yet, so this note goes to your garden.
            </p>
          )}
        </div>

        {selectedPlant && (
          <div className="flex flex-wrap gap-tight-gap">
            {DIARY_EVENT_TYPES.map((event) => {
              const active = selectedEvents.includes(event)
              return (
                <Chip
                  key={event}
                  selected={active}
                  onClick={() =>
                    setSelectedEvents((prev) =>
                      active
                        ? prev.filter((e) => e !== event)
                        : [...prev, event]
                    )
                  }
                >
                  {DIARY_EVENT_LABELS[event]}
                </Chip>
              )
            })}
          </div>
        )}

        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder={
            selectedPlant
              ? `What's new with ${selectedPlant.name}?`
              : 'What happened in your garden?'
          }
          rows={4}
          className="w-full resize-none rounded-md border border-card bg-surface-overlay p-item-gap text-body text-primary placeholder:text-muted focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />

        {photoFiles.length > 0 && (
          <ul className="flex flex-wrap gap-inline-gap">
            {photoFiles.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center gap-tight-gap rounded-xs border border-card bg-surface-page px-tight-gap py-0.5 text-label text-muted"
              >
                {file.name}
                <button
                  type="button"
                  onClick={() =>
                    setPhotoFiles((prev) => prev.filter((_, j) => j !== i))
                  }
                  aria-label={`Remove ${file.name}`}
                  className="text-muted hover:text-critical"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-inline-gap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingPhotos}
            aria-label="Add photo"
          >
            <Icon src={icons.image} />
          </IconButton>
          {isProcessingPhotos && (
            <span className="text-body-small text-muted">
              Preparing photos…
            </span>
          )}
        </div>

        {error && <p className="text-body-small text-critical">{error}</p>}
      </div>
    </Modal>
  )
}

export default AddNoteModal
