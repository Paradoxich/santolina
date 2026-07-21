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
import { BLOOM_COLOR_BUCKETS } from '@/lib/bloom-colors'
import {
  EMPTY_FILTERS,
  STYLE_OPTIONS,
  SUN_OPTIONS,
  countActiveFilters,
  matchesFilters,
  matchesSearchTerm,
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
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { hidden: searchHidden, pinned: searchPinned } =
    useHideOnScroll(searchRef)

  // Browse tiles (style / colour / condition) are represented as plain
  // search text rather than the `filters` state — matchesSearchTerm already
  // understands these facet labels, so dropping one into the search box
  // both filters the catalogue and gives the user a familiar, single-click
  // way back to browse (clear the search). This is deliberately separate
  // from the multi-select filter panel, which stays the tool for combining
  // more than one facet at once.
  const selectSearchTerm = (label: string) => {
    setQuery(label)
    searchInputRef.current?.focus()
  }

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

  const activeFilterCount = countActiveFilters(filters)
  const visible = plants.filter(
    (p) =>
      matchesSearchTerm(p, query) && matchesFilters(p, filters, gardenRegions)
  )

  // Browse view (style / colour / condition) until the user searches or
  // filters; then it swaps to the flat results. Opening a plant also leaves
  // browse (the drawer + list layout takes over).
  const browsing = !query.trim() && activeFilterCount === 0

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
              for a primitive because no border token sits at sage-100 yet. The
              filter toggle is its own bordered box to the right, matching the
              search field's border treatment, rather than living inside the
              search pill. */}
          <div className="flex items-center gap-inline-gap">
            <SearchField
              ref={searchInputRef}
              placeholder="Search plants"
              label="Search plants"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              iconClassName="text-primary"
              className="h-10 flex-1 rounded-md border bg-surface-card pl-item-gap pr-tight-gap !shadow-none [border-color:var(--color-sage-100)] hover:[border-color:var(--color-sage-50)] focus-within:!bg-surface-card focus-within:[border-color:var(--color-sage-50)] focus-within:![box-shadow:0_0_0_1px_var(--color-sage-50)]"
              trailingAction={
                query && (
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label="Clear search"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery('')
                      searchInputRef.current?.focus()
                    }}
                  >
                    <Icon src={icons.close} />
                  </IconButton>
                )
              }
            />
            <div className="flex h-10 shrink-0 items-center justify-center rounded-md border bg-surface-card px-tight-gap [border-color:var(--color-sage-100)] transition-colors duration-normal hover:[border-color:var(--color-sage-50)]">
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
            </div>
          </div>
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
                  selectSearchTerm(
                    STYLE_OPTIONS.find((o) => o.value === style)?.label ?? style
                  )
                }
                onSelectColor={(bucket) =>
                  selectSearchTerm(
                    BLOOM_COLOR_BUCKETS.find((b) => b.value === bucket)
                      ?.label ?? bucket
                  )
                }
                onSelectSun={(sun) =>
                  selectSearchTerm(
                    SUN_OPTIONS.find((o) => o.value === sun)?.label ?? sun
                  )
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
                  : `Showing ${visible.length} ${
                      visible.length === 1 ? 'plant' : 'plants'
                    }`}
              </p>
            )}

            {detail ? (
              <div className="mt-4 flex flex-col gap-inline-gap">
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
              <div className="mt-4 grid grid-cols-1 gap-item-gap md:grid-cols-2 xl:grid-cols-4">
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
