// SERVER-ONLY — session-scoped garden lookup for the authenticated user.
//
// The auth-era replacement for the deleted single-tenant `current-garden.ts`
// shim. Every user-scoped read/write resolves the garden from the session and
// runs through the session client, so RLS (`auth.uid() = user_id`) does the
// scoping — not application code. See docs/architecture.md §24.
import { cache } from 'react'
import { createSupabaseServerClient } from './supabase-server'
import type { Garden } from '@/types/garden'

export interface SessionGardenContext {
  userId: string
  garden: Garden | null
}

/**
 * The signed-in user and their garden, or null when there is no session.
 * Nullable garden is expected only between signup and the first-run location
 * step. Wrapped in React `cache()` so the layout, page, and plant-detail all
 * share one lookup per request instead of re-hitting the auth server.
 */
export const getSessionGardenContext = cache(
  async (): Promise<SessionGardenContext | null> => {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('gardens')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(`Failed to load garden: ${error.message}`)

    return { userId: user.id, garden: (data as Garden) ?? null }
  }
)

/**
 * Resolves the signed-in user's garden for a mutation, returning the session
 * client to run it through. Throws if there's no session or no garden — both
 * are "impossible" states behind the auth gate + first-run step, so throwing
 * (rather than silently no-op'ing) surfaces a real bug if either is missing.
 */
export async function requireSessionGarden(): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  userId: string
  garden: Garden
}> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('gardens')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load garden: ${error.message}`)
  if (!data) throw new Error('No garden for the signed-in user')

  return { supabase, userId: user.id, garden: data as Garden }
}
