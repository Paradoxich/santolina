'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Button,
  EmptyState,
  FormError,
  Icon,
  IconButton,
  Lightbox,
  Modal,
  Tooltip,
  useToast,
} from '@paradoxui/ui'
import { failureMessage } from '@/lib/failure'
import { icons } from '@/lib/icons'
import { DIARY_EVENT_LABELS } from '@/lib/diary-events'
import { formatDayLabel, formatMonthLabel } from '@/lib/utils'
import { deleteDiaryEntry } from '@/server/diary-actions'
import { useAddNote } from '@/components/AddNoteProvider'
import { SubpageHeader } from '@/components/SubpageHeader'
import type { RecentActivityEntry } from '@/lib/diary'

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** Groups entries by month, preserving the newest-first order of the data. */
function groupByMonth(
  entries: RecentActivityEntry[]
): [string, RecentActivityEntry[]][] {
  const groups = new Map<string, RecentActivityEntry[]>()
  for (const entry of entries) {
    const month = formatMonthLabel(entry.date)
    const group = groups.get(month)
    if (group) {
      group.push(entry)
    } else {
      groups.set(month, [entry])
    }
  }
  return Array.from(groups.entries())
}

export interface ActivityClientProps {
  entries: RecentActivityEntry[]
  title?: string
  backHref?: string
  backLabel?: string
  /**
   * When false, hide the plant name column — used for a single plant's notes
   * list, where every row is already about that plant.
   */
  showPlantLink?: boolean
  emptyMessage?: string
}

/**
 * The archive list: entries newest first, grouped by month. Used for the
 * garden-wide Recent activity page and the plant-scoped Notes page. Capture
 * lives in the add-note dialog; deletion is here because these rows have
 * nowhere else to be removed from.
 */
export function ActivityClient({
  entries,
  title = 'Recent activity',
  backHref = '/overview',
  backLabel = 'Overview',
  showPlantLink = true,
  emptyMessage = 'Nothing logged yet. Add your first note.',
}: ActivityClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { openAddNote } = useAddNote()

  const [toDelete, setToDelete] = useState<RecentActivityEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{
    images: { src: string; alt: string }[]
    index: number
  } | null>(null)

  const monthGroups = groupByMonth(entries)

  const handleConfirmDelete = async () => {
    if (!toDelete) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteDiaryEntry({ entryId: toDelete.id })
      router.refresh()
      toast({ groupKey: toDelete.id, message: 'Note deleted.' })
      setToDelete(null)
    } catch (err) {
      setDeleteError(
        failureMessage(err, 'Could not delete that note. Try again.')
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="pb-16">
      <SubpageHeader backHref={backHref} backLabel={backLabel} />

      <div className="max-w-content pt-8 md:pt-12">
        <h1 className="text-title font-semibold text-primary">{title}</h1>

        {entries.length === 0 ? (
          <EmptyState
            className="mt-11"
            message={emptyMessage}
            ctaLabel="Add note"
            onCtaClick={openAddNote}
          />
        ) : (
          <div className="mt-8 flex flex-col gap-section-gap">
            {monthGroups.map(([month, monthEntries]) => (
              <section key={month} className="flex flex-col">
                <h2 className="pb-item-gap text-label font-medium uppercase tracking-label text-muted">
                  {month}
                </h2>
                <ul className="flex flex-col border-t border-sage-200">
                  {monthEntries.map((entry) => {
                    const images = entry.photoUrls.map((src, i) => ({
                      src,
                      alt: `${entry.plantName ?? 'Garden'} photo ${i + 1}`,
                    }))
                    const plantLabel = entry.plantName ?? 'Your garden'

                    return (
                      <li
                        key={entry.id}
                        className="group flex items-center gap-row-gap border-b border-sage-200 py-item-gap"
                      >
                        <span className="w-[52px] shrink-0 text-label text-muted">
                          {formatDayLabel(entry.date)}
                        </span>

                        <div className="flex min-w-0 flex-1 flex-col gap-tight-gap">
                          {entry.text ? (
                            <p className="text-body leading-normal text-primary">
                              {entry.text}
                            </p>
                          ) : entry.eventTypes.length === 0 &&
                            images.length === 0 ? (
                            <p className="text-body text-muted">Empty note</p>
                          ) : null}

                          {entry.eventTypes.length > 0 && (
                            <div className="flex flex-wrap gap-tight-gap">
                              {entry.eventTypes.map((event) => (
                                <span
                                  key={event}
                                  className="w-fit rounded-full bg-surface-overlay px-1.5 py-0.5 text-label text-muted"
                                >
                                  {DIARY_EVENT_LABELS[event]}
                                </span>
                              ))}
                            </div>
                          )}

                          {images.length > 0 && (
                            <div className="flex flex-wrap gap-inline-gap">
                              {images.map((image, i) => (
                                <button
                                  key={image.src}
                                  type="button"
                                  onClick={() =>
                                    setLightbox({ images, index: i })
                                  }
                                  aria-label={`View photo ${i + 1}`}
                                  className="relative h-[79px] w-[93px] shrink-0 cursor-pointer overflow-hidden rounded-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                                >
                                  <Image
                                    src={image.src}
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

                        {showPlantLink &&
                          (entry.plantId ? (
                            <Link
                              href={`/plants/${entry.plantId}`}
                              className="shrink-0 text-body-small text-secondary underline-offset-2 hover:underline"
                            >
                              {plantLabel}
                            </Link>
                          ) : (
                            <span className="shrink-0 text-body-small text-secondary">
                              {plantLabel}
                            </span>
                          ))}

                        <div className="shrink-0 md:opacity-0 md:transition-opacity md:duration-normal md:group-hover:opacity-100 md:focus-within:opacity-100">
                          <Tooltip content="Delete note" position="bottom">
                            <IconButton
                              variant="ghost"
                              size="sm"
                              onClick={() => setToDelete(entry)}
                              aria-label="Delete note"
                            >
                              <Icon src={icons.trashCritical} />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          isOpen
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      <Modal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Delete this note?"
        size="sm"
        footer={
          <>
            <Button
              variant="control"
              size="sm"
              onClick={() => setToDelete(null)}
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
              {isDeleting ? 'Deleting…' : 'Delete note'}
            </Button>
          </>
        }
      >
        <p className="text-body text-secondary">
          {toDelete?.photoUrls.length
            ? `This will permanently delete this note and ${pluralize(toDelete.photoUrls.length, 'photo')}. This can't be undone.`
            : `This will permanently delete this note. This can't be undone.`}
        </p>
        {deleteError && (
          <FormError className="mt-inline-gap">{deleteError}</FormError>
        )}
      </Modal>
    </div>
  )
}

export default ActivityClient
