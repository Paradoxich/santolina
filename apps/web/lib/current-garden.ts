// SERVER-ONLY — uses the service-role client, bypasses RLS.
import { getSupabaseAdmin } from './supabase-admin'
import type { Garden } from '@/types/garden'

/**
 * TEMPORARY — replace with real session-based garden lookup once
 * auth/onboarding exists. Do not build additional features assuming
 * this hardcoded id is permanent.
 *
 * gardens/palette_plants RLS policies require auth.uid() to match the
 * garden's owner, and there's no real auth session yet — the anon
 * client silently gets zero rows back from those tables. Rather than
 * loosen RLS (which is correct for when auth exists), reads/writes to
 * these two tables go through the service-role client instead, scoped
 * to this one seeded garden. Single-tenant test phase only.
 */
const CURRENT_GARDEN_ID = '7055368c-6158-46b9-a592-223974c7a319'

export function getCurrentGardenId(): string {
  return CURRENT_GARDEN_ID
}

export async function getCurrentGarden(): Promise<Garden | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('gardens')
    .select('*')
    .eq('id', getCurrentGardenId())
    .maybeSingle()

  if (error) throw new Error(`Failed to load garden: ${error.message}`)

  return data as Garden | null
}
