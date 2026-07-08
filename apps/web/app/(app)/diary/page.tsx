import { DiaryClient } from '@/components/DiaryClient'
import { getPlantDiaries } from '@/lib/diary'
import { getCurrentGardenId } from '@/lib/current-garden'

export const dynamic = 'force-dynamic'

export default async function PlantDiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string }>
}) {
  const { plant: initialPlantId } = await searchParams
  const diaries = await getPlantDiaries()

  return (
    <DiaryClient
      gardenId={getCurrentGardenId()}
      diaries={diaries}
      initialPlantId={initialPlantId ?? null}
    />
  )
}
