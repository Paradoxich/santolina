import { GardenClient } from '@/components/GardenClient'
import { listPalette } from '@/server/palette-actions'
import { getPlantDetail } from '@/lib/plant-detail'
import { getCurrentGardenId } from '@/lib/current-garden'

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

  return (
    <GardenClient
      gardenId={getCurrentGardenId()}
      palette={palette}
      detail={detail}
    />
  )
}
