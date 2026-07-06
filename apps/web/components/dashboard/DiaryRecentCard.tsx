import { Panel } from '@paradoxui/ui'
import type { PlantDiary } from '@/types/diary'
import { diaryDotColors } from '@/lib/sample-dashboard'
import { formatDayLabel, parseISODate } from '@/lib/utils'

interface DiaryRecentCardProps {
  diaries: PlantDiary[]
  /** How many recent entries to show */
  count?: number
}

export function DiaryRecentCard({ diaries, count = 3 }: DiaryRecentCardProps) {
  const recent = diaries
    .flatMap((diary) => {
      const latest = diary.notes[0]
      return latest ? [{ plantName: diary.plantName, date: latest.date }] : []
    })
    .sort(
      (a, b) => parseISODate(b.date).getTime() - parseISODate(a.date).getTime()
    )
    .slice(0, count)

  return (
    <Panel title="Diary" meta={`${recent.length} recent`} className="h-full">
      <ul className="flex w-full flex-col">
        {recent.map((entry, i) => (
          <li
            key={entry.plantName}
            className="flex w-full items-center gap-[var(--space-row-gap)] border-b border-[var(--color-border-divider)] py-[var(--space-item-gap)]"
          >
            <span className="w-[38px] shrink-0 text-[length:var(--font-size-label)] text-[var(--text-timestamp)]">
              {formatDayLabel(entry.date)}
            </span>
            <span className="flex min-w-0 items-center gap-[var(--space-tight-gap)]">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[var(--radius-xs)]"
                style={{
                  backgroundColor: diaryDotColors[i % diaryDotColors.length],
                }}
              />
              <span className="truncate text-[length:var(--font-size-body)] text-[var(--text-list-title)]">
                {entry.plantName}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default DiaryRecentCard
