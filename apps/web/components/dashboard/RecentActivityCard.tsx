'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon, IconButton, Panel } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { CardIllustration } from './CardIllustration'
import { activityDotColors } from '@/lib/sample-dashboard'
import { formatDayLabel } from '@/lib/utils'
import { addDiaryEntry } from '@/server/diary-actions'
import type { RecentActivityEntry } from '@/lib/diary'

interface RecentActivityCardProps {
  entries: RecentActivityEntry[]
  /** How many recent entries to show */
  count?: number
}

/**
 * A small module, not a destination — recent notes across the whole garden,
 * plant-attached and garden-level alike, plus a plain freeform capture input
 * for the garden-level ones (weather, first frost, general observations).
 * No chips here: those events don't map to a "did you do this" vocabulary
 * the way plant care actions do. See docs/architecture.md for the diary-to-
 * plant-story migration this replaces.
 */
export function RecentActivityCard({
  entries,
  count = 3,
}: RecentActivityCardProps) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recent = entries.slice(0, count)

  const handleSubmit = async () => {
    const trimmed = note.trim()
    if (!trimmed) return
    setIsSubmitting(true)
    setError(null)
    try {
      await addDiaryEntry({ note: trimmed })
      router.refresh()
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const composer = (
    <div className="flex w-full flex-col gap-tight-gap">
      {error && <p className="text-body-small text-critical">{error}</p>}
      <div className="flex w-full items-center gap-tight-gap rounded-md border border-card bg-surface-overlay p-tight-gap">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isSubmitting) {
              e.preventDefault()
              void handleSubmit()
            }
          }}
          placeholder="Note something about your garden"
          className="w-full flex-1 bg-transparent py-1 text-body text-primary placeholder:text-muted focus:outline-none"
        />
        <IconButton
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || !note.trim()}
          aria-label="Add note"
        >
          <Icon src={icons.arrowRight} />
        </IconButton>
      </div>
    </div>
  )

  if (recent.length === 0) {
    return (
      <Panel
        title="Recent activity"
        className="relative isolate flex min-h-[280px] flex-col gap-item-gap overflow-hidden lg:min-h-0 lg:h-full"
      >
        <CardIllustration name="activity" />
        <p className="max-w-[55%] text-body-small text-muted">
          Nothing logged yet.
        </p>
        <div className="mt-auto">{composer}</div>
      </Panel>
    )
  }

  return (
    <Panel
      title="Recent activity"
      meta={`${recent.length} recent`}
      className="flex h-full flex-col gap-item-gap"
    >
      <ul className="flex w-full flex-col">
        {recent.map((entry, i) => (
          <li
            key={entry.id}
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
                  backgroundColor:
                    activityDotColors[i % activityDotColors.length],
                }}
              />
              <span className="truncate text-body text-primary">
                {entry.plantName ?? 'Your garden'}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {composer}
    </Panel>
  )
}

export default RecentActivityCard
