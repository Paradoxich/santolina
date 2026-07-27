// SERVER-ONLY — diary data helpers shared by the plant subpage and Overview.
import { requireSessionGarden } from './session-garden'
import { signDiaryPhotoUrls } from './diary-photos'
import type { DiaryEntry } from '@/server/diary-actions'
import type { DiaryEventType } from './diary-events'
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
  plantId: string | null
  /** Null for a garden-level entry. */
  plantName: string | null
  eventTypes: DiaryEventType[]
  /** Renderable (signed, short-lived) URLs; empty when the entry has no photos. */
  photoUrls: string[]
}

/**
 * Every entry across the whole garden, plant-attached and garden-level
 * alike, newest first. A direct query ordered/limited at the DB, rather
 * than pulling every plant's full history and sorting in memory.
 *
 * The Overview card takes a handful; the activity page reads the archive,
 * so it passes a much larger limit. That ceiling is deliberate — a flat cap
 * beats pagination at this scale, and `withPhotos` stays off for the card
 * so the common case never pays for signing URLs it won't render.
 */
export async function getRecentActivity(
  limit = 5,
  { withPhotos = false }: { withPhotos?: boolean } = {}
): Promise<RecentActivityEntry[]> {
  const { supabase: db, garden } = await requireSessionGarden()

  const { data, error } = await db
    .from('diary_entries')
    .select(
      'id, note, created_at, plant_id, event_types, photo_urls, plants(common_name)'
    )
    .eq('garden_id', garden.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load recent activity: ${error.message}`)

  const rows = data ?? []
  const signed = withPhotos
    ? await signDiaryPhotoUrls(
        db,
        rows.map((row) => (row.photo_urls ?? []) as string[])
      )
    : []

  return rows.map((row, i) => {
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
      plantId: row.plant_id,
      plantName: plant?.common_name ?? null,
      eventTypes: (row.event_types ?? []) as DiaryEventType[],
      photoUrls: signed[i] ?? [],
    }
  })
}
