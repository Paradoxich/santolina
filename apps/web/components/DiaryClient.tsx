'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import { EmptyState } from '@paradoxui/ui'
import { EmptyStateIllustration } from '@/components/EmptyStateIllustration'
import { DiaryListRow } from '@/components/DiaryListRow'
import { DiaryDetailDrawer } from '@/components/DiaryDetailDrawer'
import { parseISODate } from '@/lib/utils'
import type { PlantDiary } from '@/types/diary'

interface DiaryClientProps {
  diaries: PlantDiary[]
  /** Deep-links straight to a plant's thread, e.g. from PlantDetailDrawer's "Open diary" button. */
  initialPlantId?: string | null
}

export function DiaryClient({
  diaries,
  initialPlantId = null,
}: DiaryClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialPlantId)

  const selected = diaries.find((d) => d.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected])

  const latestNoteTime = (diary: PlantDiary) => {
    const latest = diary.notes[0]
    return latest ? parseISODate(latest.date).getTime() : 0
  }

  const sortedDiaries = [...diaries].sort(
    (a, b) => latestNoteTime(b) - latestNoteTime(a)
  )

  // Plants with at least one entry lead the page as its real content; plants
  // still awaiting their first note sink into a quieter group below rather
  // than repeating the same empty-state line once per plant. Removed plants
  // always carry notes (that's why they're listed at all), so they never
  // land in the waiting group.
  const withNotes = sortedDiaries.filter((d) => d.notes.length > 0)
  const awaiting = sortedDiaries.filter((d) => d.notes.length === 0)

  return (
    <div className="max-w-[669px] pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-item-gap">
        <h1 className="text-title font-semibold text-primary">Plant Diary</h1>
        <p className="text-body text-secondary">
          Save notes, photos, and seasonal changes as your plants evolve.
        </p>
      </header>

      {sortedDiaries.length === 0 ? (
        <EmptyState
          className="mt-8 md:mt-12"
          illustration={<EmptyStateIllustration name="diary" />}
          message="Keep diaries for plants you are growing."
          ctaLabel="Explore plants"
          ctaHref="/explore"
          linkComponent={Link}
        />
      ) : (
        <>
          {withNotes.length > 0 && (
            <div className="mt-8 divide-y divide-card-translucent overflow-hidden rounded-card-tile border border-card-translucent bg-surface-card md:mt-12">
              {withNotes.map((diary) => (
                <DiaryListRow
                  key={diary.id}
                  diary={diary}
                  selected={diary.id === selectedId}
                  onClick={() => setSelectedId(diary.id)}
                />
              ))}
            </div>
          )}

          {awaiting.length > 0 && (
            <>
              <h2 className="mt-8 text-body-small font-medium text-muted md:mt-12">
                Waiting for their first note
              </h2>
              <div className="mt-item-gap divide-y divide-card-translucent overflow-hidden rounded-card-tile border border-card-translucent bg-surface-card-translucent">
                {awaiting.map((diary) => (
                  <button
                    key={diary.id}
                    type="button"
                    aria-current={diary.id === selectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(diary.id)}
                    className={[
                      'flex w-full items-center px-row-gap py-item-gap text-left transition-colors duration-normal',
                      diary.id === selectedId
                        ? 'bg-surface-inset'
                        : 'hover:bg-surface-subtle',
                    ].join(' ')}
                  >
                    <span className="text-body font-medium text-secondary">
                      {diary.plantName}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <AnimatePresence>
        {selected && (
          <DiaryDetailDrawer
            key="diary-detail-drawer"
            diary={selected}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default DiaryClient
