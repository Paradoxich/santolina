// SERVER-ONLY — diary data helpers shared across the Diary page, the plant
// subpage, and Overview. getPlantDiaries/toPlantDiary/PlantDiary are retired
// alongside the Diary page and its Overview card (stage 2 + stage 4 of the
// diary-to-plant-story migration) — kept here in the meantime so every
// commit in that sequence leaves the app fully working.
import { requireSessionGarden } from './session-garden'
import { listDiaryEntries, type DiaryEntry } from '@/server/diary-actions'
import type { DbPlant } from './plants-db'
import { firstSentence } from './format-plant'
import type { DiaryNote, PlantDiary } from '@/types/diary'

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

async function toPlantDiary(
  plant: DbPlant,
  paletteId: string | null
): Promise<PlantDiary> {
  const entries = await listDiaryEntries({ plantId: plant.id })
  const notes = entries.map(toDiaryNote)

  return {
    id: plant.id,
    plantId: plant.id,
    paletteId,
    plantName: plant.common_name,
    summary: plant.description
      ? firstSentence(plant.description)
      : 'No description yet for this plant.',
    thumbnailUrl: notes[0]?.photos?.[0]?.src,
    notes,
  }
}

/**
 * One PlantDiary per plant currently growing in the garden, plus one for
 * any plant that was removed from the palette but still has notes from
 * when it was — `paletteId` is null for those, and the UI marks them
 * "Removed from garden" rather than hiding them. `planned`
 * palette plants don't get a diary until they're moved to `planted` — a
 * diary is for tracking something you're actually tending, not a plan.
 */
export async function getPlantDiaries(): Promise<PlantDiary[]> {
  const { supabase: db, garden } = await requireSessionGarden()
  const gardenId = garden.id

  const [
    { data: paletteRows, error: paletteError },
    { data: entryRows, error: entryError },
  ] = await Promise.all([
    db
      .from('palette_plants')
      .select('id, plant_id, status, plants(*)')
      .eq('garden_id', gardenId),
    db.from('diary_entries').select('plant_id').eq('garden_id', gardenId),
  ])

  if (paletteError)
    throw new Error(`Failed to load palette for diary: ${paletteError.message}`)
  if (entryError)
    throw new Error(`Failed to load diary entries: ${entryError.message}`)

  const plantedRows = (paletteRows ?? []).filter(
    (row): row is typeof row & { plants: DbPlant } =>
      row.plants != null && row.status === 'planted'
  )

  const palettePlantIds = new Set(
    (paletteRows ?? []).map((row) => row.plant_id)
  )
  const removedPlantIds = [
    ...new Set(
      (entryRows ?? [])
        .map((row) => row.plant_id)
        .filter(
          (plantId): plantId is string =>
            plantId != null && !palettePlantIds.has(plantId)
        )
    ),
  ]

  let removedPlants: DbPlant[] = []
  if (removedPlantIds.length > 0) {
    const { data, error } = await db
      .from('plants')
      .select('*')
      .in('id', removedPlantIds)

    if (error)
      throw new Error(`Failed to load removed plants: ${error.message}`)
    removedPlants = (data ?? []) as DbPlant[]
  }

  const [activeDiaries, removedDiaries] = await Promise.all([
    Promise.all(plantedRows.map((row) => toPlantDiary(row.plants, row.id))),
    Promise.all(removedPlants.map((plant) => toPlantDiary(plant, null))),
  ])

  return [...activeDiaries, ...removedDiaries]
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
 * query ordered/limited at the DB — no need to pull every plant's full
 * diary just to take the newest few, the way getPlantDiaries above does for
 * the (retiring) Diary page.
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
