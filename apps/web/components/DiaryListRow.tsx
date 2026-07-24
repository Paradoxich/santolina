import Image from 'next/image'
import { Badge } from '@paradoxui/ui'
import type { PlantDiary } from '@/types/diary'
import { DIARY_EVENT_LABELS } from '@/lib/diary-events'
import { formatDayLabel } from '@/lib/utils'

interface DiaryListRowProps {
  diary: PlantDiary
  selected?: boolean
  onClick?: () => void
}

export function DiaryListRow({
  diary,
  selected = false,
  onClick,
}: DiaryListRowProps) {
  const latest = diary.notes[0]
  // Prefer the note text; otherwise show what the entry captured so the row is
  // never blank — the event label for an event-only entry (e.g. the auto
  // "planted" event), or a photo count for a photo-only one.
  const photoCount = latest?.photos?.length ?? 0
  const preview = latest
    ? latest.text ||
      latest.eventTypes.map((e) => DIARY_EVENT_LABELS[e]).join(', ') ||
      (photoCount > 0
        ? photoCount === 1
          ? 'Added a new photo'
          : `Added ${photoCount} new photos`
        : '')
    : null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={[
        'flex w-full items-start gap-item-gap p-row-gap text-left transition-colors duration-normal',
        selected
          ? 'rounded-lg border border-card bg-surface-card shadow-soft'
          : 'border-b border-card hover:rounded-lg hover:border-transparent hover:bg-surface-subtle',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-tight-gap">
        <h3 className="text-body font-semibold text-primary">
          {diary.plantName}
        </h3>
        {latest ? (
          preview && (
            <p className="truncate text-body leading-normal text-primary">
              {preview}
            </p>
          )
        ) : (
          <p className="truncate text-body leading-normal text-muted">
            Notes you add here build up into this plant&rsquo;s story across the
            seasons.
          </p>
        )}
      </div>
      {diary.thumbnailUrl && (
        <div className="relative size-[38px] shrink-0 overflow-hidden rounded-sm">
          <Image
            src={diary.thumbnailUrl}
            alt=""
            fill
            sizes="38px"
            className="object-cover"
          />
        </div>
      )}
      {(latest || diary.paletteId === null) && (
        <div className="flex shrink-0 flex-col items-end gap-tight-gap">
          {latest && (
            <span className="text-right text-label text-muted">
              {formatDayLabel(latest.date)}
            </span>
          )}
          {diary.paletteId === null && (
            <Badge className="whitespace-nowrap">Removed from garden</Badge>
          )}
        </div>
      )}
    </button>
  )
}

export default DiaryListRow
