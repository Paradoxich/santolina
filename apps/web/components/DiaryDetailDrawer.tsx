import { useEffect } from 'react'
import Image from 'next/image'
import type { DiaryNote, PlantDiary } from '@/types/diary'
import { formatDayLabel, formatMonthLabel } from '@/lib/utils'

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

function NoteCard({ note }: { note: DiaryNote }) {
  return (
    <article className="flex w-full items-start gap-item-gap rounded-sm bg-surface-page p-inline-gap">
      <div className="flex min-w-0 flex-1 flex-col gap-inline-gap">
        <p className="text-body leading-normal text-primary">{note.text}</p>
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

export function DiaryDetailDrawer({ diary, onClose }: DiaryDetailDrawerProps) {
  const monthGroups = groupNotesByMonth(diary.notes)

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
    <aside
      aria-label={`${diary.plantName} diary`}
      className="fixed inset-0 z-20 flex w-full flex-col gap-section-break overflow-y-auto bg-surface-card p-card-padding lg:inset-y-0 lg:inset-x-auto lg:right-0 lg:w-[440px] lg:border-l lg:border-card"
    >
      <div className="flex w-full shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close diary"
          className="flex size-8 items-center justify-center rounded-full bg-sage-300 transition-opacity duration-normal hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Image src="/icons/icon-close.svg" alt="" width={16} height={16} />
        </button>

        <div className="flex items-center gap-inline-gap">
          <button
            type="button"
            className="flex h-8 items-center rounded-sm bg-surface-control px-inline-gap text-body-small text-secondary"
          >
            Open plant details
          </button>
          <button
            type="button"
            aria-label="Chat about this plant"
            className="flex size-8 items-center justify-center rounded-full bg-surface-control"
          >
            <Image src="/icons/icon-chat.svg" alt="" width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-item-gap">
        <h2 className="w-full text-title font-semibold tracking-[-0.04em] text-primary">
          {diary.plantName} Diary
        </h2>
        <p className="w-full text-body leading-normal text-secondary">
          {diary.summary}
        </p>
      </div>

      <hr className="w-full shrink-0 border-t border-divider" />

      <div className="flex w-full shrink-0 flex-col gap-card-padding">
        <h3 className="text-body font-semibold text-primary">Your notes</h3>
        <button
          type="button"
          className="flex w-full items-center gap-inline-gap rounded-sm border border-dashed border-card bg-surface-overlay p-item-gap transition-colors duration-normal hover:bg-surface-control"
        >
          <Image src="/icons/icon-plus.svg" alt="" width={16} height={16} />
          <span className="text-body text-secondary">New note</span>
        </button>
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
    </aside>
  )
}

export default DiaryDetailDrawer
