'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Chip, EmptyState, Tabs, useToast } from '@paradoxui/ui'
import { EmptyStateIllustration } from '@/components/EmptyStateIllustration'
import { GardenPlantTile } from '@/components/GardenPlantTile'
import { PlannedPlantTile } from '@/components/PlannedPlantTile'
import { PlantDetailDrawer } from '@/components/PlantDetailDrawer'
import {
  getBloomStatus,
  getStageNote,
  type BloomStatus,
} from '@/lib/bloom-status'
import { formatExposure, formatBloomRange } from '@/lib/format-plant'
import type { PlantDetail } from '@/lib/plant-detail'
import {
  addToPalette,
  updateStatus,
  removeFromPalette,
  type PalettePlant,
} from '@/server/palette-actions'
import type { GardenPlant } from '@/types/garden'

type StatusFilter = 'all' | BloomStatus

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'blooming', label: 'Blooming' },
  { value: 'pre-bloom', label: 'Pre-bloom' },
  { value: 'resting', label: 'Resting' },
  { value: 'done', label: 'Done' },
  { value: 'evergreen', label: 'Evergreen' },
]

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
    imageUrl: plant.image_url ?? plant.image_urls?.[0] ?? '',
    bloomMonths: plant.bloom_months ?? [],
    note: row.notes ?? '',
    planned: row.status === 'planned',
    caption: caption || undefined,
    stageNote: getStageNote(plant.bloom_months ?? []),
  }
}

interface GardenClientProps {
  palette: PalettePlant[]
  detail: PlantDetail | null
}

export function GardenClient({ palette, detail }: GardenClientProps) {
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
    router.replace(`/garden?tab=${value}`, { scroll: false })
  }

  const openPlant = (plantId: string) =>
    router.push(`/garden?tab=${tab}&plant=${plantId}`, { scroll: false })
  const openPlantByPaletteId = (paletteId: string) => {
    const row = palette.find((p) => p.id === paletteId)
    if (row) openPlant(row.plantId)
  }
  const closeDrawer = () => router.push(`/garden?tab=${tab}`, { scroll: false })

  useEffect(() => {
    if (!detail) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        router.push(`/garden?tab=${tab}`, { scroll: false })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detail, tab, router])

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
        : growing.filter((p) => getBloomStatus(p.bloomMonths) === filter)
      : planned

  const activeTabLabel = tab === 'growing' ? 'Growing' : 'Planned'

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
          title: 'Removed from plan',
          description: `${row.plant.common_name} removed from your planned list.`,
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
      await updateStatus({ paletteId, status: 'planted' })
      router.refresh()
      toast({
        groupKey: row?.plantId,
        title: 'Moved to growing',
        description: `${row?.plant.common_name ?? 'Plant'} is now growing in your garden.`,
        tone: 'positive',
        actions: [
          {
            label: 'Undo',
            onClick: async () => {
              await updateStatus({ paletteId, status: 'planned' })
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
      <header className="border-b border-sage-50 pt-8">
        <Tabs
          items={[
            { value: 'growing', label: 'Growing', count: growing.length },
            { value: 'planned', label: 'Planned', count: planned.length },
          ]}
          value={tab}
          onChange={handleTabChange}
        />
      </header>

      <h1 className="mt-8 text-title font-semibold tracking-[-0.04em] text-primary md:mt-12">
        {activeTabLabel}
      </h1>
      <p className="mt-3 text-body text-secondary">
        {tab === 'growing'
          ? 'Plants currently in your garden. Sorted by status.'
          : "Plants you want to add. Move into Growing once they're in the ground."}
      </p>

      {actionError && (
        <p role="alert" className="mt-4 text-label text-critical">
          {actionError}
        </p>
      )}

      {tab === 'growing' && (
        <div className="mt-11 flex items-center gap-inline-gap overflow-x-auto pb-1">
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
              message="Find the plants you grow and add them here."
              ctaLabel="Explore plants"
              ctaHref="/explore"
              linkComponent={Link}
            />
          )
        ) : (
          <EmptyState
            className="mt-11"
            illustration={<EmptyStateIllustration name="planned" />}
            message="Find the plants you'd like to grow and plan them here."
            ctaLabel="Explore plants"
            ctaHref="/explore"
            linkComponent={Link}
          />
        ))}

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

export default GardenClient
