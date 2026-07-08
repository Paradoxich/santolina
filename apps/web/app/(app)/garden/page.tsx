import { GardenClient } from '@/components/GardenClient'
import { listPalette } from '@/server/palette-actions'
import { getPlantDetail } from '@/lib/plant-detail'

export const dynamic = 'force-dynamic'

export default async function MyGardenPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string }>
}) {
  const { plant: plantId } = await searchParams

  const [palette, detail] = await Promise.all([
    listPalette(),
    plantId ? getPlantDetail(plantId) : Promise.resolve(null),
  ])

  return <GardenClient palette={palette} detail={detail} />
}
