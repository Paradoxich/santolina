'use server'

// Two write paths live here during the auth transition (docs/architecture.md §24):
//  - setGardenLocation: legacy shim — service-role client, hardcoded garden id.
//    Still used by the dashboard LocationPickerModal until the RLS cutover.
//  - setGardenLocationForCurrentUser: auth-era — session client, the signed-in
//    user's own garden, RLS-enforced. Backs the first-run location step.
// Item 5 collapses these into one (session-only) and deletes the shim.
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentGardenId } from '@/lib/current-garden'
import { createSupabaseServerClient } from '@/lib/supabase-server'

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

/**
 * Writes the picked location onto the signed-in user's garden via the session
 * client. RLS (`auth.uid() = user_id`) guarantees a user can only touch their
 * own garden, so no application-level ownership check is needed.
 */
export async function setGardenLocationForCurrentUser({
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
