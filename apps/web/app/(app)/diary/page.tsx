'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { DiaryListRow } from '@/components/DiaryListRow'
import { DiaryDetailDrawer } from '@/components/DiaryDetailDrawer'
import { samplePlantDiaries } from '@/lib/sample-diary'
import { parseISODate } from '@/lib/utils'

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
    <div className="max-w-[669px] pb-16 pt-12">
      <header className="flex flex-col gap-[var(--space-card-padding)]">
        <div className="flex max-w-[407px] flex-col gap-[var(--space-item-gap)]">
          <h1 className="text-[length:var(--font-size-page-title)] font-semibold tracking-[-0.04em] text-[var(--text-page-title)]">
            Plant Diary
          </h1>
          <p className="text-[length:var(--font-size-body)] text-[var(--text-page-subtitle)]">
            Save notes, photos, and seasonal changes as your plants evolve.
          </p>
        </div>

        <button
          type="button"
          className="flex h-11 w-[222px] items-center gap-[var(--space-tight-gap)] rounded-[var(--radius-md)] border border-white bg-[var(--color-background-card)] p-[var(--space-item-gap)] text-left transition-colors duration-[var(--duration-normal)] hover:bg-[var(--color-background-subtle)]"
        >
          <span className="flex h-5 shrink-0 items-center">
            <span className="relative -mr-2 h-5 w-[14px] overflow-hidden rounded-[var(--radius-xs)] border border-white">
              <Image
                src="/diary/note-photo-01.png"
                alt=""
                fill
                sizes="14px"
                className="object-cover"
              />
            </span>
            <span className="relative h-5 w-[19px] overflow-hidden rounded-[var(--radius-xs)] border border-white">
              <Image
                src="/diary/note-photo-02.png"
                alt=""
                fill
                sizes="19px"
                className="object-cover"
              />
            </span>
          </span>
          <span className="flex-1 text-[length:var(--font-size-body)] leading-normal text-[var(--text-button-label)]">
            Garden reflections
          </span>
          <Image
            src="/icons/icon-arrow-right.svg"
            alt=""
            width={16}
            height={16}
          />
        </button>
      </header>

      <div className="mt-12 flex items-center justify-between">
        <h2 className="text-[length:var(--font-size-20)] font-semibold text-[var(--text-subsection-title)]">
          Plants
        </h2>
        <button
          type="button"
          aria-label="Filter diary entries"
          className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-[var(--duration-normal)] hover:bg-[var(--color-background-overlay)]"
        >
          <Image src="/icons/icon-filter.svg" alt="" width={16} height={16} />
        </button>
      </div>

      <div className="mt-[var(--space-row-gap)] flex flex-col gap-[var(--space-inline-gap)]">
        {diaries.map((diary) => (
          <DiaryListRow
            key={diary.id}
            diary={diary}
            selected={diary.id === selectedId}
            onClick={() => setSelectedId(diary.id)}
          />
        ))}
      </div>

      {selected && (
        <DiaryDetailDrawer
          diary={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
