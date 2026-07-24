import { useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Button,
  Chip,
  Drawer,
  Icon,
  IconButton,
  Lightbox,
  Menu,
  Modal,
  Tooltip,
  useToast,
} from '@paradoxui/ui'
import type { MenuItem } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { DRAWER_MOTION } from '@/lib/drawer-motion'
import {
  DIARY_EVENT_TYPES,
  DIARY_EVENT_LABELS,
  type DiaryEventType,
} from '@/lib/diary-events'
import type { DiaryNote, PlantDiary } from '@/types/diary'
import { formatDayLabel, formatMonthLabel } from '@/lib/utils'
import { processPhotoFiles } from '@/lib/photo-processing'
import {
  addDiaryEntry,
  deleteDiaryEntry,
  deleteDiaryThread,
} from '@/server/diary-actions'
import { addToPalette } from '@/server/palette-actions'

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

interface DiaryDetailDrawerProps {
  diary: PlantDiary
  onClose: () => void
}

/** Groups notes by month, preserving the newest-first order of the data. */
function groupNotesByMonth(notes: DiaryNote[]): [string, DiaryNote[]][] {
  const groups = new Map<string, DiaryNote[]>()
  for (const note of notes) {
    const month = formatMonthLabel(note.date)
    const group = groups.get(month)
    if (group) {
      group.push(note)
    } else {
      groups.set(month, [note])
    }
  }
  return Array.from(groups.entries())
}

function NoteCard({
  note,
  onDelete,
  onPhotoClick,
  photoOffset,
}: {
  note: DiaryNote
  /** Present only when the note can be deleted (growing threads). */
  onDelete?: (note: DiaryNote) => void
  /** Called with the photo's index into the plant's full photo list. */
  onPhotoClick: (index: number) => void
  /** This note's first photo's index into the plant's full photo list. */
  photoOffset: number
}) {
  const { toast } = useToast()

  const menuItems: MenuItem[] = []
  if (note.text) {
    menuItems.push({
      label: 'Copy text',
      icon: <Icon src={icons.copy} size={16} />,
      onSelect: () => {
        void navigator.clipboard.writeText(note.text)
        toast({ groupKey: note.id, message: 'Note copied' })
      },
    })
  }
  if (onDelete) {
    menuItems.push({
      label: 'Delete note',
      icon: <Icon src={icons.trashCritical} size={16} />,
      tone: 'critical',
      onSelect: () => onDelete(note),
    })
  }

  return (
    <article className="group relative flex w-full items-end gap-item-gap rounded-md bg-fern-100 p-inline-gap">
      <div className="flex min-w-0 flex-1 flex-col gap-inline-gap">
        {note.text && (
          <p className="text-body leading-normal text-primary">{note.text}</p>
        )}
        {note.eventTypes.length > 0 && (
          <div className="flex flex-wrap gap-tight-gap">
            {note.eventTypes.map((event) => (
              <span
                key={event}
                className="w-fit rounded-full bg-surface-overlay px-1.5 py-0.5 text-label text-muted"
              >
                {DIARY_EVENT_LABELS[event]}
              </span>
            ))}
          </div>
        )}
        {note.photos && note.photos.length > 0 && (
          <div className="flex gap-inline-gap">
            {note.photos.map((photo, i) => (
              <button
                key={photo.src}
                type="button"
                onClick={() => onPhotoClick(photoOffset + i)}
                aria-label={`View photo ${photoOffset + i + 1}`}
                className="relative h-[79px] shrink-0 cursor-pointer overflow-hidden rounded-xs transition-opacity duration-normal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                style={{ width: photo.width }}
              >
                <Image
                  src={photo.src}
                  alt=""
                  fill
                  sizes="93px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="w-[60px] shrink-0 text-right text-label leading-6 text-muted">
        {formatDayLabel(note.date)}
      </span>
      {menuItems.length > 0 && (
        <div className="absolute right-inline-gap top-inline-gap">
          <Menu
            label="Note actions"
            items={menuItems}
            trigger={
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-secondary"
              >
                <path
                  d="M4 6l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            triggerClassName="flex size-6 items-center justify-center rounded-sm border bg-surface-card [border-color:var(--color-sage-100)] transition-colors duration-normal hover:[border-color:var(--color-sage-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:aria-expanded:opacity-100"
          />
        </div>
      )}
    </article>
  )
}

export function DiaryDetailDrawer({ diary, onClose }: DiaryDetailDrawerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const monthGroups = groupNotesByMonth(diary.notes)

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

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [noteToDelete, setNoteToDelete] = useState<DiaryNote | null>(null)
  const [isDeletingNote, setIsDeletingNote] = useState(false)
  const [noteDeleteError, setNoteDeleteError] = useState<string | null>(null)

  const [isReAdding, setIsReAdding] = useState(false)
  const [reAddError, setReAddError] = useState<string | null>(null)

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const noteCount = diary.notes.length
  const photoCount = diary.notes.reduce(
    (sum, note) => sum + (note.photos?.length ?? 0),
    0
  )

  // Flattens every note's photos into one ordered list so the viewer can page
  // across the whole plant's diary, not just the note a photo was opened
  // from. photoOffsetByNoteId records where each note's photos start in
  // that list, so a click inside a NoteCard can resolve to a global index.
  const allPhotos: { src: string; alt: string }[] = []
  const photoOffsetByNoteId = new Map<string, number>()
  for (const note of diary.notes) {
    photoOffsetByNoteId.set(note.id, allPhotos.length)
    for (const photo of note.photos ?? []) {
      allPhotos.push({
        src: photo.src,
        alt: `${diary.plantName} diary photo ${allPhotos.length + 1}`,
      })
    }
  }

  /** Still in the palette — clearing entries here leaves the thread open for new ones, unlike the removed-plant case where it's gone for good. */
  const isGrowing = diary.paletteId !== null

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteDiaryThread({ plantId: diary.plantId })
      router.refresh()
      toast({
        groupKey: diary.plantId,
        message: isGrowing
          ? `${diary.plantName}'s diary entries were cleared.`
          : `${diary.plantName}'s diary entries were deleted.`,
      })
      onClose()
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const handleConfirmDeleteNote = async () => {
    if (!noteToDelete) return
    setIsDeletingNote(true)
    setNoteDeleteError(null)
    try {
      await deleteDiaryEntry({ entryId: noteToDelete.id })
      router.refresh()
      toast({
        groupKey: diary.plantId,
        message: `A note was deleted from ${diary.plantName}'s diary.`,
      })
      setNoteToDelete(null)
    } catch (err) {
      setNoteDeleteError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setIsDeletingNote(false)
    }
  }

  /** Re-adds a removed plant as planted — flips isGrowing back to true via router.refresh(), no navigation needed. */
  const handleAddBackToGarden = async () => {
    setIsReAdding(true)
    setReAddError(null)
    try {
      await addToPalette({
        plantId: diary.plantId,
        status: 'planted',
        source: 'manual',
      })
      router.refresh()
    } catch (err) {
      setReAddError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setIsReAdding(false)
    }
  }

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
        plantId: diary.plantId,
        paletteId: diary.paletteId,
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

  const composerPlaceholder =
    selectedEvents.length > 0
      ? 'Add an optional note.'
      : "What's new with this plant?"

  return (
    <Drawer
      label={`${diary.plantName} diary`}
      onClose={onClose}
      closeLabel="Close diary"
      closeIcon={<Icon src={icons.close} />}
      panelComponent={motion.aside}
      panelProps={DRAWER_MOTION}
      headerActions={
        <>
          <Button
            variant="control"
            size="sm"
            onClick={() =>
              router.push(`/plants?tab=growing&plant=${diary.plantId}`)
            }
          >
            Open plant details
          </Button>
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
      <div className="flex w-full flex-1 flex-col gap-section-break overflow-y-auto p-card-padding">
        <div className="flex w-full shrink-0 flex-col gap-item-gap">
          <h2 className="w-full text-title font-semibold text-primary">
            {diary.plantName} Diary
          </h2>
          <p className="w-full text-body leading-normal text-secondary">
            {diary.summary}
          </p>
        </div>

        <div className="flex w-full flex-1 flex-col gap-item-gap">
          <div className="flex w-full shrink-0 items-center justify-between gap-inline-gap">
            <h3 className="text-body font-semibold text-primary">Notes</h3>
            <Tooltip
              content={isGrowing ? 'Clear diary' : 'Delete diary'}
              position="bottom"
            >
              {/* Hover handlers go on this span, not the button — disabled
                  buttons don't reliably fire mouse events, and this is exactly
                  the state where the tooltip is most useful. */}
              <span className="inline-flex">
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={noteCount === 0}
                  aria-label={isGrowing ? 'Clear diary' : 'Delete diary'}
                >
                  {isGrowing ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"
                        stroke="var(--stroke-0, black)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M22 21H7"
                        stroke="var(--stroke-0, black)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m5 11 9 9"
                        stroke="var(--stroke-0, black)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <Icon src={icons.trash} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </div>

          {monthGroups.map(([month, notes]) => (
            <section
              key={month}
              className="flex w-full shrink-0 flex-col gap-item-gap"
            >
              <h4 className="text-label font-medium uppercase tracking-label text-muted">
                {month}
              </h4>
              <div className="flex w-full flex-col gap-tight-gap">
                {notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onDelete={isGrowing ? setNoteToDelete : undefined}
                    onPhotoClick={setLightboxIndex}
                    photoOffset={photoOffsetByNoteId.get(note.id) ?? 0}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Pinned composer — chat-style input anchored to the bottom of the
          drawer, always visible while the plant is growing. Removed plants get
          the read-only "add back" affordance in the same slot instead. */}
      <div className="flex w-full shrink-0 flex-col gap-inline-gap border-t border-card bg-surface-card p-card-padding">
        {isGrowing ? (
          <>
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

            {composerError && (
              <p className="text-body-small text-critical">{composerError}</p>
            )}

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
                    if (!isSubmitting && !isProcessingPhotos)
                      void handleSaveNote()
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
          </>
        ) : (
          <div className="flex w-full flex-col gap-inline-gap">
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
            {reAddError && (
              <p className="text-body-small text-critical">{reAddError}</p>
            )}
          </div>
        )}
      </div>

      <Lightbox
        images={allPhotos}
        isOpen={lightboxIndex !== null}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />

      <Modal
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        title={
          isGrowing
            ? `Clear all entries for ${diary.plantName}?`
            : `Delete ${diary.plantName}'s diary?`
        }
        size="sm"
        footer={
          <>
            <Button
              variant="control"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isGrowing
                ? isDeleting
                  ? 'Clearing…'
                  : 'Clear diary'
                : isDeleting
                  ? 'Deleting…'
                  : 'Delete diary'}
            </Button>
          </>
        }
      >
        <p className="text-body text-secondary">
          {isGrowing
            ? `This will permanently delete ${pluralize(noteCount, 'note')} and ${pluralize(photoCount, 'photo')} from this diary. The diary itself will remain, ready for new entries. This can't be undone.`
            : `This will permanently delete ${pluralize(noteCount, 'note')} and ${pluralize(photoCount, 'photo')}. This can't be undone.`}
        </p>
        {deleteError && (
          <p className="mt-inline-gap text-body-small text-critical">
            {deleteError}
          </p>
        )}
      </Modal>

      <Modal
        isOpen={noteToDelete !== null}
        onClose={() => setNoteToDelete(null)}
        title="Delete this note?"
        size="sm"
        footer={
          <>
            <Button
              variant="control"
              size="sm"
              onClick={() => setNoteToDelete(null)}
              disabled={isDeletingNote}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDeleteNote}
              disabled={isDeletingNote}
            >
              {isDeletingNote ? 'Deleting…' : 'Delete note'}
            </Button>
          </>
        }
      >
        <p className="text-body text-secondary">
          {noteToDelete?.photos?.length
            ? `This will permanently delete this note and ${pluralize(noteToDelete.photos.length, 'photo')}. This can't be undone.`
            : `This will permanently delete this note. This can't be undone.`}
        </p>
        {noteDeleteError && (
          <p className="mt-inline-gap text-body-small text-critical">
            {noteDeleteError}
          </p>
        )}
      </Modal>
    </Drawer>
  )
}

export default DiaryDetailDrawer
