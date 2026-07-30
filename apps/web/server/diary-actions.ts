'use server'

// Reads/writes on diary_entries run through the session client, scoped to the
// signed-in user's garden via RLS — same pattern as palette actions. The
// garden is always resolved from the session, never taken from the client.
// See docs/architecture.md#auth.
import { requireSessionGarden } from '@/lib/session-garden'
import type { DiaryEventType } from '@/lib/diary-events'
import {
  DIARY_PHOTOS_BUCKET,
  removeDiaryPhotos,
  signDiaryPhotoUrls,
} from '@/lib/diary-photos'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DiaryEntry {
  id: string
  gardenId: string
  /** Null for a garden-level entry (weather, first frost, general observations) — not about any one plant. */
  plantId: string | null
  /** The live palette_plants row id, or null if the plant has since been removed from the garden. */
  paletteId: string | null
  note: string | null
  /** Typed care events this entry logged; empty for a freeform note. */
  eventTypes: DiaryEventType[]
  /** Renderable (signed, short-lived) URLs — the DB stores storage paths, not URLs. */
  photoUrls: string[]
  createdAt: string
  updatedAt: string
}

interface DiaryEntryRow {
  id: string
  garden_id: string
  plant_id: string | null
  palette_plant_id: string | null
  note: string | null
  event_types: DiaryEventType[]
  photo_urls: string[]
  created_at: string
  updated_at: string
}

function toDiaryEntry(row: DiaryEntryRow, photoUrls: string[]): DiaryEntry {
  return {
    id: row.id,
    gardenId: row.garden_id,
    plantId: row.plant_id,
    paletteId: row.palette_plant_id,
    note: row.note,
    eventTypes: row.event_types ?? [],
    photoUrls,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Maps rows to DiaryEntry, swapping the stored storage paths for signed URLs
 * in one batched storage call. Every read that leaves this module goes
 * through here, so photoUrls is always renderable for callers.
 */
async function withSignedPhotoUrls(
  db: SupabaseClient,
  rows: DiaryEntryRow[]
): Promise<DiaryEntry[]> {
  const signed = await signDiaryPhotoUrls(
    db,
    rows.map((row) => row.photo_urls)
  )
  return rows.map((row, i) => toDiaryEntry(row, signed[i] ?? []))
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
  return withSignedPhotoUrls(db, (data ?? []) as DiaryEntryRow[])
}

/**
 * Every typed care event in the signed-in user's garden — the raw material
 * for Tier 3 event-relative Care Tips. An entry can log several events at
 * once, so each row's event_types array is fanned out into one flat event per
 * type; freeform notes (empty array) contribute nothing. Kept lean (three
 * columns) since the dashboard reads it on every render alongside the palette.
 */
export async function listGardenCareEvents(): Promise<
  { plantId: string; eventType: DiaryEventType; createdAt: string }[]
> {
  const { supabase: db, garden } = await requireSessionGarden()

  const { data, error } = await db
    .from('diary_entries')
    .select('plant_id, event_types, created_at')
    .eq('garden_id', garden.id)

  if (error) throw new Error(`Failed to load care events: ${error.message}`)

  return (data ?? []).flatMap((row) =>
    ((row.event_types ?? []) as DiaryEventType[]).map((eventType) => ({
      plantId: row.plant_id,
      eventType,
      createdAt: row.created_at,
    }))
  )
}

/**
 * Adds a diary entry, uploading any photos to the private diary-photos
 * bucket first. Path convention: {gardenId}/{plantId}/{timestamp}-{filename},
 * or {gardenId}/garden/{timestamp}-{filename} for a garden-level entry (no
 * plantId) — storage RLS only checks the first path segment (the garden),
 * so no policy change is needed for the garden-only variant. The path (not
 * a URL) is what photo_urls stores — reads sign on the way out. Filenames
 * are sanitized to safe storage-key characters.
 */
export async function addDiaryEntry({
  plantId,
  paletteId,
  note,
  eventTypes,
  photoFiles,
}: {
  /** Omit for a garden-level entry (weather, first frost, general observations). */
  plantId?: string | null
  paletteId?: string | null
  note?: string
  eventTypes?: DiaryEventType[]
  photoFiles?: File[]
}): Promise<DiaryEntry> {
  const { supabase: db, garden } = await requireSessionGarden()
  const gardenId = garden.id

  const photoPaths: string[] = []
  if (photoFiles && photoFiles.length > 0) {
    const timestamp = Date.now()
    for (const file of photoFiles) {
      const safeName = file.name.replace(/[^\w.-]+/g, '_')
      const path = `${gardenId}/${plantId ?? 'garden'}/${timestamp}-${safeName}`
      const { error: uploadError } = await db.storage
        .from(DIARY_PHOTOS_BUCKET)
        .upload(path, file, { contentType: file.type })

      if (uploadError)
        throw new Error(`Failed to upload photo: ${uploadError.message}`)

      photoPaths.push(path)
    }
  }

  const { data, error } = await db
    .from('diary_entries')
    .insert({
      garden_id: gardenId,
      plant_id: plantId ?? null,
      palette_plant_id: paletteId ?? null,
      note: note ?? null,
      event_types: eventTypes ?? [],
      photo_urls: photoPaths,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to add diary entry: ${error.message}`)
  const [entry] = await withSignedPhotoUrls(db, [data as DiaryEntryRow])
  return entry!
}

/**
 * Cheap existence check — no signed URLs, just a count — for callers that
 * only need to know "does this plant have any history" (e.g. the Explore
 * drawer deciding whether a removed plant gets a "view its story" link).
 */
export async function hasDiaryEntries({
  plantId,
}: {
  plantId: string
}): Promise<boolean> {
  const { supabase: db, garden } = await requireSessionGarden()

  const { count, error } = await db
    .from('diary_entries')
    .select('id', { count: 'exact', head: true })
    .eq('garden_id', garden.id)
    .eq('plant_id', plantId)

  if (error) throw new Error(`Failed to check diary entries: ${error.message}`)
  return (count ?? 0) > 0
}

/**
 * Deletes a diary entry and its uploaded photos. Photo removal is
 * best-effort after the row delete succeeds — see removeDiaryPhotos.
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
    .select('id, photo_urls')
    .maybeSingle()

  if (error) throw new Error(`Failed to delete diary entry: ${error.message}`)
  if (!data) throw new Error('Diary entry not found in the current garden')

  await removeDiaryPhotos(db, [data.photo_urls ?? []])
}

/**
 * Deletes every diary entry for a garden+plant pair — the "also delete
 * diary" path when removing a plant from the garden — along with the
 * entries' uploaded photos (best-effort, same as deleteDiaryEntry).
 */
export async function deleteDiaryThread({
  plantId,
}: {
  plantId: string
}): Promise<void> {
  const { supabase: db, garden } = await requireSessionGarden()

  const { data, error } = await db
    .from('diary_entries')
    .delete()
    .eq('garden_id', garden.id)
    .eq('plant_id', plantId)
    .select('photo_urls')

  if (error) throw new Error(`Failed to delete diary thread: ${error.message}`)

  await removeDiaryPhotos(
    db,
    (data ?? []).map((row) => row.photo_urls ?? [])
  )
}
