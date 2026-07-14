'use server'

// Reads/writes on diary_entries run through the session client, scoped to the
// signed-in user's garden via RLS — same pattern as palette actions. The
// garden is always resolved from the session, never taken from the client.
// See docs/architecture.md §24.
import { requireSessionGarden } from '@/lib/session-garden'
import type { DiaryEventType } from '@/lib/diary-events'

export interface DiaryEntry {
  id: string
  gardenId: string
  plantId: string
  /** The live palette_plants row id, or null if the plant has since been removed from the garden. */
  paletteId: string | null
  note: string | null
  /** Typed care event this entry logged, or null for a freeform note. */
  eventType: DiaryEventType | null
  photoUrls: string[]
  createdAt: string
  updatedAt: string
}

interface DiaryEntryRow {
  id: string
  garden_id: string
  plant_id: string
  palette_plant_id: string | null
  note: string | null
  event_type: DiaryEventType | null
  photo_urls: string[]
  created_at: string
  updated_at: string
}

function toDiaryEntry(row: DiaryEntryRow): DiaryEntry {
  return {
    id: row.id,
    gardenId: row.garden_id,
    plantId: row.plant_id,
    paletteId: row.palette_plant_id,
    note: row.note,
    eventType: row.event_type,
    photoUrls: row.photo_urls,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Entries for the signed-in user's garden + the given plant, newest first. */
export async function listDiaryEntries({
  plantId,
}: {
  plantId: string
}): Promise<DiaryEntry[]> {
  const { supabase: db, garden } = await requireSessionGarden()

  const { data, error } = await db
    .from('diary_entries')
    .select('*')
    .eq('garden_id', garden.id)
    .eq('plant_id', plantId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load diary entries: ${error.message}`)
  return (data ?? []).map(toDiaryEntry)
}

/**
 * Every typed care event in the signed-in user's garden — the raw material
 * for Tier 3 event-relative Care Tips. Freeform notes (event_type null) are
 * excluded. Kept lean (three columns) since the dashboard reads it on every
 * render alongside the palette.
 */
export async function listGardenCareEvents(): Promise<
  { plantId: string; eventType: DiaryEventType; createdAt: string }[]
> {
  const { supabase: db, garden } = await requireSessionGarden()

  const { data, error } = await db
    .from('diary_entries')
    .select('plant_id, event_type, created_at')
    .eq('garden_id', garden.id)
    .not('event_type', 'is', null)

  if (error) throw new Error(`Failed to load care events: ${error.message}`)

  return (data ?? []).map((row) => ({
    plantId: row.plant_id,
    eventType: row.event_type as DiaryEventType,
    createdAt: row.created_at,
  }))
}

/**
 * Adds a diary entry, uploading any photos to the diary-photos bucket first.
 * Path convention: {gardenId}/{plantId}/{timestamp}-{filename}. The bucket
 * is public, so the resulting public URL is immediately viewable — no
 * signed URL generation needed for v1.
 */
export async function addDiaryEntry({
  plantId,
  paletteId,
  note,
  eventType,
  photoFiles,
}: {
  plantId: string
  paletteId?: string | null
  note?: string
  eventType?: DiaryEventType | null
  photoFiles?: File[]
}): Promise<DiaryEntry> {
  const { supabase: db, garden } = await requireSessionGarden()
  const gardenId = garden.id

  const photoUrls: string[] = []
  if (photoFiles && photoFiles.length > 0) {
    const timestamp = Date.now()
    for (const file of photoFiles) {
      const path = `${gardenId}/${plantId}/${timestamp}-${file.name}`
      const { error: uploadError } = await db.storage
        .from('diary-photos')
        .upload(path, file, { contentType: file.type })

      if (uploadError)
        throw new Error(`Failed to upload photo: ${uploadError.message}`)

      const {
        data: { publicUrl },
      } = db.storage.from('diary-photos').getPublicUrl(path)
      photoUrls.push(publicUrl)
    }
  }

  const { data, error } = await db
    .from('diary_entries')
    .insert({
      garden_id: gardenId,
      plant_id: plantId,
      palette_plant_id: paletteId ?? null,
      note: note ?? null,
      event_type: eventType ?? null,
      photo_urls: photoUrls,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to add diary entry: ${error.message}`)
  return toDiaryEntry(data as DiaryEntryRow)
}

/**
 * Deletes a diary entry. Leaves any uploaded photos in the diary-photos
 * bucket in place — an orphaned-file gap accepted for v1, not solved here.
 */
export async function deleteDiaryEntry({
  entryId,
}: {
  entryId: string
}): Promise<void> {
  const { supabase: db, garden } = await requireSessionGarden()

  const { data, error } = await db
    .from('diary_entries')
    .delete()
    .eq('id', entryId)
    .eq('garden_id', garden.id)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to delete diary entry: ${error.message}`)
  if (!data) throw new Error('Diary entry not found in the current garden')
}

/**
 * Deletes every diary entry for a garden+plant pair — the "also delete
 * diary" path when removing a plant from the garden. Leaves any uploaded
 * photos in the diary-photos bucket in place, same accepted gap as
 * deleteDiaryEntry.
 */
export async function deleteDiaryThread({
  plantId,
}: {
  plantId: string
}): Promise<void> {
  const { supabase: db, garden } = await requireSessionGarden()

  const { error } = await db
    .from('diary_entries')
    .delete()
    .eq('garden_id', garden.id)
    .eq('plant_id', plantId)

  if (error) throw new Error(`Failed to delete diary thread: ${error.message}`)
}
