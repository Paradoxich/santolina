'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchField } from '@paradoxui/ui'
import { ExplorePlantTile } from '@/components/ExplorePlantTile'
import { ExplorePlantListRow } from '@/components/ExplorePlantListRow'
import { PlantDetailDrawer } from '@/components/PlantDetailDrawer'
import type { PlantDetail } from '@/lib/plant-detail'
import type { CatalogPlant } from '@/types/garden'

interface ExploreClientProps {
  plants: CatalogPlant[]
  detail: PlantDetail | null
}

export function ExploreClient({ plants, detail }: ExploreClientProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const openPlant = (id: string) =>
    router.push(`/explore?plant=${id}`, { scroll: false })
  const closeDrawer = () => router.push('/explore', { scroll: false })

  useEffect(() => {
    if (!detail) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push('/explore', { scroll: false })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detail, router])

  const q = query.trim().toLowerCase()
  const visible = q
    ? plants.filter(
        (p) =>
          p.commonName.toLowerCase().includes(q) ||
          p.botanicalName.toLowerCase().includes(q)
      )
    : plants

  return (
    <div
      className={[
        'flex items-start pb-16 pt-12',
        detail ? 'pr-[480px]' : '',
      ].join(' ')}
    >
      <div className={detail ? 'w-full max-w-[680px] shrink-0' : 'flex-1'}>
        <h1 className="text-title font-semibold tracking-[-0.04em] text-primary">
          What to plant next?
        </h1>

        <div className="mt-6">
          <SearchField
            placeholder="Search plants..."
            label="Search plants"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <p className="mt-16 text-body text-secondary">Recommended plants</p>

        {detail ? (
          <div className="mt-4 flex flex-col gap-item-gap">
            {visible.map((plant) => (
              <ExplorePlantListRow
                key={plant.id}
                plant={plant}
                selected={plant.id === detail.plant.id}
                onClick={() => openPlant(plant.id)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-item-gap md:grid-cols-2 xl:grid-cols-3">
            {visible.map((plant) => (
              <ExplorePlantTile
                key={plant.id}
                plant={plant}
                onClick={() => openPlant(plant.id)}
              />
            ))}
          </div>
        )}

        {visible.length === 0 && (
          <p className="mt-8 text-body text-muted">
            No plants found for &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>

      {detail && <PlantDetailDrawer detail={detail} onClose={closeDrawer} />}
    </div>
  )
}

export default ExploreClient
