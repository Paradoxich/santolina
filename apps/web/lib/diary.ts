// SERVER-ONLY — builds the Diary page's PlantDiary list from real data.
import { requireSessionGarden } from './session-garden'
import { listDiaryEntries, type DiaryEntry } from '@/server/diary-actions'
import type { DbPlant } from './plants-db'
import type { DiaryNote, PlantDiary } from '@/types/diary'

/** Uploaded photos don't carry a natural display width — the mock's mixed widths were purely decorative. */
const PHOTO_WIDTH = 93

function toDiaryNote(entry: DiaryEntry): DiaryNote {
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
    summary: plant.description ?? 'No description yet for this plant.',
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
        .filter((plantId) => !palettePlantIds.has(plantId))
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
