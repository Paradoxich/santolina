import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Button,
  DrawerSection,
  FormError,
  Icon,
  IconButton,
  Lightbox,
  Menu,
  Modal,
  Tooltip,
  useToast,
} from '@paradoxui/ui'
import type { MenuItem } from '@paradoxui/ui'
import { failureMessage } from '@/lib/failure'
import { icons } from '@/lib/icons'
import { DIARY_EVENT_LABELS } from '@/lib/diary-events'
import type { DiaryNote } from '@/types/diary'
import { formatDayLabel, formatMonthLabel } from '@/lib/utils'
import { deleteDiaryEntry, deleteDiaryThread } from '@/server/diary-actions'

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
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

/** Flattens every note's photos into one ordered list, for a single shared Lightbox across the whole timeline. */
export function flattenNotePhotos(notes: DiaryNote[], plantName: string) {
  const images: { src: string; alt: string }[] = []
  const offsetByNoteId = new Map<string, number>()
  for (const note of notes) {
    offsetByNoteId.set(note.id, images.length)
    for (const photo of note.photos ?? []) {
      images.push({
        src: photo.src,
        alt: `${plantName} note photo ${images.length + 1}`,
      })
    }
  }
  return { images, offsetByNoteId }
}

function NoteCard({
  note,
  onDelete,
  onPhotoClick,
  photoOffset,
}: {
  note: DiaryNote
  /** Present only when the note can be deleted (growing plants). */
  onDelete?: (note: DiaryNote) => void
  /** Called with the photo's index into the plant's full story photo list. */
  onPhotoClick: (index: number) => void
  /** This note's first photo's index into the plant's full story photo list. */
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
                // Keyed by position: signed URLs are not stable identifiers,
                // and the same photo can legitimately appear twice in a note.
                key={photoOffset + i}
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

interface StorySectionProps {
  plantId: string
  plantName: string
  notes: DiaryNote[]
  /** Currently planted — gates whether notes can be deleted at all (a removed plant's story is read-only). */
  isGrowing: boolean
}

/**
 * The plant's story: a month-grouped notes timeline. One home for this
 * content across the app — see docs/architecture.md for the diary-to-plant
 * one-home principle. Composer lives separately (StoryComposer), pinned to
 * the page rather than nested in this scrollable section.
 */
export function StorySection({
  plantId,
  plantName,
  notes,
  isGrowing,
}: StorySectionProps) {
  const router = useRouter()
  const { toast } = useToast()
  const monthGroups = groupNotesByMonth(notes)
  const { images: allPhotos, offsetByNoteId } = flattenNotePhotos(
    notes,
    plantName
  )

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [noteToDelete, setNoteToDelete] = useState<DiaryNote | null>(null)
  const [isDeletingNote, setIsDeletingNote] = useState(false)
  const [noteDeleteError, setNoteDeleteError] = useState<string | null>(null)

  const noteCount = notes.length
  const photoCount = notes.reduce(
    (sum, note) => sum + (note.photos?.length ?? 0),
    0
  )

  const handleConfirmClear = async () => {
    setIsClearing(true)
    setClearError(null)
    try {
      await deleteDiaryThread({ plantId })
      router.refresh()
      toast({
        groupKey: plantId,
        message: `${plantName}'s notes were cleared.`,
      })
      setIsClearDialogOpen(false)
    } catch (err) {
      setClearError(
        failureMessage(err, 'Could not clear these notes. Try again.')
      )
    } finally {
      setIsClearing(false)
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
        groupKey: plantId,
        message: `A note was deleted from ${plantName}'s story.`,
      })
      setNoteToDelete(null)
    } catch (err) {
      setNoteDeleteError(
        failureMessage(err, 'Could not delete that note. Try again.')
      )
    } finally {
      setIsDeletingNote(false)
    }
  }

  return (
    <DrawerSection label="Story">
      <div className="flex w-full flex-col gap-item-gap">
        <div className="flex w-full shrink-0 items-center justify-between gap-inline-gap">
          <h3 className="text-body font-semibold text-primary">Notes</h3>
          {isGrowing && (
            <Tooltip content="Clear notes" position="bottom">
              {/* Hover handlers go on this span, not the button — disabled
                  buttons don't reliably fire mouse events. */}
              <span className="inline-flex">
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsClearDialogOpen(true)}
                  disabled={noteCount === 0}
                  aria-label="Clear notes"
                >
                  <Icon src={icons.trash} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </div>

        {noteCount === 0 ? (
          <p className="text-body-small text-muted">
            No notes yet. Add one below.
          </p>
        ) : (
          monthGroups.map(([month, monthNotes]) => (
            <section
              key={month}
              className="flex w-full shrink-0 flex-col gap-item-gap"
            >
              <h4 className="text-label font-medium uppercase tracking-label text-muted">
                {month}
              </h4>
              <div className="flex w-full flex-col gap-tight-gap">
                {monthNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onDelete={isGrowing ? setNoteToDelete : undefined}
                    onPhotoClick={setLightboxIndex}
                    photoOffset={offsetByNoteId.get(note.id) ?? 0}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <Lightbox
        images={allPhotos}
        isOpen={lightboxIndex !== null}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />

      <Modal
        isOpen={isClearDialogOpen}
        onClose={() => setIsClearDialogOpen(false)}
        title={`Clear all notes for ${plantName}?`}
        size="sm"
        footer={
          <>
            <Button
              variant="control"
              size="sm"
              onClick={() => setIsClearDialogOpen(false)}
              disabled={isClearing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmClear}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing…' : 'Clear notes'}
            </Button>
          </>
        }
      >
        <p className="text-body text-secondary">
          {`This will permanently delete ${pluralize(noteCount, 'note')} and ${pluralize(photoCount, 'photo')}. This can't be undone.`}
        </p>
        {clearError && (
          <FormError className="mt-inline-gap">{clearError}</FormError>
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
          <FormError className="mt-inline-gap">{noteDeleteError}</FormError>
        )}
      </Modal>
    </DrawerSection>
  )
}

export default StorySection
