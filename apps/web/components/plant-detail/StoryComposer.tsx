import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Chip, FormError, Icon, IconButton } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import {
  DIARY_EVENT_TYPES,
  DIARY_EVENT_LABELS,
  type DiaryEventType,
} from '@/lib/diary-events'
import { processPhotoFiles } from '@/lib/photo-processing'
import { addDiaryEntry } from '@/server/diary-actions'
import { addToPalette } from '@/server/palette-actions'

interface StoryComposerProps {
  plantId: string
  paletteId: string | null
  /** Currently planted — editable composer vs. read-only "add back" state. */
  isGrowing: boolean
  /** Notifies the page's palette state after a successful re-add, so the page's own header actions and Story eligibility flip immediately. */
  onAddedBackToGarden: (result: { paletteId: string }) => void
}

/**
 * The plant's capture surface: quick-action chips + a chat-style note input,
 * pinned to the bottom of the plant page — see StorySection for the
 * timeline it feeds. One home for this content across the app.
 */
export function StoryComposer({
  plantId,
  paletteId,
  isGrowing,
  onAddedBackToGarden,
}: StoryComposerProps) {
  const router = useRouter()

  const [noteText, setNoteText] = useState('')
  // Multi-select: more than one care event can be true of a single visit
  // (watered and pruned on the same day), so an entry carries a set of events.
  const [selectedEvents, setSelectedEvents] = useState<DiaryEventType[]>([])
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [isReAdding, setIsReAdding] = useState(false)
  const [reAddError, setReAddError] = useState<string | null>(null)

  const resetComposer = () => {
    setNoteText('')
    setSelectedEvents([])
    setPhotoFiles([])
    setComposerError(null)
    const el = textareaRef.current
    if (el) el.style.height = 'auto'
  }

  /** Grows the single-line input with its content, chat-style, up to a cap. */
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  // Picked photos are downscaled and re-encoded to JPEG in the browser
  // before upload — see lib/photo-processing.ts for why (size cap, HEIC,
  // EXIF). Undecodable files are dropped with a message instead of being
  // uploaded as photos that would never render.
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (picked.length === 0) return

    setIsProcessingPhotos(true)
    try {
      const { files, failedNames } = await processPhotoFiles(picked)
      if (files.length > 0) setPhotoFiles((prev) => [...prev, ...files])
      setComposerError(
        failedNames.length > 0
          ? `Couldn't read ${failedNames.join(', ')}. Try a JPG or PNG.`
          : null
      )
    } finally {
      setIsProcessingPhotos(false)
    }
  }

  const removePhoto = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveNote = async () => {
    const trimmed = noteText.trim()
    // Event-only entries are valid — a typed event carries its own meaning
    // (the auto "planted" event is exactly this shape), so a note or photo
    // isn't required when one or more event chips are selected.
    if (!trimmed && photoFiles.length === 0 && selectedEvents.length === 0) {
      setComposerError('Add a note')
      return
    }

    // Store events in the canonical vocabulary order regardless of click order.
    const eventTypes = DIARY_EVENT_TYPES.filter((e) =>
      selectedEvents.includes(e)
    )

    setIsSubmitting(true)
    setComposerError(null)
    try {
      await addDiaryEntry({
        plantId,
        paletteId,
        note: trimmed || undefined,
        eventTypes,
        photoFiles: photoFiles.length > 0 ? photoFiles : undefined,
      })
      router.refresh()
      resetComposer()
    } catch (err) {
      setComposerError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddBackToGarden = async () => {
    setIsReAdding(true)
    setReAddError(null)
    try {
      const result = await addToPalette({
        plantId,
        status: 'planted',
        source: 'manual',
      })
      onAddedBackToGarden({ paletteId: result.id })
      router.refresh()
    } catch (err) {
      setReAddError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setIsReAdding(false)
    }
  }

  const composerPlaceholder =
    selectedEvents.length > 0
      ? 'Add an optional note.'
      : "What's new with this plant?"

  if (!isGrowing) {
    return (
      <div className="sticky bottom-0 flex w-full shrink-0 flex-col gap-inline-gap border-t border-card bg-surface-card p-card-padding">
        <p className="text-body-small text-muted">
          No longer in your garden. Notes are read-only.
        </p>
        <Button
          variant="control"
          size="sm"
          onClick={handleAddBackToGarden}
          disabled={isReAdding}
          className="w-full justify-between"
        >
          {isReAdding ? 'Adding back…' : 'Add back to garden'}
          <Icon src={icons.arrowRight} />
        </Button>
        {reAddError && <FormError>{reAddError}</FormError>}
      </div>
    )
  }

  return (
    <div className="sticky bottom-0 flex w-full shrink-0 flex-col gap-inline-gap border-t border-card bg-surface-card p-card-padding">
      <div className="flex flex-wrap gap-tight-gap">
        {DIARY_EVENT_TYPES.map((event) => {
          const active = selectedEvents.includes(event)
          return (
            <Chip
              key={event}
              selected={active}
              onClick={() =>
                setSelectedEvents((prev) =>
                  active ? prev.filter((e) => e !== event) : [...prev, event]
                )
              }
            >
              {DIARY_EVENT_LABELS[event]}
            </Chip>
          )
        })}
      </div>

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
                onClick={() => removePhoto(i)}
                aria-label={`Remove ${file.name}`}
                className="text-muted hover:text-critical"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {composerError && <FormError>{composerError}</FormError>}

      <div className="flex w-full items-end gap-tight-gap rounded-md border border-card bg-surface-overlay p-tight-gap">
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
          aria-label="Add photo"
        >
          <Icon src={icons.image} />
        </IconButton>
        <textarea
          ref={textareaRef}
          value={noteText}
          onChange={(e) => {
            setNoteText(e.target.value)
            autoGrow(e.target)
          }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter inserts a newline — chat convention.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!isSubmitting && !isProcessingPhotos) void handleSaveNote()
            }
          }}
          placeholder={composerPlaceholder}
          rows={1}
          className="w-full flex-1 resize-none self-center bg-transparent py-1 text-body text-primary placeholder:text-muted focus:outline-none"
        />
        <IconButton
          variant="primary"
          size="sm"
          onClick={handleSaveNote}
          disabled={isSubmitting || isProcessingPhotos}
          aria-label="Add entry"
        >
          <Icon src={icons.arrowRight} />
        </IconButton>
      </div>
    </div>
  )
}

export default StoryComposer
