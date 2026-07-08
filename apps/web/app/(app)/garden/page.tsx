import { GardenClient } from '@/components/GardenClient'
import { listPalette } from '@/server/palette-actions'

export const dynamic = 'force-dynamic'

export default async function MyGardenPage() {
  const palette = await listPalette()
  return <GardenClient palette={palette} />
}
