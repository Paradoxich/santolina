'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon, IconButton, SearchField } from '@paradoxui/ui'
import { ExploreFilters } from '@/components/ExploreFilters'
import { ExplorePlantTile } from '@/components/ExplorePlantTile'
import { ExplorePlantListRow } from '@/components/ExplorePlantListRow'
import { PlantDetailDrawer } from '@/components/PlantDetailDrawer'
import {
  EMPTY_FILTERS,
  countActiveFilters,
  matchesFilters,
} from '@/lib/explore-filters'
import { icons } from '@/lib/icons'
import type { PlantDetail } from '@/lib/plant-detail'
import type { CatalogPlant } from '@/types/garden'

interface ExploreClientProps {
  plants: CatalogPlant[]
  detail: PlantDetail | null
  /** The garden's resolved WGSRPD Level-2 regions — [] when unknown. */
  gardenRegions: string[]
}

export function ExploreClient({
  plants,
  detail,
  gardenRegions,
}: ExploreClientProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState(EMPTY_FILTERS)

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
  const matchesSearch = (p: CatalogPlant) =>
    !q ||
    p.commonName.toLowerCase().includes(q) ||
    p.botanicalName.toLowerCase().includes(q) ||
    p.aliases.some((a) => a.toLowerCase().includes(q))

  const activeFilterCount = countActiveFilters(filters)
  const visible = plants.filter(
    (p) => matchesSearch(p) && matchesFilters(p, filters, gardenRegions)
  )

  return (
    <div
      className={[
        'flex items-start pb-12 pt-8 md:pb-16 md:pt-12',
        detail ? 'lg:pr-[480px]' : '',
      ].join(' ')}
    >
      <div className={detail ? 'w-full max-w-[680px] shrink-0' : 'flex-1'}>
        <h1 className="text-title font-semibold text-primary">
          What to plant next?
        </h1>

        <div className="mt-6">
          <SearchField
            placeholder="Search plants..."
            label="Search plants"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            trailingAction={
              <IconButton
                variant={filtersOpen ? 'control' : 'ghost'}
                size="sm"
                aria-label="Filter plants"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((v) => !v)}
                className="relative"
              >
                <Icon src={icons.filter} />
                {activeFilterCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 size-1.5 rounded-full bg-accent"
                  />
                )}
              </IconButton>
            }
          />
          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                key="explore-filters"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <ExploreFilters
                  filters={filters}
                  onChange={setFilters}
                  canFilterNative={gardenRegions.length > 0}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-8 text-body text-secondary md:mt-16">
          Recommended plants
        </p>

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

        {visible.length === 0 &&
          (activeFilterCount > 0 ? (
            <p className="mt-8 text-body text-muted">
              No plants match these filters. Clear a filter to see more.
            </p>
          ) : (
            <p className="mt-8 text-body text-muted">
              No plants found for &ldquo;{query}&rdquo;.
            </p>
          ))}
      </div>

      <AnimatePresence>
        {detail && (
          <PlantDetailDrawer
            key="plant-detail-drawer"
            detail={detail}
            onClose={closeDrawer}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default ExploreClient
