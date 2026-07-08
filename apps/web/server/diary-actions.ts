'use server'

// Writes/reads on diary_entries go through the service-role client, same
// pattern as palette/garden actions — see lib/current-garden.ts and
// docs/architecture.md §11 for why (RLS blocker, no real auth yet).
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentGardenId } from '@/lib/current-garden'

export interface DiaryEntry {
  id: string
  gardenId: string
  plantId: string
  /** The live palette_plants row id, or null if the plant has since been removed from the garden. */
  paletteId: string | null
  note: string | null
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
    photoUrls: row.photo_urls,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Entries for a given garden+plant pair, newest first. */
export async function listDiaryEntries({
  gardenId,
  plantId,
}: {
  gardenId: string
  plantId: string
}): Promise<DiaryEntry[]> {
  const db = getSupabaseAdmin()

  const { data, error } = await db
    .from('diary_entries')
    .select('*')
    .eq('garden_id', gardenId)
    .eq('plant_id', plantId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load diary entries: ${error.message}`)
  return (data ?? []).map(toDiaryEntry)
}

/**
 * Adds a diary entry, uploading any photos to the diary-photos bucket first.
 * Path convention: {gardenId}/{plantId}/{timestamp}-{filename}. The bucket
 * is public, so the resulting public URL is immediately viewable — no
 * signed URL generation needed for v1.
 */
export async function addDiaryEntry({
  gardenId,
  plantId,
  paletteId,
  note,
  photoFiles,
}: {
  gardenId: string
  plantId: string
  paletteId?: string | null
  note?: string
  photoFiles?: File[]
}): Promise<DiaryEntry> {
  const db = getSupabaseAdmin()

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
  const db = getSupabaseAdmin()
  const gardenId = getCurrentGardenId()

  const { data, error } = await db
    .from('diary_entries')
    .delete()
    .eq('id', entryId)
    .eq('garden_id', gardenId)
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
  gardenId,
  plantId,
}: {
  gardenId: string
  plantId: string
}): Promise<void> {
  const db = getSupabaseAdmin()

  const { error } = await db
    .from('diary_entries')
    .delete()
    .eq('garden_id', gardenId)
    .eq('plant_id', plantId)

  if (error) throw new Error(`Failed to delete diary thread: ${error.message}`)
}
