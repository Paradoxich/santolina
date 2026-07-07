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
        'flex w-full items-start gap-item-gap p-row-gap text-left transition-colors duration-normal',
        selected
          ? 'rounded-lg border border-card bg-surface-card'
          : 'border-b border-card hover:rounded-lg hover:border-transparent hover:bg-surface-hover',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-tight-gap">
        <h3 className="text-body font-semibold text-primary">
          {diary.plantName}
        </h3>
        {latest && (
          <p className="truncate text-body leading-normal text-primary">
            {latest.text}
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
      {latest && (
        <span className="w-[60px] shrink-0 text-right text-label text-muted">
          {formatDayLabel(latest.date)}
        </span>
      )}
    </button>
  )
}

export default DiaryListRow
