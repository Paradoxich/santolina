import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Icon, Modal, useToast } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import type { DiaryNote, PlantDiary } from '@/types/diary'
import { formatDayLabel, formatMonthLabel } from '@/lib/utils'
import { addDiaryEntry, deleteDiaryThread } from '@/server/diary-actions'

/** Mirrors --duration-slow / --ease-in-out — Framer Motion can't read CSS vars. */
const DRAWER_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

interface DiaryDetailDrawerProps {
  diary: PlantDiary
  gardenId: string
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

function NoteCard({ note }: { note: DiaryNote }) {
  return (
    <article className="flex w-full items-start gap-item-gap rounded-sm bg-surface-page p-inline-gap">
      <div className="flex min-w-0 flex-1 flex-col gap-inline-gap">
        {note.text && (
          <p className="text-body leading-normal text-primary">{note.text}</p>
        )}
        {note.photos && note.photos.length > 0 && (
          <div className="flex gap-inline-gap">
            {note.photos.map((photo) => (
              <div
                key={photo.src}
                className="relative h-[79px] shrink-0 overflow-hidden rounded-xs"
                style={{ width: photo.width }}
              >
                <Image
                  src={photo.src}
                  alt=""
                  fill
                  sizes="93px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <span className="w-[60px] shrink-0 text-right text-label text-muted">
        {formatDayLabel(note.date)}
      </span>
    </article>
  )
}

export function DiaryDetailDrawer({
  diary,
  gardenId,
  onClose,
}: DiaryDetailDrawerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const monthGroups = groupNotesByMonth(diary.notes)

  const [isComposing, setIsComposing] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const noteCount = diary.notes.length
  const photoCount = diary.notes.reduce(
    (sum, note) => sum + (note.photos?.length ?? 0),
    0
  )

  /** Still in the palette — clearing entries here leaves the thread open for new ones, unlike the removed-plant case where it's gone for good. */
  const isGrowing = diary.paletteId !== null

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteDiaryThread({ gardenId, plantId: diary.plantId })
      router.refresh()
      toast(
        isGrowing
          ? {
              groupKey: diary.plantId,
              title: 'Entries cleared',
              description: `${diary.plantName}'s diary entries were cleared.`,
            }
          : {
              groupKey: diary.plantId,
              title: 'Diary deleted',
              description: `${diary.plantName}'s diary entries were deleted.`,
            }
      )
      onClose()
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const resetComposer = () => {
    setIsComposing(false)
    setNoteText('')
    setPhotoFiles([])
    setComposerError(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    setPhotoFiles((prev) => [...prev, ...files])
    e.target.value = ''
  }

  const removePhoto = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveNote = async () => {
    const trimmed = noteText.trim()
    if (!trimmed && photoFiles.length === 0) {
      setComposerError('Add a note or a photo first.')
      return
    }

    setIsSubmitting(true)
    setComposerError(null)
    try {
      await addDiaryEntry({
        gardenId,
        plantId: diary.plantId,
        paletteId: diary.paletteId,
        note: trimmed || undefined,
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
      aria-label={`${diary.plantName} diary`}
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
          aria-label="Close diary"
          className="flex size-8 items-center justify-center rounded-full border border-card bg-surface-control transition-opacity duration-normal hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Icon src={icons.close} />
        </button>

        <div className="flex items-center gap-inline-gap">
          <button
            type="button"
            onClick={() => setIsDeleteDialogOpen(true)}
            aria-label={isGrowing ? 'Clear diary' : 'Delete diary'}
            className="flex size-8 items-center justify-center rounded-full border border-card bg-surface-control transition-opacity duration-normal hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
          </button>
          <button
            type="button"
            className="flex h-8 items-center rounded-sm border border-card bg-surface-control px-inline-gap text-body-small text-secondary"
          >
            Open plant details
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
            {diary.plantName} Diary
          </h2>
          <p className="w-full text-body leading-normal text-secondary">
            {diary.summary}
          </p>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-card-padding">
          <h3 className="text-body font-semibold text-primary">Your notes</h3>

          {isComposing ? (
            <div className="flex w-full flex-col gap-inline-gap rounded-sm border border-card bg-surface-overlay p-item-gap">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="What's new with this plant?"
                rows={3}
                autoFocus
                className="w-full resize-none rounded-sm bg-transparent text-body text-primary placeholder:text-muted focus:outline-none"
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

              <div className="flex items-center justify-between gap-inline-gap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-tight-gap text-body-small text-secondary hover:text-primary"
                >
                  <Icon src={icons.plus} size={14} />
                  Add photo
                </button>

                <div className="flex items-center gap-inline-gap">
                  <button
                    type="button"
                    onClick={resetComposer}
                    disabled={isSubmitting}
                    className="text-body-small text-muted hover:text-primary disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    disabled={isSubmitting}
                    className="rounded-sm bg-accent px-item-gap py-1 text-body-small font-medium text-on-accent disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsComposing(true)}
              className="flex w-full items-center gap-inline-gap rounded-sm border border-dashed border-card bg-surface-overlay p-item-gap transition-colors duration-normal hover:bg-surface-control"
            >
              <Icon src={icons.plus} />
              <span className="text-body text-secondary">New note</span>
            </button>
          )}
        </div>

        {monthGroups.map(([month, notes]) => (
          <section
            key={month}
            className="flex w-full shrink-0 flex-col gap-item-gap"
          >
            <h4 className="text-label font-medium uppercase tracking-[0.05em] text-muted">
              {month}
            </h4>
            <div className="flex w-full flex-col gap-tight-gap">
              {notes.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          </section>
        ))}
      </div>

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
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="flex h-8 items-center rounded-sm border border-card bg-surface-control px-inline-gap text-body-small text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="flex h-8 items-center rounded-sm border border-transparent bg-fill-critical px-inline-gap text-body-small text-on-accent hover:bg-fill-critical-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGrowing
                ? isDeleting
                  ? 'Clearing…'
                  : 'Clear diary'
                : isDeleting
                  ? 'Deleting…'
                  : 'Delete diary'}
            </button>
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
    </motion.aside>
  )
}

export default DiaryDetailDrawer
