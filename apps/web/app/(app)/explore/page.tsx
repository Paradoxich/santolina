import { ExploreClient } from '@/components/ExploreClient'
import { getExplorePlants, getPlantDetail } from '@/lib/plant-detail'
import { regionsForGarden } from '@/lib/native-to-me'
import { getSessionGardenContext } from '@/lib/session-garden'

export const dynamic = 'force-dynamic'

export default async function ExplorePlantsPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string }>
}) {
  const { plant: plantId } = await searchParams

  const [plants, detail, ctx] = await Promise.all([
    getExplorePlants(),
    plantId ? getPlantDetail(plantId) : Promise.resolve(null),
    getSessionGardenContext(),
  ])

  // Resolved server-side so the client never needs the garden row itself.
  // [] means "region unknown" — the native filter chip stays hidden.
  const gardenRegions = ctx?.garden ? regionsForGarden(ctx.garden) : []

  return (
    <ExploreClient
      plants={plants}
      detail={detail}
      gardenRegions={gardenRegions}
    />
  )
}
