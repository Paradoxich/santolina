'use server'

// Garden writes run through the session client, scoped to the signed-in user's
// garden. RLS (`gardens.user_id = auth.uid()`) guarantees a user can only touch
// their own garden, so no application-level ownership check is needed.
// See docs/architecture.md#auth.
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface SetGardenLocationInput {
  city: string
  country: string
  lat: number
  lon: number
}

/**
 * Writes the picked location onto the signed-in user's garden. Used by both
 * the first-run location step and the dashboard's change-location modal.
 */
export async function setGardenLocation({
  city,
  country,
  lat,
  lon,
}: SetGardenLocationInput): Promise<void> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('gardens')
    .update({ city, country, lat, lon })
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error)
    throw new Error(`Failed to update garden location: ${error.message}`)
  if (!data) throw new Error('Garden not found')
}
