'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { EmptyState, Tabs, useToast } from '@paradoxui/ui'
import { EmptyStateIllustration } from '@/components/EmptyStateIllustration'
import { GardenPlantTile } from '@/components/GardenPlantTile'
import { PlannedPlantTile } from '@/components/PlannedPlantTile'
import {
  StatusFilterMenu,
  type StatusFilter,
} from '@/components/StatusFilterMenu'
import {
  getBloomStatus,
  getStageNote,
  toDisplayStatus,
} from '@/lib/bloom-status'
import { formatExposure, formatBloomRange } from '@/lib/format-plant'
import { heroImageUrl } from '@/lib/plant-image'
import {
  addToPalette,
  markPlanted,
  undoMarkPlanted,
  removeFromPalette,
  type PalettePlant,
} from '@/server/palette-actions'
import type { GardenPlant } from '@/types/garden'

function toGardenPlant(row: PalettePlant): GardenPlant {
  const { plant } = row
  const caption = [
    formatExposure(plant.sun_requirements),
    formatBloomRange(plant.bloom_months),
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    id: row.id,
    name: plant.common_name,
    imageUrl: heroImageUrl(plant),
    bloomMonths: plant.bloom_months ?? [],
    note: row.notes ?? '',
    planned: row.status === 'planned',
    caption: caption || undefined,
    stageNote: getStageNote(plant.bloom_months ?? []),
  }
}

interface GardenClientProps {
  palette: PalettePlant[]
}

export function GardenClient({ palette }: GardenClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [tab, setTab] = useState(
    searchParams.get('tab') === 'planned' ? 'planned' : 'growing'
  )
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleTabChange = (value: string) => {
    setTab(value)
    setFilter('all')
    router.replace(`/plants?tab=${value}`, { scroll: false })
  }

  // Navigates to the plant's own page — not an overlay, a real route swap.
  // `from` preserves Growing/Planned on the back link.
  const openPlant = (plantId: string) =>
    router.push(`/plants/${plantId}?from=${tab}`)
  const openPlantByPaletteId = (paletteId: string) => {
    const row = palette.find((p) => p.id === paletteId)
    if (row) openPlant(row.plantId)
  }

  const growing = palette
    .filter((p) => p.status === 'planted')
    .map(toGardenPlant)
  const planned = palette
    .filter((p) => p.status === 'planned')
    .map(toGardenPlant)
  const visible =
    tab === 'growing'
      ? filter === 'all'
        ? growing
        : growing.filter(
            (p) => toDisplayStatus(getBloomStatus(p.bloomMonths)) === filter
          )
      : planned

  const statusCounts: Record<StatusFilter, number> = {
    all: growing.length,
    blooming: 0,
    'pre-bloom': 0,
    resting: 0,
    evergreen: 0,
  }
  for (const p of growing) {
    statusCounts[toDisplayStatus(getBloomStatus(p.bloomMonths))]++
  }

  const activeTabLabel = tab === 'growing' ? 'Growing' : 'Planned'

  const plantCount = (n: number) => `${n} ${n === 1 ? 'plant' : 'plants'}`
  const tabSubtitle =
    tab === 'growing'
      ? growing.length === 0
        ? 'Nothing growing in your garden yet.'
        : `You are growing ${plantCount(growing.length)} in your garden.`
      : planned.length === 0
        ? 'Nothing planned yet.'
        : `You planned ${plantCount(planned.length)}.`

  const handleRemove = async (paletteId: string) => {
    const row = palette.find((p) => p.id === paletteId)
    setActionError(null)
    setPendingId(paletteId)
    try {
      await removeFromPalette({ paletteId })
      router.refresh()
      if (row) {
        toast({
          groupKey: row.plantId,
          message: `${row.plant.common_name} removed from your planned list.`,
          actions: [
            {
              label: 'Undo',
              onClick: async () => {
                await addToPalette({
                  plantId: row.plantId,
                  status: row.status,
                  source: row.source,
                  notes: row.notes ?? undefined,
                })
                router.refresh()
              },
            },
          ],
        })
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setPendingId(null)
    }
  }

  const handleMoveToGrowing = async (paletteId: string) => {
    const row = palette.find((p) => p.id === paletteId)
    setActionError(null)
    setPendingId(paletteId)
    try {
      const { plantedEventId } = await markPlanted({ paletteId })
      router.refresh()
      toast({
        groupKey: row?.plantId,
        message: `${row?.plant.common_name ?? 'Plant'} is now growing in your garden.`,
        tone: 'positive',
        actions: [
          {
            label: 'Undo',
            onClick: async () => {
              await undoMarkPlanted({ paletteId, plantedEventId })
              router.refresh()
            },
          },
        ],
      })
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Something went wrong.'
      )
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="pb-16">
      {/* Full-bleed, sidebar divider to viewport edge — so it stays outside
          the 1128 column below, whose cap would shorten its escape. */}
      <header className="border-b border-sage-200 pt-8 md:ml-[calc(-1*var(--sidebar-offset))] md:mr-[calc(-1*var(--content-gutter))] md:pl-[var(--sidebar-offset)] md:pr-content-gutter">
        <Tabs
          items={[
            { value: 'growing', label: 'Growing', count: growing.length },
            { value: 'planned', label: 'Planned', count: planned.length },
          ]}
          value={tab}
          onChange={handleTabChange}
        />
      </header>

      <div className="max-w-content">
        <h1 className="mt-8 text-title font-semibold text-primary md:mt-12">
          {activeTabLabel}
        </h1>
        {/* The filter trigger is absolutely positioned so its 40px height doesn't
          inflate the row and push the description down — the subtitle keeps the
          same mt-3 spacing as every other tab (Planned, dashboard). */}
        <div className="relative mt-3">
          <p className="text-body text-secondary">{tabSubtitle}</p>
          {tab === 'growing' && growing.length > 0 && (
            // Flex-centered, not translate-centered: a transform would create a
            // stacking context and trap the open dropdown's z-index behind the
            // card grid below.
            <div className="absolute inset-y-0 right-0 flex items-center">
              <StatusFilterMenu
                value={filter}
                onChange={setFilter}
                counts={statusCounts}
              />
            </div>
          )}
        </div>

        {actionError && (
          <p role="alert" className="mt-4 text-label text-critical">
            {actionError}
          </p>
        )}

        {visible.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-item-gap md:grid-cols-2 xl:grid-cols-3">
            {visible.map((plant) =>
              tab === 'growing' ? (
                <GardenPlantTile
                  key={plant.id}
                  plant={plant}
                  onClick={() => openPlantByPaletteId(plant.id)}
                />
              ) : (
                <PlannedPlantTile
                  key={plant.id}
                  plant={plant}
                  onRemove={handleRemove}
                  onMoveToGrowing={handleMoveToGrowing}
                  onOpenDetails={openPlantByPaletteId}
                  disabled={pendingId === plant.id}
                />
              )
            )}
          </div>
        )}

        {visible.length === 0 &&
          (tab === 'growing' ? (
            growing.length > 0 ? (
              <p className="mt-11 text-body text-muted">
                No plants match this filter yet.
              </p>
            ) : planned.length > 0 ? (
              <EmptyState
                className="mt-11"
                illustration={<EmptyStateIllustration name="growing" />}
                message="Move a planned plant here once it's in the ground."
                ctaLabel="View planned"
                onCtaClick={() => handleTabChange('planned')}
              />
            ) : (
              <EmptyState
                className="mt-11"
                illustration={<EmptyStateIllustration name="growing" />}
                message="Add the plants you already grow here."
                ctaLabel="Explore plants"
                ctaHref="/explore"
                linkComponent={Link}
              />
            )
          ) : (
            <EmptyState
              className="mt-11"
              illustration={<EmptyStateIllustration name="planned" />}
              message="Add the plants you'd like to grow here."
              ctaLabel="Explore plants"
              ctaHref="/explore"
              linkComponent={Link}
            />
          ))}
      </div>
    </div>
  )
}

export default GardenClient
