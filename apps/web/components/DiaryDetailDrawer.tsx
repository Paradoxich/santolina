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
    <article className="flex w-full items-start gap-[var(--space-item-gap)] rounded-[var(--radius-sm)] bg-[var(--color-background-page)] p-[var(--space-inline-gap)]">
      <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-inline-gap)]">
        <p className="text-[length:var(--font-size-body)] leading-normal text-[var(--text-list-description)]">
          {note.text}
        </p>
        {note.photos && note.photos.length > 0 && (
          <div className="flex gap-[var(--space-inline-gap)]">
            {note.photos.map((photo) => (
              <div
                key={photo.src}
                className="relative h-[79px] shrink-0 overflow-hidden rounded-[var(--radius-xs)]"
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
      <span className="w-[60px] shrink-0 text-right text-[length:var(--font-size-label)] text-[var(--text-timestamp)]">
        {formatDayLabel(note.date)}
      </span>
    </article>
  )
}

export function DiaryDetailDrawer({ diary, onClose }: DiaryDetailDrawerProps) {
  const monthGroups = groupNotesByMonth(diary.notes)

  return (
    <aside
      aria-label={`${diary.plantName} diary`}
      className="fixed inset-y-0 right-0 z-20 flex w-[440px] flex-col gap-[var(--space-section-break)] overflow-y-auto border-l border-white bg-[var(--color-background-card)] p-[var(--space-card-padding)]"
    >
      <div className="flex w-full shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close diary"
          className="flex size-8 items-center justify-center rounded-full bg-[var(--color-background-close-button)] transition-opacity duration-[var(--duration-normal)] hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-primary)]"
        >
          <Image src="/icons/icon-close.svg" alt="" width={16} height={16} />
        </button>

        <div className="flex items-center gap-[var(--space-inline-gap)]">
          <button
            type="button"
            className="flex h-8 items-center rounded-[var(--radius-sm)] bg-[var(--color-background-subtle)] px-[var(--space-inline-gap)] text-[length:var(--font-size-body-small)] text-[var(--text-button-label)]"
          >
            Open plant details
          </button>
          <button
            type="button"
            aria-label="Chat about this plant"
            className="flex size-8 items-center justify-center rounded-full bg-[var(--color-background-subtle)]"
          >
            <Image src="/icons/icon-chat.svg" alt="" width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-[var(--space-item-gap)]">
        <h2 className="w-full text-[length:var(--font-size-page-title)] font-semibold tracking-[-0.04em] text-[var(--text-page-title)]">
          {diary.plantName} Diary
        </h2>
        <p className="w-full text-[length:var(--font-size-body)] leading-normal text-[var(--text-page-subtitle)]">
          {diary.summary}
        </p>
      </div>

      <hr className="w-full shrink-0 border-t border-[var(--color-border-divider)]" />

      <div className="flex w-full shrink-0 flex-col gap-[var(--space-card-padding)]">
        <h3 className="text-[length:var(--font-size-body)] font-semibold text-[var(--text-section-title)]">
          Your notes
        </h3>
        <button
          type="button"
          className="flex w-full items-center gap-[var(--space-inline-gap)] rounded-[var(--radius-sm)] border border-dashed border-white bg-[var(--color-background-overlay)] p-[var(--space-item-gap)] transition-colors duration-[var(--duration-normal)] hover:bg-white/70"
        >
          <Image src="/icons/icon-plus.svg" alt="" width={16} height={16} />
          <span className="text-[length:var(--font-size-body)] text-[var(--text-button-label)]">
            New note
          </span>
        </button>
      </div>

      {monthGroups.map(([month, notes]) => (
        <section
          key={month}
          className="flex w-full shrink-0 flex-col gap-[var(--space-item-gap)]"
        >
          <h4 className="text-[length:var(--font-size-label)] font-medium uppercase tracking-[0.05em] text-[var(--text-section-label)]">
            {month}
          </h4>
          <div className="flex w-full flex-col gap-[var(--space-tight-gap)]">
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
