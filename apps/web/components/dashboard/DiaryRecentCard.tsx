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

  if (recent.length === 0) {
    return (
      <Panel title="Diary" meta="0 recent" className="h-full">
        <p className="text-body-small text-muted">No diary entries yet.</p>
      </Panel>
    )
  }

  return (
    <Panel title="Diary" meta={`${recent.length} recent`} className="h-full">
      <ul className="flex w-full flex-col">
        {recent.map((entry, i) => (
          <li
            key={entry.plantName}
            className="flex w-full items-center gap-row-gap border-b border-divider py-item-gap"
          >
            <span className="w-[38px] shrink-0 text-label text-muted">
              {formatDayLabel(entry.date)}
            </span>
            <span className="flex min-w-0 items-center gap-tight-gap">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-xs"
                style={{
                  backgroundColor: diaryDotColors[i % diaryDotColors.length],
                }}
              />
              <span className="truncate text-body text-primary">
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
