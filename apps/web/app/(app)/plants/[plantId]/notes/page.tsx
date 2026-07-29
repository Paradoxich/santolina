import { redirect } from 'next/navigation'
import { ActivityClient } from '@/components/ActivityClient'
import { getPlantDetail } from '@/lib/plant-detail'
import type { RecentActivityEntry } from '@/lib/diary'
import { listDiaryEntries } from '@/server/diary-actions'

export const dynamic = 'force-dynamic'

/**
 * One plant's notes archive — same list chrome as Recent activity, reached
 * from the Diary card on the growing plant page. Not a nav destination.
 */
export default async function PlantNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ plantId: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { plantId } = await params
  const { from } = await searchParams
  const [detail, entries] = await Promise.all([
    getPlantDetail(plantId),
    listDiaryEntries({ plantId }),
  ])

  if (!detail) {
    redirect('/plants')
  }

  const plantName = detail.plant.common_name
  const activityEntries: RecentActivityEntry[] = entries.map((entry) => ({
    id: entry.id,
    text: entry.note,
    date: entry.createdAt.slice(0, 10),
    plantId: entry.plantId,
    plantName,
    eventTypes: entry.eventTypes,
    photoUrls: entry.photoUrls,
  }))

  const backHref =
    from === 'planned'
      ? `/plants/${plantId}?from=planned`
      : `/plants/${plantId}`

  return (
    <ActivityClient
      entries={activityEntries}
      title="Notes"
      backHref={backHref}
      backLabel={plantName}
      showPlantLink={false}
      emptyMessage={`Nothing logged for ${plantName} yet. Add your first note.`}
    />
  )
}
