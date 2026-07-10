// SERVER-ONLY — session-scoped garden lookup for the authenticated user.
//
// The auth-era replacement for the deleted single-tenant `current-garden.ts`
// shim. Every user-scoped read/write resolves the garden from the session and
// runs through the session client, so RLS (`auth.uid() = user_id`) does the
// scoping — not application code. See docs/architecture.md §24.
import { cache } from 'react'
import { createSupabaseServerClient } from './supabase-server'
import type { Garden } from '@/types/garden'

export interface SessionProfile {
  email: string | null
  displayName: string | null
  avatarUrl: string | null
}

export interface SessionGardenContext {
  userId: string
  garden: Garden | null
  profile: SessionProfile
}

/**
 * The signed-in user (garden + profile), or null when there is no session.
 * Nullable garden is expected only between signup and the first-run location
 * step. Profile comes from the `users` table (populated by the signup trigger,
 * and the eventual source of truth for editable display name). Wrapped in React
 * `cache()` so the layout, pages, and plant-detail share one lookup per request
 * instead of re-hitting the auth server.
 */
export const getSessionGardenContext = cache(
  async (): Promise<SessionGardenContext | null> => {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const [gardenRes, profileRes] = await Promise.all([
      supabase
        .from('gardens')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('users')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    if (gardenRes.error)
      throw new Error(`Failed to load garden: ${gardenRes.error.message}`)

    return {
      userId: user.id,
      garden: (gardenRes.data as Garden) ?? null,
      profile: {
        email: user.email ?? null,
        displayName: profileRes.data?.display_name ?? null,
        avatarUrl: profileRes.data?.avatar_url ?? null,
      },
    }
  }
)

/**
 * Resolves the signed-in user's garden for a mutation, returning the session
 * client to run it through. Reuses the cached `getSessionGardenContext`, so
 * multiple callers in one request (e.g. the dashboard's listPalette +
 * getPlantDiaries + page context) share a single auth + garden lookup instead
 * of each re-hitting the auth server. Throws if there's no session or no garden
 * — both are "impossible" states behind the auth gate + first-run step, so
 * throwing (rather than silently no-op'ing) surfaces a real bug if either is
 * missing.
 */
export async function requireSessionGarden(): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  userId: string
  garden: Garden
}> {
  const ctx = await getSessionGardenContext()
  if (!ctx) throw new Error('Not signed in')
  if (!ctx.garden) throw new Error('No garden for the signed-in user')

  const supabase = await createSupabaseServerClient()
  return { supabase, userId: ctx.userId, garden: ctx.garden }
}
