'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { Icon, IconButton, SearchField } from '@paradoxui/ui'
import { ExploreBrowse } from '@/components/ExploreBrowse'
import { ExploreFilters } from '@/components/ExploreFilters'
import { ExplorePlantTile } from '@/components/ExplorePlantTile'
import { ExplorePlantListRow } from '@/components/ExplorePlantListRow'
import { PlantDetailDrawer } from '@/components/PlantDetailDrawer'
import { useHideOnScroll } from '@/hooks/useHideOnScroll'
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
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const { hidden: searchHidden, pinned: searchPinned } =
    useHideOnScroll(searchRef)

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

  // Browse view (style / colour / condition) until the user searches or
  // filters; then it swaps to the flat results. Opening a plant also leaves
  // browse (the drawer + list layout takes over).
  const browsing = !q && activeFilterCount === 0

  return (
    <div
      className={[
        'flex items-start pb-12 pt-8 md:pb-16 md:pt-12',
        detail ? 'lg:pr-[480px]' : '',
      ].join(' ')}
    >
      <div
        className={detail ? 'w-full max-w-[680px] shrink-0' : 'min-w-0 flex-1'}
      >
        <header className="flex flex-col gap-item-gap">
          <h1 className="text-title font-semibold tracking-title text-primary">
            Plant library
          </h1>
          <p className="text-body text-secondary">
            Find plants that fit your conditions, style or region.
          </p>
        </header>

        {/* Sticky search: the header above scrolls away, the field pins to the
            viewport top. Negative margins + matching padding stretch the
            page-ground backdrop across the layout gutters so content slides
            under it edge to edge; mt-4 + pt-4 keeps the resting gap below the
            header at the previous 32px. z-10 sits with the sidebar tier,
            below the drawer's z-20. Retracts off-screen while scrolling down
            and returns on scroll-up (useHideOnScroll). */}
        <div
          ref={searchRef}
          className={[
            'sticky top-0 z-10 -mx-4 mt-4 bg-surface-page px-4 py-4 md:-ml-10 md:-mr-12 md:pl-10 md:pr-12',
            'transition-transform duration-normal',
            searchHidden ? '-translate-y-full' : 'translate-y-0',
          ].join(' ')}
        >
          {/* Soft fade below the pinned backdrop instead of a hard edge. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-full h-6 bg-gradient-to-b from-surface-page to-transparent"
          />
          {/* Sidebar-coloured hairline along the bottom edge, only while
              pinned — at rest the block should sit borderless on the page. */}
          <span
            aria-hidden="true"
            className={[
              'pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--sidebar-divider)]',
              'transition-opacity duration-normal',
              searchPinned ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          />
          {/* Search sits on the page ground with a sage-100 hairline and a 12px
              radius, rather than the kit's translucent pill. The border reaches
              for a primitive because no border token sits at sage-100 yet. */}
          <SearchField
            placeholder="Search plants"
            label="Search plants"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 rounded-md border bg-surface-card pl-item-gap pr-tight-gap !shadow-none [border-color:var(--color-sage-100)] focus-within:!shadow-soft"
            trailingAction={
              <IconButton
                variant={filtersOpen ? 'control' : 'ghost'}
                size="sm"
                aria-label="Filter plants"
                aria-expanded={filtersOpen}
                onMouseDown={(e) => e.preventDefault()}
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
          {filtersOpen && (
            <ExploreFilters
              filters={filters}
              onChange={setFilters}
              canFilterNative={gardenRegions.length > 0}
            />
          )}
        </div>

        {browsing && !detail ? (
          <div className="mt-8">
            {/* Full-bleed rule: the negative margins walk back the layout's
                gutters (spacing-10 to the sidebar divider, mr-12 to the
                viewport edge; px-4 on mobile) so the line runs from the
                sidebar's hairline to the right edge of the screen, in the
                sidebar hairline's own colour. */}
            <hr className="-mx-4 border-[var(--sidebar-divider)] md:-ml-10 md:-mr-12" />
            <div className="pt-12">
              <ExploreBrowse
                plants={plants}
                onSelectStyle={(style) =>
                  setFilters({ ...EMPTY_FILTERS, styles: [style] })
                }
                onSelectColor={(bucket) =>
                  setFilters({ ...EMPTY_FILTERS, colors: [bucket] })
                }
                onSelectSun={(sun) =>
                  setFilters({ ...EMPTY_FILTERS, sun: [sun] })
                }
              />
            </div>
          </div>
        ) : (
          <>
            {visible.length > 0 && (
              <p className="mt-4 text-body text-secondary md:mt-12">
                {browsing
                  ? 'Recommended plants'
                  : `${visible.length} ${
                      visible.length === 1 ? 'plant' : 'plants'
                    } found`}
              </p>
            )}

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
                <p className="mt-4 text-body text-muted">
                  No plants match these filters. Clear a filter to see more.
                </p>
              ) : (
                <p className="mt-4 text-body text-muted">
                  No plants found for &ldquo;{query}&rdquo;.
                </p>
              ))}
          </>
        )}
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
