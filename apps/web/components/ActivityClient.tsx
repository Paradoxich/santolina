'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  Lightbox,
  Modal,
  Tabs,
  Tooltip,
  useToast,
} from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { DIARY_EVENT_LABELS } from '@/lib/diary-events'
import { formatDayLabel, formatMonthLabel } from '@/lib/utils'
import { deleteDiaryEntry } from '@/server/diary-actions'
import { useAddNote } from '@/components/AddNoteProvider'
import type { RecentActivityEntry } from '@/lib/diary'

type ActivityFilter = 'all' | 'garden' | 'plants'

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

/**
 * The archive: every entry in the garden, newest first. Read-only apart
 * from deletion — capture lives in the add-note dialog, and a plant's own
 * page remains the place to read one plant's story in isolation. Deletion
 * is here because a garden-level entry has nowhere else to be removed from.
 */
export function ActivityClient({
  entries,
}: {
  entries: RecentActivityEntry[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { openAddNote } = useAddNote()

  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [toDelete, setToDelete] = useState<RecentActivityEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{
    images: { src: string; alt: string }[]
    index: number
  } | null>(null)

  const gardenCount = entries.filter((e) => e.plantId === null).length
  const plantCount = entries.length - gardenCount

  const visible = entries.filter((entry) =>
    filter === 'garden'
      ? entry.plantId === null
      : filter === 'plants'
        ? entry.plantId !== null
        : true
  )
  const monthGroups = groupByMonth(visible)

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
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-[669px] pb-16 pt-8 md:pt-12">
      <Link
        href="/overview"
        className="flex w-fit items-center gap-tight-gap text-body text-secondary transition-colors duration-normal hover:text-primary"
      >
        <Icon src={icons.arrowRight} className="rotate-180" />
        Overview
      </Link>

      <header className="mt-6 flex flex-col gap-item-gap">
        <h1 className="text-title font-semibold text-primary">
          Recent activity
        </h1>
        <p className="text-body text-secondary">
          Everything you have logged, newest first.
        </p>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          className="mt-11"
          message="Nothing logged yet. Add your first note."
          ctaLabel="Add note"
          onCtaClick={openAddNote}
        />
      ) : (
        <>
          <div className="mt-8">
            <Tabs
              items={[
                { value: 'all', label: 'All', count: entries.length },
                { value: 'garden', label: 'Garden', count: gardenCount },
                { value: 'plants', label: 'Plants', count: plantCount },
              ]}
              value={filter}
              onChange={(value) => setFilter(value as ActivityFilter)}
            />
          </div>

          {visible.length === 0 ? (
            <p className="mt-8 text-body text-muted">
              {filter === 'garden'
                ? 'No notes about the garden itself yet.'
                : 'No notes on your plants yet.'}
            </p>
          ) : (
            <div className="mt-8 flex flex-col gap-section-gap">
              {monthGroups.map(([month, monthEntries]) => (
                <section key={month} className="flex flex-col gap-item-gap">
                  <h2 className="text-label font-medium uppercase tracking-label text-muted">
                    {month}
                  </h2>
                  <div className="flex flex-col gap-tight-gap">
                    {monthEntries.map((entry) => {
                      const images = entry.photoUrls.map((src, i) => ({
                        src,
                        alt: `${entry.plantName ?? 'Garden'} photo ${i + 1}`,
                      }))
                      return (
                        <article
                          key={entry.id}
                          className="group relative flex w-full gap-item-gap rounded-md bg-fern-100 p-item-gap"
                        >
                          <span className="w-[52px] shrink-0 text-label leading-6 text-muted">
                            {formatDayLabel(entry.date)}
                          </span>

                          <div className="flex min-w-0 flex-1 flex-col gap-inline-gap">
                            {/* A plant entry can be read in full on its own
                                page; a garden entry has no such destination. */}
                            {entry.plantId ? (
                              <Link
                                href={`/plants?plant=${entry.plantId}`}
                                className="w-fit text-body font-semibold text-primary underline-offset-2 hover:underline"
                              >
                                {entry.plantName}
                              </Link>
                            ) : (
                              <span className="text-body font-semibold text-primary">
                                Your garden
                              </span>
                            )}

                            {entry.text && (
                              <p className="text-body leading-normal text-primary">
                                {entry.text}
                              </p>
                            )}

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
                                    className="relative h-[79px] w-[93px] shrink-0 cursor-pointer overflow-hidden rounded-xs transition-opacity duration-normal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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

                          <div className="absolute right-inline-gap top-inline-gap md:opacity-0 md:transition-opacity md:duration-normal md:group-hover:opacity-100 md:focus-within:opacity-100">
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
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

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
          <p className="mt-inline-gap text-body-small text-critical">
            {deleteError}
          </p>
        )}
      </Modal>
    </div>
  )
}

export default ActivityClient
