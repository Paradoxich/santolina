import Image from 'next/image'
import type { PlantDiary } from '@/types/diary'
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

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={[
        'flex w-full items-start gap-[var(--space-item-gap)] p-[var(--space-row-gap)] text-left transition-colors duration-[var(--duration-normal)]',
        selected
          ? 'rounded-[var(--radius-lg)] border border-card bg-[var(--color-background-card)]'
          : 'border-b border-card hover:rounded-[var(--radius-lg)] hover:border-transparent hover:bg-[var(--color-background-hover)]',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-tight-gap)]">
        <h3 className="text-[length:var(--font-size-body)] font-semibold text-[var(--text-list-title)]">
          {diary.plantName}
        </h3>
        {latest && (
          <p className="truncate text-[length:var(--font-size-body)] leading-normal text-[var(--text-list-description)]">
            {latest.text}
          </p>
        )}
      </div>
      {diary.thumbnailUrl && (
        <div className="relative size-[38px] shrink-0 overflow-hidden rounded-[var(--radius-sm)]">
          <Image
            src={diary.thumbnailUrl}
            alt=""
            fill
            sizes="38px"
            className="object-cover"
          />
        </div>
      )}
      {latest && (
        <span className="w-[60px] shrink-0 text-right text-[length:var(--font-size-label)] text-[var(--text-timestamp)]">
          {formatDayLabel(latest.date)}
        </span>
      )}
    </button>
  )
}

export default DiaryListRow
