'use client'

import { useState } from 'react'
import { Chip, Tabs } from '@paradoxui/ui'
import { GardenPlantTile } from '@/components/GardenPlantTile'
import { PlannedPlantTile } from '@/components/PlannedPlantTile'
import { sampleGardenPlants } from '@/lib/sample-garden'
import type { BloomStatus } from '@/types/garden'

type StatusFilter = 'all' | BloomStatus

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'blooming', label: 'Blooming' },
  { value: 'pre-bloom', label: 'Pre-bloom' },
  { value: 'resting', label: 'Resting' },
  { value: 'done', label: 'Done' },
]

export default function MyGardenPage() {
  const [tab, setTab] = useState('growing')
  const [filter, setFilter] = useState<StatusFilter>('all')

  const handleTabChange = (value: string) => {
    setTab(value)
    setFilter('all')
  }

  const growing = sampleGardenPlants.filter((p) => !p.planned)
  const planned = sampleGardenPlants.filter((p) => p.planned)
  const visible =
    tab === 'growing'
      ? filter === 'all'
        ? growing
        : growing.filter((p) => p.status === filter)
      : planned

  const activeTabLabel = tab === 'growing' ? 'Growing' : 'Planned'

  return (
    <div className="pb-16">
      <header className="border-b border-[var(--color-background-card-subtle)] pt-8">
        <Tabs
          items={[
            { value: 'growing', label: 'Growing', count: growing.length },
            { value: 'planned', label: 'Planned', count: planned.length },
          ]}
          value={tab}
          onChange={handleTabChange}
        />
      </header>

      <h1 className="mt-12 text-[length:var(--font-size-page-title)] font-semibold tracking-[-0.04em] text-[var(--text-page-title)]">
        {activeTabLabel}
      </h1>
      <p className="mt-3 text-[length:var(--font-size-body)] text-[var(--text-page-subtitle)]">
        {tab === 'growing'
          ? 'Plants currently in your garden. Sorted by status.'
          : "Plants you want to add. Move into Growing once they're in the ground."}
      </p>

      {tab === 'growing' && (
        <div className="mt-11 flex items-center gap-[var(--space-inline-gap)]">
          {statusFilters.map((s) => (
            <Chip
              key={s.value}
              selected={filter === s.value}
              onClick={() => setFilter(s.value)}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-[var(--space-item-gap)] md:grid-cols-2 xl:grid-cols-3">
        {visible.map((plant) =>
          tab === 'growing' ? (
            <GardenPlantTile key={plant.id} plant={plant} />
          ) : (
            <PlannedPlantTile key={plant.id} plant={plant} />
          )
        )}
      </div>

      {visible.length === 0 && (
        <p className="mt-11 text-[length:var(--font-size-body)] text-[var(--text-meta)]">
          {tab === 'growing'
            ? 'No plants match this filter yet.'
            : 'Nothing planned yet.'}
        </p>
      )}
    </div>
  )
}
