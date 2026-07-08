'use server'

// Writes to gardens go through the service-role client, scoped to the one
// hardcoded garden id — see lib/current-garden.ts and docs/architecture.md §11.
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentGardenId } from '@/lib/current-garden'

interface SetGardenLocationInput {
  city: string
  country: string
  lat: number
  lon: number
}

/** Writes the picked location onto the current garden's row. */
export async function setGardenLocation({
  city,
  country,
  lat,
  lon,
}: SetGardenLocationInput): Promise<void> {
  const db = getSupabaseAdmin()
  const gardenId = getCurrentGardenId()

  const { data, error } = await db
    .from('gardens')
    .update({ city, country, lat, lon })
    .eq('id', gardenId)
    .select('id')
    .maybeSingle()

  if (error)
    throw new Error(`Failed to update garden location: ${error.message}`)
  if (!data) throw new Error('Garden not found')
}
