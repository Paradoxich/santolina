import { redirect } from 'next/navigation'
import { GardenClient } from '@/components/GardenClient'
import { PlantDetailPage } from '@/components/PlantDetailPage'
import { listPalette, getPaletteStatus } from '@/server/palette-actions'
import { getPlantDetail } from '@/lib/plant-detail'
import { listDiaryEntries } from '@/server/diary-actions'
import { toDiaryNote } from '@/lib/diary'

export const dynamic = 'force-dynamic'

export default async function MyGardenPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string; tab?: string }>
}) {
  const { plant: plantId, tab } = await searchParams

  if (plantId) {
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

    return (
      <PlantDetailPage
        detail={detail}
        initialPalette={palette}
        notes={entries.map(toDiaryNote)}
        backHref={`/plants?tab=${tab ?? 'growing'}`}
        // Resolved once here so SSR and hydration agree: the timeline's today
        // line is positioned by fraction-of-year, so two new Date() calls
        // milliseconds apart render different markup and React reports a
        // hydration mismatch.
        todayIso={new Date().toISOString().slice(0, 10)}
      />
    )
  }

  const palette = await listPalette()
  return <GardenClient palette={palette} />
}
