import { redirect } from 'next/navigation'
import { PlantDetailPage } from '@/components/PlantDetailPage'
import { getPaletteStatus } from '@/server/palette-actions'
import { getPlantDetail } from '@/lib/plant-detail'
import { listDiaryEntries } from '@/server/diary-actions'
import { toDiaryNote } from '@/lib/diary'

export const dynamic = 'force-dynamic'

/**
 * Growing/planned plant detail. Sibling of /plants/[plantId]/notes so the
 * two share the [plantId] segment — navigating between them does not pass
 * through the My Plants list or its loading UI.
 */
export default async function PlantPage({
  params,
  searchParams,
}: {
  params: Promise<{ plantId: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { plantId } = await params
  const { from } = await searchParams
  const [detail, palette, entries] = await Promise.all([
    getPlantDetail(plantId),
    getPaletteStatus({ plantId }),
    listDiaryEntries({ plantId }),
  ])

  // Nothing owned to show — either the plant doesn't exist, or nothing in
  // the UI links here in this state (a never-grown plant's story only
  // exists once it's planted or has history) — a defensive fallback for a
  // stray URL, not a path any real navigation takes.
  if (!detail || (!palette && entries.length === 0)) {
    redirect('/plants')
  }

  const backHref = from === 'planned' ? '/plants?tab=planned' : '/plants'

  return (
    <PlantDetailPage
      detail={detail}
      initialPalette={palette}
      notes={entries.map(toDiaryNote)}
      backHref={backHref}
      // Resolved once here so SSR and hydration agree: the timeline's today
      // line is positioned by fraction-of-year, so two new Date() calls
      // milliseconds apart render different markup and React reports a
      // hydration mismatch.
      todayIso={new Date().toISOString().slice(0, 10)}
    />
  )
}
