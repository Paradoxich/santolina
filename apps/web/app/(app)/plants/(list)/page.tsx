import { redirect } from 'next/navigation'
import { GardenClient } from '@/components/GardenClient'
import { listPalette } from '@/server/palette-actions'

export const dynamic = 'force-dynamic'

/**
 * My Plants list (Growing / Planned). Plant detail lives at
 * /plants/[plantId] so detail ↔ notes never remounts through this page
 * or its Growing loading skeleton.
 *
 * Legacy ?plant= links redirect to the detail route.
 */
export default async function MyGardenPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string; tab?: string }>
}) {
  const { plant: plantId, tab } = await searchParams

  if (plantId) {
    redirect(`/plants/${plantId}`)
  }

  const palette = await listPalette()
  // tab is read client-side by GardenClient via useSearchParams; keep it on
  // the URL for shareable Growing/Planned links.
  void tab
  return <GardenClient palette={palette} />
}
