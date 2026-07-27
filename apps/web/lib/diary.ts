// SERVER-ONLY — diary data helpers shared by the plant subpage and Overview.
import { requireSessionGarden } from './session-garden'
import type { DiaryEntry } from '@/server/diary-actions'
import type { DiaryNote } from '@/types/diary'

/** Uploaded photos don't carry a natural display width — the mock's mixed widths were purely decorative. */
const PHOTO_WIDTH = 93

export function toDiaryNote(entry: DiaryEntry): DiaryNote {
  return {
    id: entry.id,
    text: entry.note ?? '',
    date: entry.createdAt.slice(0, 10),
    photos:
      entry.photoUrls.length > 0
        ? entry.photoUrls.map((src) => ({ src, width: PHOTO_WIDTH }))
        : undefined,
    eventTypes: entry.eventTypes,
  }
}

export interface RecentActivityEntry {
  id: string
  text: string | null
  date: string
  /** Null for a garden-level entry (weather, first frost, general observations). */
  plantName: string | null
}

/**
 * The most recent entries across the whole garden, plant-attached and
 * garden-level alike, for the Overview "Recent activity" card. A direct
 * query ordered/limited at the DB, rather than pulling every plant's full
 * history just to take the newest few.
 */
export async function getRecentActivity(
  limit = 5
): Promise<RecentActivityEntry[]> {
  const { supabase: db, garden } = await requireSessionGarden()

  const { data, error } = await db
    .from('diary_entries')
    .select('id, note, created_at, plants(common_name)')
    .eq('garden_id', garden.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load recent activity: ${error.message}`)

  return (data ?? []).map((row) => {
    // Untyped client can't tell this embed is to-one — normalize either shape.
    const plants = row.plants as
      | { common_name: string }
      | { common_name: string }[]
      | null
    const plant = Array.isArray(plants) ? (plants[0] ?? null) : plants
    return {
      id: row.id,
      text: row.note,
      date: row.created_at.slice(0, 10),
      plantName: plant?.common_name ?? null,
    }
  })
}
