import { ActivityClient } from '@/components/ActivityClient'
import { getRecentActivity } from '@/lib/diary'

export const dynamic = 'force-dynamic'

/**
 * The full activity archive, nested under Overview and reached from its
 * card — deliberately not a nav destination, which is what the retired
 * Diary page was (docs/architecture.md §32).
 *
 * A flat ceiling rather than pagination: a single garden's log doesn't
 * approach this in the test version, and a scroll beats a pager for
 * something read start-to-finish.
 */
const ACTIVITY_LIMIT = 250

export default async function ActivityPage() {
  const entries = await getRecentActivity(ACTIVITY_LIMIT, { withPhotos: true })
  return <ActivityClient entries={entries} />
}
