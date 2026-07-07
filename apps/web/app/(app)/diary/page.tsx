'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence } from 'framer-motion'
import { Icon } from '@paradoxui/ui'
import { DiaryListRow } from '@/components/DiaryListRow'
import { DiaryDetailDrawer } from '@/components/DiaryDetailDrawer'
import { samplePlantDiaries } from '@/lib/sample-diary'
import { parseISODate } from '@/lib/utils'
import { icons } from '@/lib/icons'

export default function PlantDiaryPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = samplePlantDiaries.find((d) => d.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected])

  const latestNoteTime = (diary: (typeof samplePlantDiaries)[number]) => {
    const latest = diary.notes[0]
    return latest ? parseISODate(latest.date).getTime() : 0
  }

  const diaries = [...samplePlantDiaries].sort(
    (a, b) => latestNoteTime(b) - latestNoteTime(a)
  )

  return (
    <div className="max-w-[669px] pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-card-padding">
        <div className="flex flex-col gap-item-gap">
          <h1 className="text-title font-semibold tracking-[-0.04em] text-primary">
            Plant Diary
          </h1>
          <p className="text-body text-secondary">
            Save notes, photos, and seasonal changes as your plants evolve.
          </p>
        </div>

        <button
          type="button"
          className="flex h-11 w-[222px] items-center gap-tight-gap rounded-md border border-card bg-surface-card p-item-gap text-left transition-colors duration-normal hover:bg-surface-control"
        >
          <span className="flex h-5 shrink-0 items-center">
            <span className="relative -mr-2 h-5 w-[14px] overflow-hidden rounded-xs border border-card">
              <Image
                src="/diary/note-photo-01.png"
                alt=""
                fill
                sizes="14px"
                className="object-cover"
              />
            </span>
            <span className="relative h-5 w-[19px] overflow-hidden rounded-xs border border-card">
              <Image
                src="/diary/note-photo-02.png"
                alt=""
                fill
                sizes="19px"
                className="object-cover"
              />
            </span>
          </span>
          <span className="flex-1 text-body leading-normal text-secondary">
            Garden reflections
          </span>
          <Icon src={icons.arrowRight} />
        </button>
      </header>

      <div className="mt-8 flex items-center justify-between md:mt-12">
        <h2 className="text-subheading font-semibold text-primary">Plants</h2>
        <button
          type="button"
          aria-label="Filter diary entries"
          className="flex size-8 items-center justify-center rounded-sm transition-colors duration-normal hover:bg-surface-overlay"
        >
          <Icon src={icons.filter} />
        </button>
      </div>

      <div className="mt-row-gap flex flex-col gap-inline-gap">
        {diaries.map((diary) => (
          <DiaryListRow
            key={diary.id}
            diary={diary}
            selected={diary.id === selectedId}
            onClick={() => setSelectedId(diary.id)}
          />
        ))}
      </div>

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
