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

  return (
    <div className="max-w-[669px] pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-item-gap">
        <h1 className="text-title font-semibold text-primary">Plant Diary</h1>
        <p className="text-body text-secondary">
          Save notes, photos, and seasonal changes as your plants evolve.
        </p>
      </header>

      <h2 className="mt-8 text-subheading font-semibold text-primary md:mt-12">
        Notes
      </h2>

      {sortedDiaries.length === 0 ? (
        <EmptyState
          className="mt-row-gap"
          illustration={<EmptyStateIllustration name="diary" />}
          message="Keep diaries for plants you are growing."
          ctaLabel="Explore plants"
          ctaHref="/explore"
          linkComponent={Link}
        />
      ) : (
        <div className="mt-row-gap flex flex-col gap-inline-gap">
          {sortedDiaries.map((diary) => (
            <DiaryListRow
              key={diary.id}
              diary={diary}
              selected={diary.id === selectedId}
              onClick={() => setSelectedId(diary.id)}
            />
          ))}
        </div>
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
