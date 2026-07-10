'use server'

// Reads/writes to palette_plants run through the session client, scoped to the
// signed-in user's garden. RLS (`palette_plants` -> `gardens.user_id = auth.uid()`)
// enforces ownership; the explicit garden_id filters are kept for correctness
// and defense-in-depth. See docs/architecture.md §24.
import { requireSessionGarden } from '@/lib/session-garden'
import type { DbPlant } from '@/lib/plants-db'

export type PaletteStatus = 'planned' | 'planted' | 'considering'
export type PaletteSource = 'generated' | 'manual' | 'existing'

export interface PalettePlant {
  id: string
  gardenId: string
  plantId: string
  status: PaletteStatus
  source: PaletteSource
  notes: string | null
  addedAt: string
  plant: DbPlant
}

interface AddToPaletteInput {
  plantId: string
  status: PaletteStatus
  source: PaletteSource
  notes?: string
}

/**
 * Adds a plant to the current garden's palette, or updates its
 * status/source if it's already there. There's no unique DB constraint
 * on (garden_id, plant_id) — this is an application-level upsert
 * (select, then insert or update), not a Postgres ON CONFLICT.
 */
export async function addToPalette({
  plantId,
  status,
  source,
  notes,
}: AddToPaletteInput): Promise<{ id: string; status: PaletteStatus }> {
  const { supabase: db, garden } = await requireSessionGarden()
  const gardenId = garden.id

  const { data: existing, error: findError } = await db
    .from('palette_plants')
    .select('id')
    .eq('garden_id', gardenId)
    .eq('plant_id', plantId)
    .maybeSingle()

  if (findError)
    throw new Error(
      `Failed to check existing palette row: ${findError.message}`
    )

  if (existing) {
    const { data, error } = await db
      .from('palette_plants')
      .update({ status, source, ...(notes !== undefined ? { notes } : {}) })
      .eq('id', existing.id)
      .select('id, status')
      .single()

    if (error) throw new Error(`Failed to update palette row: ${error.message}`)
    return data as { id: string; status: PaletteStatus }
  }

  const { data, error } = await db
    .from('palette_plants')
    .insert({ garden_id: gardenId, plant_id: plantId, status, source, notes })
    .select('id, status')
    .single()

  if (error) throw new Error(`Failed to add to palette: ${error.message}`)
  return data as { id: string; status: PaletteStatus }
}

/**
 * Updates just the status of an existing palette row. Confirms the row
 * belongs to the current garden before writing.
 */
export async function updateStatus({
  paletteId,
  status,
}: {
  paletteId: string
  status: PaletteStatus
}): Promise<void> {
  const { supabase: db, garden } = await requireSessionGarden()
  const gardenId = garden.id

  const { data, error } = await db
    .from('palette_plants')
    .update({ status })
    .eq('id', paletteId)
    .eq('garden_id', gardenId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to update status: ${error.message}`)
  if (!data) throw new Error('Palette row not found in the current garden')
}

/** Same garden-ownership check as updateStatus before deleting. */
export async function removeFromPalette({
  paletteId,
}: {
  paletteId: string
}): Promise<void> {
  const { supabase: db, garden } = await requireSessionGarden()
  const gardenId = garden.id

  const { data, error } = await db
    .from('palette_plants')
    .delete()
    .eq('id', paletteId)
    .eq('garden_id', gardenId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to remove from palette: ${error.message}`)
  if (!data) throw new Error('Palette row not found in the current garden')
}

/** The current garden's palette row for this plant, if any — drives button state in the drawer. */
export async function getPaletteStatus({
  plantId,
}: {
  plantId: string
}): Promise<{ paletteId: string; status: PaletteStatus } | null> {
  const { supabase: db, garden } = await requireSessionGarden()
  const gardenId = garden.id

  const { data, error } = await db
    .from('palette_plants')
    .select('id, status')
    .eq('garden_id', gardenId)
    .eq('plant_id', plantId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load palette status: ${error.message}`)
  if (!data) return null

  return { paletteId: data.id, status: data.status as PaletteStatus }
}

/** Palette rows for the signed-in user's garden, joined with their plants row. */
export async function listPalette({
  status,
}: {
  status?: PaletteStatus
} = {}): Promise<PalettePlant[]> {
  const { supabase: db, garden } = await requireSessionGarden()
  const gardenId = garden.id

  let query = db
    .from('palette_plants')
    .select(
      'id, garden_id, plant_id, status, source, notes, added_at, plants(*)'
    )
    .eq('garden_id', gardenId)
    .order('added_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load palette: ${error.message}`)

  return (data ?? [])
    .filter(
      (row): row is typeof row & { plants: DbPlant } => row.plants != null
    )
    .map((row) => ({
      id: row.id,
      gardenId: row.garden_id,
      plantId: row.plant_id,
      status: row.status as PaletteStatus,
      source: row.source as PaletteSource,
      notes: row.notes,
      addedAt: row.added_at,
      plant: row.plants,
    }))
}
