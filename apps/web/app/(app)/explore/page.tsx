import { ExploreClient } from '@/components/ExploreClient'
import { getExplorePlants, getPlantDetail } from '@/lib/plant-detail'
import { getCurrentGardenId } from '@/lib/current-garden'

export const dynamic = 'force-dynamic'

export default async function ExplorePlantsPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string }>
}) {
  const { plant: plantId } = await searchParams

  const [plants, detail] = await Promise.all([
    getExplorePlants(),
    plantId ? getPlantDetail(plantId) : Promise.resolve(null),
  ])

  return (
    <ExploreClient
      gardenId={getCurrentGardenId()}
      plants={plants}
      detail={detail}
    />
  )
}
