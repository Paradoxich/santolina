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
  visiblePlants,
} from '@/lib/explore-filters'
import { STYLE_DISPLAY_NAMES, type StyleTag } from '@/lib/style-tags'
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
  // search text rather than the `filters` state — searchRank already
  // understands these facet labels, so dropping one into the search box
  // both filters the catalogue and gives the user a familiar, single-click
  // way back to browse (clear the search). This is deliberately separate
  // from the multi-select filter panel, which stays the tool for combining
  // more than one facet at once. A tile's label is a facet, so its results
  // all land in the facet tier and stay alphabetical.
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
  const visible = visiblePlants(plants, query, filters, gardenRegions)

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
      {/* The content cap sits on this column, not on the flex parent: the
          parent's lg:pr-[480px] reserves room for a viewport-fixed drawer,
          so capping it would indent the list away from a drawer that has
          not moved. */}
      <div
        className={
          detail
            ? 'w-full max-w-[680px] shrink-0'
            : 'min-w-0 max-w-content flex-1'
        }
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
            'sticky top-0 z-10 -mx-4 mt-4 bg-surface-page px-4 py-4 md:-ml-content-bleed md:-mr-content-bleed md:pl-content-bleed md:pr-content-bleed',
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
          {/* The kit's own treatment now, so the eleven classes that used to
              re-shape SearchField here are gone. They existed because the
              component shipped a pill this call site did not want. */}
          <div className="flex items-center gap-inline-gap">
            <SearchField
              ref={searchInputRef}
              placeholder="Search plants"
              label="Search plants"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              iconClassName="text-primary"
              className="flex-1 pr-tight-gap"
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
            {/* Moves with the search field by design — it was written to match
                its border treatment, so it follows it onto the shell. */}
            <div className="flex h-10 shrink-0 items-center justify-center rounded-md border border-card bg-surface-field px-tight-gap transition-colors duration-normal">
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
                content-gutter on both sides (px-4 on mobile) so the line
                runs from the sidebar's hairline to the right edge of the
                screen, in the sidebar hairline's own colour. */}
            <hr className="-mx-4 border-[var(--sidebar-divider)] md:-mx-content-bleed" />
            <div className="pt-12">
              <ExploreBrowse
                onSelectStyle={(style) =>
                  selectSearchTerm(
                    // Falls through to the display name, not the slug: a tile
                    // can name a style the filter is not offering yet (below
                    // STYLE_FILTER_FLOOR), and a raw slug in the search box
                    // reads as a bug.
                    STYLE_OPTIONS.find((o) => o.value === style)?.label ??
                      STYLE_DISPLAY_NAMES[style as StyleTag] ??
                      style
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
