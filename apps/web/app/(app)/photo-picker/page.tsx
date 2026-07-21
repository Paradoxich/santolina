import { notFound } from 'next/navigation'
import { ExplorePhotoPicker } from '@/components/ExplorePhotoPicker'
import { getExplorePlants } from '@/lib/plant-detail'

export const dynamic = 'force-dynamic'

/**
 * Internal tool for picking the colour tile photos used by `ExploreBrowse`.
 * Not linked from the nav; reachable only by typing the URL.
 *
 * Development only. It lives inside the authenticated `(app)` group, so
 * without this guard any signed-in user could reach it in production — it is a
 * build tool, not a feature. The catalogue read happens after the guard so
 * production never pays for it.
 */
export default async function PhotoPickerPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const plants = await getExplorePlants()
  return <ExplorePhotoPicker plants={plants} />
}
